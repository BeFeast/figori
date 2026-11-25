import { expect, test } from "bun:test";
import { importDocument } from "@my-numi/document";
import { appendLine, replaceLine } from "./line-editor";

const sheet = (source: string) =>
  importDocument(source, {
    format: "numi",
    id: "existing-sheet",
    settings: {
      timezone: "Asia/Jerusalem",
      anchor: { mode: "fixed", date: "2024-02-29" },
      billing: "include-partial",
    },
  });

test("append preserves original bytes, trailing blanks, and newline convention", () => {
  for (const [before, after] of [
    ["", "  2 + 3  "],
    ["1+1", "1+1\n  2 + 3  "],
    ["1+1\r\n", "1+1\r\n  2 + 3  \r\n"],
    ["\uFEFF1+1\r\n\r\n", "\uFEFF1+1\r\n\r\n  2 + 3  \r\n"],
    ["1+1\r\n// note\n\n", "1+1\r\n// note\n\n  2 + 3  \n"],
    ["1+1\r// note", "1+1\r// note\r  2 + 3  "],
  ]) {
    const original = sheet(before!);
    const next = appendLine(original, "  2 + 3  ");
    expect(next.source).toBe(after!);
    expect(original.source).toBe(before!);
    expect(next.id).toBe(original.id);
    expect(next.settings).toEqual(original.settings);
    if (before!.length)
      expect(
        next.lines.slice(0, original.lines.length).map((x) => x.id),
      ).toEqual(original.lines.map((x) => x.id));
  }
});

test("replace by ID preserves duplicate row identities, mixed endings and blank rows", () => {
  const original = sheet("\uFEFF// heading\r\n1+1\n2+2\r\n\r\n");
  const next = replaceLine(original, original.lines[1]!.id, "2+2");
  expect(next.source).toBe("\uFEFF// heading\r\n2+2\n2+2\r\n\r\n");
  expect(next.lines.map((x) => x.id)).toEqual(original.lines.map((x) => x.id));
  expect(next.settings).toEqual(original.settings);
  expect(original.lines[1]!.source).toBe("1+1");
  const duplicate = appendLine(next, "2+2");
  expect(new Set(duplicate.lines.map((x) => x.id)).size).toBe(
    duplicate.lines.length,
  );
  expect(duplicate.lines.slice(0, next.lines.length).map((x) => x.id)).toEqual(
    next.lines.map((x) => x.id),
  );
});

test("invalid composer input and stale line IDs do not alter the worksheet", () => {
  const original = sheet("1+1\r\n");
  for (const text of ["", "  ", "a\nb", "a\rb", "a\r\nb"]) {
    expect(() => appendLine(original, text)).toThrow();
    expect(() => replaceLine(original, original.lines[0]!.id, text)).toThrow();
  }
  expect(() => replaceLine(original, "removed-id", "2+2")).toThrow(
    "no longer exists",
  );
  expect(original.source).toBe("1+1\r\n");
});

test("editing the first row preserves the UTF-8 BOM", () => {
  const original = sheet("\uFEFF1+1\r\n");
  expect(replaceLine(original, original.lines[0]!.id, "2+2").source).toBe(
    "\uFEFF2+2\r\n",
  );
});

test("editing a saved variable recomputes its dependent worksheet result", async () => {
  const { evaluateDocument } = await import("@my-numi/document");
  const { evaluateExpression } = await import("@my-numi/core");
  const first = appendLine(sheet(""), "price = 12");
  const second = appendLine(first, "price * 3");
  const result = (doc: typeof second) =>
    evaluateDocument(doc, evaluateExpression, {
      now: "2024-02-01T12:00:00Z",
    }).lines.at(-1)?.evaluation;
  expect(result(second)?.formatted).toBe("36");
  const edited = replaceLine(second, second.lines[0]!.id, "price = 20");
  expect(result(edited)?.formatted).toBe("60");
  expect(edited.lines.map((line) => line.id)).toEqual(
    second.lines.map((line) => line.id),
  );
  expect(second.source).toBe("price = 12\nprice * 3");
});
