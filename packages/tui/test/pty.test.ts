import { expect, test } from "bun:test";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// util-linux script supplies a real PTY. This checks terminal lifecycle rather
// than pretending a mocked stdin is interactive. macOS script has different flags.
test.skipIf(process.platform !== "linux")("real PTY edits, saves, exits, and reopens after process restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "my-numi-pty-"));
  const quote = (text: string) => "'" + text.replaceAll("'", "'\\''") + "'";
  const launch = () => {
    const command = "stty rows 18 cols 90 && exec " + quote(process.execPath) + " " + quote(join(import.meta.dir, "../src/main.ts"));
    const child = Bun.spawn(["script", "-qefc", command, "/dev/null"], {
      env: { ...process.env, MY_NUMI_DATA_DIR: directory, TERM: "xterm-256color" },
      stdin: "pipe", stdout: "pipe", stderr: "pipe",
    });
    let output = "";
    const collecting = (async () => {
      for await (const chunk of child.stdout) output += new TextDecoder().decode(chunk);
    })();
    const waitFor = async (text: string) => {
      const deadline = Date.now() + 4000;
      while (!output.includes(text) && Date.now() < deadline) await Bun.sleep(10);
      expect(output).toContain(text);
    };
    const exit = async () => {
      child.stdin.write("\x11");
      const outcome = await Promise.race([child.exited, Bun.sleep(4000).then(() => "timeout")]);
      if (outcome === "timeout") child.kill();
      expect(outcome).toBe(0);
      await collecting;
      expect(output).toContain("\x1b[?1049l");
    };
    return { child, waitFor, exit };
  };
  let active: ReturnType<typeof launch> | undefined;
  try {
    active = launch();
    await active.waitFor("Figori");
    active.child.stdin.write("12+3");
    await active.waitFor("15");
    active.child.stdin.write("\x13");
    await active.waitFor("Saved ");
    await active.exit();
    expect((await readdir(directory)).filter(path => path.endsWith(".json")).length).toBe(2);
    active = launch();
    await active.waitFor("Figori");
    active.child.stdin.write("\x0f");
    await active.waitFor("Open saved worksheet");
    active.child.stdin.write("1\r");
    await active.waitFor("Opened saved worksheet.");
    await active.waitFor("12+3");
    await active.exit();
  } finally {
    active?.child.kill();
    await rm(directory, {recursive:true,force:true});
  }
}, 15_000);
