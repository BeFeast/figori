import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importDocument, updateDocument, serializeNumi, evaluateDocument, type Evaluation } from "../src/index";
import { saveDocument, loadDocument, listDocuments, importFile, exportNumi } from "../src/storage";

const temporary: string[] = [];
async function directory() { const value = await mkdtemp(join(tmpdir(), "my-numi-document-")); temporary.push(value); return value; }
afterEach(async () => { await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

describe("source fidelity", () => {
  test("Numi round trip preserves BOM, Unicode, NBSP, mixed newline styles and unsupported source", () => {
    const source = "\uFEFF# Καλημέρα 2031/2032 (notes)\r\n\r\ncost = 120\u00a0nis\nunknown ?? 2\r; note\r";
    const document = importDocument(source, { format: "numi" });
    expect(serializeNumi(document).text).toBe(source);
    expect(document.lines.map((line) => line.source + line.ending).join("")).toBe(source);
    expect(document.lines[2]?.assignment).toBe("cost");
    expect(document.lines[2]?.expression).toBe("120 nis");
    expect(document.lines[3]?.kind).toBe("expression");
  });

  test("Markdown historical RHS is distinct from assignments, headings and labels", () => {
    const source = "Budget 2031/2032 (example)\n\nrate = 25\nrate * 4 = 100\nnext = rate * 5 = 125\nCoffee: 2 + 3 = 5\n3 mar 2031 6:00AM = old value\n";
    const document = importDocument(source, { format: "markdown" });
    expect(document.lines[0]?.kind).toBe("heading");
    expect(document.lines[2]?.assignment).toBe("rate");
    expect(document.lines[2]?.historicalResult).toBeUndefined();
    expect(document.lines[3]?.expression).toBe("rate * 4");
    expect(document.lines[4]?.assignment).toBe("next");
    expect(document.lines[4]?.historicalResult).toBe("125");
    expect(document.lines[5]?.label).toBe("Coffee");
    expect(document.lines[6]?.expression).toBe("3 mar 2031 6:00 Am");
    expect(document.source).toBe(source);
    expect(serializeNumi(document).text).toBe("Budget 2031/2032 (example)\n\nrate = 25\nrate * 4\nnext = rate * 5\nCoffee: 2 + 3\n3 mar 2031 6:00AM\n");
  });

  test("identities survive insertions, moves, edits and duplicate blank lines", () => {
    const original = importDocument("a = 1\n\nb = 2\n\na+b", { format: "numi" });
    const edited = updateDocument(original, "# New\nb = 2\n\na = 1\n\na+b");
    expect(edited.id).toBe(original.id);
    expect(edited.lines.find((line) => line.source === "a = 1")?.id).toBe(original.lines[0]?.id);
    expect(edited.lines.find((line) => line.source === "b = 2")?.id).toBe(original.lines[2]?.id);
    expect(new Set(edited.lines.map((line) => line.id)).size).toBe(edited.lines.length);
    const replacement = updateDocument(original, "a = 3\n\nb = 2\n\na+b");
    expect(replacement.lines[0]?.id).toBe(original.lines[0]?.id);
  });

  test("empty source round trips and fixed anchors reject invalid calendar dates", () => {
    expect(serializeNumi(importDocument("", { format: "numi" })).text).toBe("");
    expect(() => importDocument("1", { format: "numi", settings: { anchor: { mode: "fixed", date: "2031-02-29" } } })).toThrow("Invalid fixed");
  });
});

describe("injected evaluation", () => {
  test("assignments propagate failures without losing independent results or executing source", () => {
    const document = importDocument("x = fail\nx + 1\n4\nx = 8\nx\nprocess.exit(1)", { format: "numi" });
    const clocks: string[] = [];
    const evaluator = (source: string, context: { variables: Record<string, number>; now: string }): Evaluation<number> => {
      clocks.push(context.now);
      if (/^\d+$/.test(source)) return { ok: true, value: Number(source), formatted: source, diagnostics: [] };
      if (Object.hasOwn(context.variables, source)) return { ok: true, value: context.variables[source], diagnostics: [] };
      return { ok: false, diagnostics: [{ code: "unsupported", message: source }] };
    };
    const result = evaluateDocument(document, evaluator, { now: "2031-04-05T06:00:00Z" });
    expect(result.lines[1]?.evaluation?.diagnostics[0]?.code).toBe("dependency-error");
    expect(result.lines[2]?.evaluation?.value).toBe(4);
    expect(result.lines[4]?.evaluation?.value).toBe(8);
    expect(result.lines[5]?.evaluation?.diagnostics[0]?.code).toBe("unsupported");
    expect(new Set(clocks)).toEqual(new Set(["2031-04-05T06:00:00Z"]));
    expect(result.variables.x).toBe(8);
    expect(serializeNumi(document).text).toContain("process.exit(1)");
  });

  test("prototype-like assignments stay data and evaluator exceptions isolate lines", () => {
    const document = importDocument("__proto__ = 7\nexplode(1)\n2", { format: "numi" });
    const result = evaluateDocument(document, (source): Evaluation<number> => {
      if (source.startsWith("explode")) throw new Error("unsupported");
      return { ok: true, value: Number(source), diagnostics: [] };
    }, {});
    expect(result.variables.__proto__).toBe(7);
    expect(Object.getPrototypeOf(result.variables)).toBeNull();
    expect(result.lines[1]?.evaluation?.ok).toBeFalse();
    expect(result.lines[2]?.evaluation?.value).toBe(2);
  });
});

describe("persistent storage and interchange", () => {
  test("save/load retains ids, original source and chosen policies after restart", async () => {
    const directoryPath = await directory();
    const document = importDocument("# Example\r\n2+3 = 5\r\n", { format: "markdown", settings: { timezone: "Europe/London", anchor: { mode: "fixed", date: "2032-02-29" }, billing: "include-partial" } });
    const options = { directory: directoryPath };
    await saveDocument(document, options);
    const loaded = await loadDocument(document.id, options);
    expect(loaded).toEqual({ document, recovered: false });
    expect((await listDocuments(options))[0]?.title).toBe("Example");
    const updated = updateDocument(document, "# Example\n3+4 = 7");
    await saveDocument(updated, options);
    const target = join(directoryPath, document.id + ".json");
    await writeFile(target, "{interrupted");
    const recovery = await loadDocument(document.id, options);
    expect(recovery.recovered).toBeTrue();
    expect(recovery.document.source).toBe(document.source);
    await saveDocument(recovery.document, options);
    expect((await loadDocument(document.id, options)).recovered).toBeFalse();
  });

  test("tampered source checksum falls back to recovery; traversal and concurrent writers rejected", async () => {
    const directoryPath = await directory();
    const options = { directory: directoryPath };
    const document = importDocument("2+2", { format: "numi" });
    const target = await saveDocument(document, options);
    const snapshot = JSON.parse(await readFile(target.path, "utf8"));
    snapshot.document.source = "changed";
    await writeFile(target.path, JSON.stringify(snapshot));
    expect((await loadDocument(document.id, options)).recovered).toBeTrue();
    await mkdir(target.path + ".lock");
    await expect(saveDocument(document, options)).rejects.toThrow("save already");
    await expect(loadDocument("../escape", options)).rejects.toThrow("Invalid worksheet id");
  });

  test("import does not touch original; export is UTF8 text plus validated versioned sidecar", async () => {
    const directoryPath = await directory();
    const original = join(directoryPath, "input.md");
    const source = "# Ελληνικά 2030/2031\n\n8 * 2 = 16\n";
    await writeFile(original, source);
    const document = await importFile(original, { settings: { anchor: { mode: "fixed", date: "2030-01-31" }, billing: "include-partial" } });
    await saveDocument(document, { directory: join(directoryPath, "state") });
    expect(await readFile(original, "utf8")).toBe(source);
    const path = join(directoryPath, "output.numi");
    const result = await exportNumi(document, path);
    expect(result.warnings.join(" ")).toContain("timezone");
    expect(await readFile(path, "utf8")).toBe("# Ελληνικά 2030/2031\n\n8 * 2\n");
    const imported = await importFile(path);
    expect(imported.settings).toEqual(document.settings);
    expect(imported.lines.map((line) => line.id)).toEqual(document.lines.map((line) => line.id));
    await expect(exportNumi(document, path)).rejects.toThrow("already exists");
    await writeFile(path, "edited externally");
    await expect(importFile(path)).rejects.toThrow("checksum mismatch");
    expect((await importFile(path, { readSidecar: false })).source).toBe("edited externally");
  });

  test("rejects invalid UTF8 rather than corrupting import; standalone export omits metadata", async () => {
    const directoryPath = await directory();
    const path = join(directoryPath, "bad.numi");
    await writeFile(path, new Uint8Array([0xff, 0xfe]));
    await expect(importFile(path)).rejects.toThrow();
    const output = join(directoryPath, "standalone.numi");
    await exportNumi(importDocument("7", { format: "numi" }), output, { sidecar: false });
    await expect(readFile(output + ".my-numi.json")).rejects.toThrow();
    expect(await readFile(output, "utf8")).toBe("7");
  });
});

test("plain captured headings with quotes, years and dash markers stay headings", () => {
  const doc = importDocument('Renting "Maple" House\nNo sweets — #3\nPlan 2033/2034 (draft)\ntoday = 5 april 2031\nunknown(2) = ???', {format:"markdown"});
  expect(doc.lines.slice(0,3).map(line => line.kind)).toEqual(["heading","heading","heading"]);
  expect(doc.lines[3]?.expression).toBe("today");
  expect(doc.lines[3]?.assignment).toBeUndefined();
  expect(doc.lines[4]?.kind).toBe("expression");
});

test("one irrecoverable worksheet does not hide healthy documents", async () => {
  const directoryPath = await directory();
  const options = {directory:directoryPath};
  const doc = importDocument("2+2", {format:"numi"});
  await saveDocument(doc,options);
  await writeFile(join(directoryPath,"broken.json"),"bad");
  const items = await listDocuments(options);
  expect(items).toHaveLength(2);
  expect(items.find(item => item.id === "broken")?.error).toContain("Cannot open");
  expect(items.find(item => item.id === doc.id)?.error).toBeUndefined();
});

test("question headings and prose time units are not expressions", () => { const doc=importDocument("Reward?\nNo snacks (every day)",{format:"markdown"});expect(doc.lines.map(line=>line.kind)).toEqual(["heading","heading"]); });

test("standalone named references evaluate while prose headings stay headings", () => {
 const doc=importDocument("rent = 12\nrent\nSummary for the year\ntotal = 34\ntotal\nsum = 56\nsum",{format:"numi"});
 const result=evaluateDocument(doc,(source,ctx):Evaluation<number>=>{const value=ctx.variables[source] ?? Number(source);return Number.isFinite(value)?{ok:true,value,diagnostics:[]}:{ok:false,diagnostics:[{code:"unknown_variable",message:"Unknown variable"}]};},{});
 expect(result.lines[1]?.evaluation?.value).toBe(12);expect(result.lines[4]?.evaluation?.value).toBe(34);expect(result.lines[6]?.evaluation?.value).toBe(56);expect(result.lines[2]?.evaluation).toBeUndefined();
});

test("malformed snapshot filename cannot hide healthy worksheets", async()=>{const dir=await directory();const doc=importDocument("3+4",{format:"numi"});await saveDocument(doc,{directory:dir});await writeFile(join(dir,"invalid name.json"),"{}");const rows=await listDocuments({directory:dir});expect(rows.find(row=>row.id===doc.id)?.error).toBeUndefined();expect(rows.find(row=>row.id==="invalid name")?.error).toContain("Invalid worksheet id");});
