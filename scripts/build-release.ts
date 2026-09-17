import { mkdir, cp, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";

const root = resolve(import.meta.dir, "..");
async function run(command: string[], cwd = root): Promise<string> {
  const process = Bun.spawn(command, {
    cwd,
    stdout: "pipe",
    stderr: "inherit",
  });
  const output = await new Response(process.stdout).text();
  if ((await process.exited) !== 0)
    throw new Error(`Command failed: ${command.join(" ")}`);
  return output.trim();
}
async function hash(path: string): Promise<string> {
  return createHash("sha256")
    .update(await Bun.file(path).arrayBuffer())
    .digest("hex");
}
const commit = await run(["git", "rev-parse", "HEAD"]);
if (await run(["git", "status", "--porcelain"]))
  throw new Error("Release requires a clean committed checkout");
const epoch = await run(["git", "show", "-s", "--format=%ct", "HEAD"]);
const label = commit.slice(0, 12);
const out = join(root, "dist", "releases", label);
const stage = join(out, "stage");
if (await Bun.file(join(out, "manifest.json")).exists())
  throw new Error(`Release already exists: ${out}`);
await mkdir(stage, { recursive: true });
await run([process.execPath, "install", "--frozen-lockfile"]);
await run([process.execPath, "run", "typecheck"]);
await run([process.execPath, "test"]);
await run([process.execPath, "run", "build"]);
await run([process.execPath, "run", "--cwd", "packages/raycast", "build"]);
const linux = join(out, "my-numi-linux-x64");
const mac = join(out, "my-numi-macos-arm64");
await run([
  process.execPath,
  "build",
  "packages/cli/src/index.ts",
  "--compile",
  "--target=bun-linux-x64",
  "--outfile",
  linux,
]);
await run([
  process.execPath,
  "build",
  "packages/cli/src/index.ts",
  "--compile",
  "--target=bun-darwin-arm64",
  "--outfile",
  mac,
]);
const linuxSmoke = JSON.parse(
  await run([linux, "--json", "--anchor", "2024-02-01", "1 month in days"]),
);
if (!linuxSmoke.ok || linuxSmoke.formatted !== "29 days")
  throw new Error("Linux artifact calendar smoke failed");
const tuiHelp = await run([linux, "--help"]);
if (!tuiHelp.includes("--tui"))
  throw new Error("Release CLI does not advertise the required TUI");

async function archive(directory: string, name: string): Promise<string> {
  const tar = join(out, name + ".tar");
  await run([
    "tar",
    "--sort=name",
    `--mtime=@${epoch}`,
    "--owner=0",
    "--group=0",
    "--numeric-owner",
    "-C",
    directory,
    "-cf",
    tar,
    ".",
  ]);
  await run(["gzip", "-n", tar]);
  return tar + ".gz";
}
const raycastStage = join(stage, "raycast");
await mkdir(raycastStage, { recursive: true });
await cp(join(root, "packages/raycast/dist"), join(raycastStage, "dist"), {
  recursive: true,
});
await cp(
  join(root, "packages/raycast/README.md"),
  join(raycastStage, "README.md"),
);
await Bun.write(
  join(raycastStage, "SOURCE.txt"),
  `Source commit: ${commit}\nFull rebuildable workspace is in my-numi-source-${label}.tar.gz.\nThis is a private build, not a Raycast Store publication.\n`,
);
await archive(raycastStage, `my-numi-raycast-${label}`);
const omarchyStage = join(stage, "omarchy");
await cp(join(root, "packages/omarchy"), omarchyStage, { recursive: true });
await cp(linux, join(omarchyStage, "my-numi"));
const innerFiles = ["my-numi", "Panel.qml", "manifest.json"];
await Bun.write(
  join(omarchyStage, "SHA256SUMS"),
  (
    await Promise.all(
      innerFiles.map(
        async (name) => `${await hash(join(omarchyStage, name))}  ${name}`,
      ),
    )
  ).join("\n") + "\n",
);
await archive(omarchyStage, `my-numi-omarchy-${label}`);
const sourceTar = join(out, `my-numi-source-${label}.tar`);
await run([
  "git",
  "archive",
  "--format=tar",
  "--prefix=my-numi/",
  "--output",
  sourceTar,
  commit,
]);
await run(["gzip", "-n", sourceTar]);
const files = (await readdir(out)).filter((name) => name !== "stage").sort();
const artifacts = await Promise.all(
  files.map(async (name) => ({
    name,
    sha256: await hash(join(out, name)),
    size: Bun.file(join(out, name)).size,
  })),
);
const manifest = {
  schemaVersion: 1,
  sourceCommit: commit,
  sourceDateEpoch: Number(epoch),
  bunVersion: Bun.version,
  artifacts,
  checks: {
    typecheck: "passed",
    tests: "passed",
    cliBuild: "passed",
    raycastBuild: "passed",
    linuxArtifactCalendarSmoke: "passed",
    macOSArtifactExecution: "not performed by this Linux build",
    desktopInstallation: "not performed",
  },
  notes: [
    "CLI includes TUI; no live application or host settings are changed by this build.",
    "Checksums bind these exact artifacts. Fixed tar timestamps/ownership and gzip headers make archives repeatable; byte-identical cross-compiler output across hosts is not asserted.",
  ],
};
await Bun.write(
  join(out, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
await Bun.write(
  join(out, "SHA256SUMS"),
  [
    ...artifacts.map((a) => `${a.sha256}  ${a.name}`),
    `${await hash(join(out, "manifest.json"))}  manifest.json`,
  ].join("\n") + "\n",
);
await run(["sha256sum", "--check", "SHA256SUMS"], out);
console.log(
  JSON.stringify(
    {
      directory: out,
      manifest: join(out, "manifest.json"),
      stagedOmarchy: omarchyStage,
      sourceCommit: commit,
    },
    null,
    2,
  ),
);
