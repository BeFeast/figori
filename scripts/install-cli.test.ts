import { expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

test("Figori installer and rollback preserve legacy CLI and restore exact prior Figori state", async () => {
  const home = await mkdtemp(join(tmpdir(), "figori-install-"));
  const artifact = join(home, "artifact");
  const payload = "#!/bin/sh\necho Figori\n";
  const checksum = createHash("sha256").update(payload).digest("hex");
  const run = async (script: string, args: string[]) => {
    const child = Bun.spawn(
      ["bash", join(import.meta.dir, script), "--apply", ...args],
      {
        env: { ...process.env, HOME: home },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    return await child.exited;
  };
  try {
    await mkdir(join(home, ".local/bin"), { recursive: true });
    await writeFile(artifact, payload);
    const legacy = join(home, ".local/bin/my-numi");
    const figori = join(home, ".local/bin/figori");
    await writeFile(legacy, "legacy unchanged");
    for (const existing of [false, true]) {
      if (existing) await writeFile(figori, "prior figori");
      const backup = join(home, existing ? "backup-existing" : "backup-absent");
      expect(
        await run("install-cli-user.sh", [artifact, checksum, backup]),
      ).toBe(0);
      expect(await readFile(figori, "utf8")).toBe(payload);
      expect(await readFile(legacy, "utf8")).toBe("legacy unchanged");
      expect(await run("rollback-cli-user.sh", [backup])).toBe(0);
      if (existing) expect(await readFile(figori, "utf8")).toBe("prior figori");
      else expect(await Bun.file(figori).exists()).toBe(false);
    }
    const oldBackup = join(home, "old-backup");
    await mkdir(oldBackup);
    await writeFile(join(oldBackup, "installed-sha256"), checksum);
    await writeFile(join(oldBackup, "cli-absent"), "");
    expect(await run("rollback-cli-user.sh", [oldBackup])).toBe(2);
    expect(await readFile(figori, "utf8")).toBe("prior figori");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
