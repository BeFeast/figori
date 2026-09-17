import { test, expect } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleRequest, readRequest } from "./src/protocol.ts";

async function temporary(fn: (directory: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "my-numi-protocol-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
const settings = {
  timezone: "Asia/Jerusalem",
  anchor: { mode: "fixed" as const, date: "2024-02-01" },
  billing: "include-partial" as const,
};
test("versioned protocol rejects bad requests and returns request id", async () => {
  expect(
    await handleRequest({ version: 2, id: "x", op: "evaluate" }),
  ).toMatchObject({ version: 1, id: "x", ok: false });
  expect(
    await handleRequest({ version: 1, id: "x", op: "unknown" }),
  ).toMatchObject({ id: "x", ok: false });
  expect(
    await handleRequest({ version: 1, id: "x", op: "evaluate", source: "1+2" }),
  ).toMatchObject({ ok: true, data: { formatted: "3" } });
});
test("save/load/list/export/import preserve source settings and persistent line identities", async () =>
  temporary(async (directory) => {
    const source = "amount = 0.1 + 0.2\r\namount * 2\r\n";
    const send = (op: string, fields: Record<string, unknown> = {}) =>
      handleRequest({
        version: 1,
        id: "one",
        op,
        directory,
        ...fields,
      }) as Promise<any>;
    const saved = await send("document.save", { source, settings });
    expect(saved.ok).toBe(true);
    const documentId = saved.data.document.id;
    const loaded = await send("document.load", { documentId });
    expect(loaded.data.document.source).toBe(source);
    expect(loaded.data.document.settings).toEqual(settings);
    const edited = await send("document.save", {
      documentId,
      source: source + "1 month in days",
    });
    expect(edited.data.document.lines[0].id).toBe(
      saved.data.document.lines[0].id,
    );
    expect(edited.data.document.settings).toEqual(settings);
    const listed = await send("document.list");
    expect(listed.data.map((x: any) => x.id)).toContain(documentId);
    const path = join(directory, "out.numi");
    expect((await send("document.export", { documentId, path })).ok).toBe(true);
    expect(await readFile(path, "utf8")).toBe(source + "1 month in days");
    expect((await send("document.export", { documentId, path })).ok).toBe(
      false,
    );
    const imported = await send("document.import", { path });
    expect(imported.data.document.settings).toEqual(settings);
    const evaluated = await send("document.evaluate", { source, settings });
    expect(evaluated.data.lines[1].evaluation.formatted).toBe("0.6");
  }));
test("JSON line input accepts escaped multiline text without waiting for EOF", async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode(JSON.stringify({ source: "1+2\n4+5" }) + "\n"),
      );
    },
  });
  expect(await readRequest(stream)).toEqual({ source: "1+2\n4+5" });
});
test("actual CLI request subprocess exits after one JSON line with stdin still open", async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      new URL("./src/index.ts", import.meta.url).pathname,
      "--request",
    ],
    { stdin: "pipe", stdout: "pipe", stderr: "pipe" },
  );
  try {
    child.stdin.write(
      JSON.stringify({
        version: 1,
        id: "subprocess",
        op: "document.evaluate",
        source: "1 month in days",
        settings,
      }) + "\n",
    );
    await child.stdin.flush();
    const output = await new Response(child.stdout).text();
    expect(await child.exited).toBe(0);
    expect(JSON.parse(output)).toMatchObject({
      id: "subprocess",
      ok: true,
      data: { lines: [{ evaluation: { formatted: "29 days" } }] },
    });
  } finally {
    child.kill();
  }
});
test("rate loading stays offline and unavailable without cache", async () =>
  temporary(async (directory) => {
    expect(
      await handleRequest({
        version: 1,
        id: "rates",
        op: "rates.load",
        directory,
      }),
    ).toMatchObject({ ok: true, data: { status: "unavailable" } });
  }));
