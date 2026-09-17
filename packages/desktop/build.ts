import { mkdir, copyFile } from "node:fs/promises";
await mkdir("dist", { recursive: true });
const result = await Bun.build({
  entrypoints: ["src/main.ts"],
  outdir: "dist",
  target: "browser",
  format: "esm",
  minify: true,
  sourcemap: "external",
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
await Promise.all([
  copyFile("index.html", "dist/index.html"),
  copyFile("src/style.css", "dist/style.css"),
]);
