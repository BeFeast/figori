import { test, expect } from "bun:test";
import { evaluateExpression } from "@my-numi/core";
import { evaluateDocument, importDocument } from "@my-numi/document";
import {
  displayResult,
  editorText,
  fromEditor,
  openedWorksheet,
} from "./model";
test("continuous editor preserves mixed separators, BOM and blank rows", () => {
  const doc = importDocument("\uFEFFBudget\r\n\r\nprice = 12\nprice * 3\r\n", {
    format: "numi",
  });
  const unchanged = fromEditor(doc, editorText(doc.source));
  expect(unchanged.source).toBe(doc.source);
  const next = fromEditor(
    doc,
    editorText(doc.source).replace("price = 12", "price = 20"),
  );
  expect(next.source).toBe("\uFEFFBudget\r\n\r\nprice = 20\nprice * 3\r\n");
  expect(
    evaluateDocument(next, evaluateExpression, {
      now: "2032-02-01T12:00:00Z",
    }).lines.at(-1)?.evaluation?.formatted,
  ).toBe("60");
  expect(doc.source).toContain("price = 12");
});
test("multiline paste preserves new text, newline policy and trailing blank line", () => {
  const doc = importDocument("1+1\r\n", { format: "numi" });
  const next = fromEditor(doc, "1+1\n2+2\n\n");
  expect(next.source).toBe("1+1\r\n2+2\r\n\r\n");
  expect(next.id).toBe(doc.id);
});
test("captured import preserves source and evaluates only the current expression", () => {
  const doc = openedWorksheet({
    path: "/sample.numi",
    source: "2 + 2 = 4\n",
    sourceHash: "example",
  });
  expect(doc.source).toBe("2 + 2 = 4\n");
  expect(doc.lines[0]?.historicalResult).toBe("4");
  expect(
    evaluateDocument(doc, evaluateExpression, { now: "2032-02-01T12:00:00Z" })
      .lines[0]?.evaluation?.formatted,
  ).toBe("4");
});
test("display precision does not change exact large numeric or calendar values", () => {
  expect(displayResult("999999999999999999.999 USD", 2)).toBe(
    "1000000000000000000 USD",
  );
  expect(displayResult("-1.235 ILS", 2)).toBe("-1.24 ILS");
  expect(displayResult("1 year 3 months 4 days", 2)).toBe(
    "1 year 3 months 4 days",
  );
  expect(displayResult("1.23456789", 6)).toBe("1.234568");
});

test("Markdown files retain explicit parsing mode while Numi keeps compatibility", () => {
  expect(
    openedWorksheet({
      path: "/tmp/Notes.MD",
      source: "```\nx = 2\n```",
      sourceHash: "test",
    }).format,
  ).toBe("markdown");
  expect(
    openedWorksheet({
      path: "/tmp/Notes.numi",
      source: "x = 2",
      sourceHash: "test",
    }).format,
  ).toBe("numi");
});
