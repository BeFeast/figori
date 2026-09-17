import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluateExpression } from "../../core/src/index";
import { evaluateDocument, importDocument, serializeNumi } from "../src/index";
import { importFile, loadDocument, saveDocument } from "../src/storage";

const source = '\uFEFFExample:\r\n(1 apr 2025 - today) in years\u00a0=\u00a00 yr 4 mon. 3 w 23 h\r\nprice = 12\nprice * 2 = 24\r\nnext = price + 1 = 13\nДата:\nnow - 7 oct 2023 6:00am = 1 yr 2 h\n';
const clock = { now: "2026-09-17T12:00:00Z" };

test("captured results parse in both formats while assignments and source bytes remain intact", () => {
  for (const format of ["numi", "markdown"] as const) {
    const document = importDocument(source, { format });
    expect(document.lines[1]!.expression).toBe("(1 apr 2025 - today) in years");
    expect(document.lines[1]!.historicalResult).toBe("0 yr 4 mon. 3 w 23 h");
    expect(document.lines[2]!.assignment).toBe("price");
    expect(document.lines[2]!.historicalResult).toBeUndefined();
    expect(document.lines[4]!.assignment).toBe("next");
    expect(document.lines[5]!.kind).toBe("heading");
    expect(document.source).toBe(source);
    if (format === "numi") expect(serializeNumi(document).text).toBe(source);
    const results = evaluateDocument(document, evaluateExpression, clock).lines.filter(line => line.evaluation);
    expect(results.length).toBe(5);
    expect(results.every(line => line.evaluation!.ok)).toBe(true);
    expect(results[2]!.evaluation!.formatted).toBe("24");
  }
});

test("default .numi file import and saved stale parse metadata recover without rewriting source files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "figori-captured-import-"));
  try {
    const path = join(directory, "captured.numi");
    await writeFile(path, source);
    const document = await importFile(path);
    expect(document.format).toBe("numi");
    expect(document.lines[1]!.historicalResult).toBeDefined();
    await saveDocument(document, { directory });
    const savedPath = join(directory, document.id + ".json");
    const saved = JSON.parse(await readFile(savedPath, "utf8"));
    saved.document.lines[1].expression = saved.document.lines[1].source;
    delete saved.document.lines[1].historicalResult;
    const staleBytes = JSON.stringify(saved);
    await writeFile(savedPath, staleBytes);
    const { document: loaded } = await loadDocument(document.id, { directory });
    expect(loaded.lines[1]!.expression).toBe("(1 apr 2025 - today) in years");
    expect(loaded.lines.map(line => line.id)).toEqual(document.lines.map(line => line.id));
    expect(evaluateDocument(loaded, evaluateExpression, clock).lines.filter(line => line.evaluation).every(line => line.evaluation!.ok)).toBe(true);
    expect(await readFile(savedPath, "utf8")).toBe(staleBytes);
    expect(await readFile(path, "utf8")).toBe(source);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("ambiguous prose and equality are not silently converted to historical results", () => {
  for (const format of ["numi", "markdown"] as const) {
    const document = importDocument("status = ready\nAccount status = pending\n1 == 1\n1 >= 0\n", { format });
    expect(document.lines[0]!.assignment).toBe("status");
    expect(document.lines.every(line => line.historicalResult === undefined)).toBe(true);
  }
});
