import { elapsedDurationPresentation } from "./model";
import { test, expect } from "bun:test";
import { evaluateExpression } from "@my-numi/core";
import {
  evaluateDocument,
  importDocument,
  serializeFigori,
} from "@my-numi/document";
import {
  displayResult,
  editorText,
  fromEditor,
  openedWorksheet,
  openedState,
  recoveredState,
  recoverySnapshot,
  newNativeWorksheet,
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

test("native reopen and recovery retain document and duplicate-line identities", () => {
  const doc = importDocument("# Notes\r\nprice = 12\nprice = 12\n", {
    format: "markdown",
    settings: {
      timezone: "UTC",
      anchor: { mode: "fixed", date: "2024-02-01" },
    },
  });
  const opened = openedState({
    path: "/tmp/Notes.figori",
    source: serializeFigori(doc),
    sourceHash: "physical-file-hash",
  });
  expect(opened.document).toEqual(doc);
  expect(opened.path).toBe("/tmp/Notes.figori");
  expect(opened.sourceHash).toBe("physical-file-hash");
  expect(opened.dirty).toBe(false);
  const recovery = recoveredState(
    recoverySnapshot(doc, opened.path, opened.sourceHash, true),
  );
  expect(recovery.document).toEqual(doc);
  expect(recovery.dirty).toBe(true);
  expect(recovery.sourceHash).toBe("physical-file-hash");
});
test("interchange import and legacy recovery detach original save destinations", () => {
  const opened = openedState({
    path: "/tmp/original.md",
    source: "# Notes\nprice=12",
    sourceHash: "original-hash",
  });
  expect(opened.path).toBeNull();
  expect(opened.sourceHash).toBeNull();
  expect(opened.dirty).toBe(true);
  expect(opened.originPath).toBe("/tmp/original.md");
  expect(opened.document.format).toBe("markdown");
  const legacy = recoveredState({
    path: "/tmp/original.numi",
    source: "price=99",
    sourceHash: "old",
    settings: opened.document.settings,
    dirty: false,
  });
  expect(legacy.path).toBeNull();
  expect(legacy.sourceHash).toBeNull();
  expect(legacy.originPath).toBe("/tmp/original.numi");
  expect(legacy.dirty).toBe(true);
  expect(legacy.document.source).toBe("price=99");
  const restored = recoveredState(
    recoverySnapshot(opened.document, null, null, true, opened.originPath),
  );
  expect(restored.originPath).toBe(opened.originPath);
  expect(restored.document.id).toBe(opened.document.id);
});
test("corrupt native input rejects without mutating an existing worksheet", () => {
  const doc = importDocument("price=12", { format: "numi" });
  const before = JSON.stringify(doc);
  expect(() =>
    openedState({
      path: "/tmp/broken.figori",
      source: "not a native worksheet",
      sourceHash: "hash",
    }),
  ).toThrow();
  expect(JSON.stringify(doc)).toBe(before);
  expect(() =>
    recoveredState({
      format: "future",
      source: "",
      settings: doc.settings,
      path: null,
      sourceHash: null,
      dirty: true,
    }),
  ).toThrow();
});

test("new native worksheets use Markdown semantics and keep fenced calculations inert", () => {
  const doc = fromEditor(
    newNativeWorksheet(),
    "# Plan\n```\nhidden = 99\n```\nprice=12",
  );
  expect(doc.format).toBe("markdown");
  const evaluated = evaluateDocument(doc, evaluateExpression, {});
  expect(evaluated.variables.hidden).toBeUndefined();
  expect(evaluated.variables.price).toBeDefined();
});

test("native recovery without a format discriminator restores container metadata", () => {
  const doc = importDocument("# Notes\r\nprice=12\nprice=12\n", {
    format: "markdown",
    settings: { timezone: "UTC", anchor: { mode: "fixed", date: "2024-02-01" } },
  });
  const recovery = {
    source: serializeFigori(doc), path: "/tmp/Notes.FIGORI",
    sourceHash: "physical-baseline", settings: doc.settings, dirty: true,
  };
  const before = JSON.stringify(recovery);
  const restored = recoveredState(recovery);
  expect(restored.document).toEqual(doc);
  expect(restored.path).toBe(recovery.path);
  expect(restored.sourceHash).toBe(recovery.sourceHash);
  expect(restored.dirty).toBe(true);
  expect(restored.originPath).toBeNull();
  expect(JSON.stringify(recovery)).toBe(before);
  expect(recoveredState({ ...recovery, dirty: false }).dirty).toBe(false);
});

test("legacy interchange recovery never guesses native format from delimiters", () => {
  const doc = importDocument("price=12", { format: "numi" });
  const source = serializeFigori(doc);
  const restored = recoveredState({ source, path: "/tmp/original.numi", sourceHash: "old", settings: doc.settings, dirty: false });
  expect(restored.document.source).toBe(source);
  expect(restored.path).toBeNull();
  expect(restored.originPath).toBe("/tmp/original.numi");
  expect(restored.dirty).toBe(true);
});

test("invalid native legacy recovery fails without changing the recovery payload", () => {
  const settings = importDocument("", { format: "numi" }).settings;
  for (const source of ["price=12", "+++\nformat='figori'\nschema_version=999\n+++\nprice=12"]) {
    const recovery = { source, path: "/tmp/broken.figori", sourceHash: "baseline", settings, dirty: true };
    const before = JSON.stringify(recovery);
    expect(() => recoveredState(recovery)).toThrow();
    expect(JSON.stringify(recovery)).toBe(before);
  }
});

test("elapsed timestamp duration presentation shares compact text and exact tooltip data", () => {
 const interval={start:{kind:"datetime",iso:"2023-10-07T06:00:00Z"},end:{kind:"datetime",iso:"2026-09-17T20:00:00Z"}};
 const make=(amount:string,unit="days")=>({kind:"quantity",amount,unit,interval});
 expect(elapsedDurationPresentation(make("1076.62412644"))).toEqual({display:"1076 days 14 hours 58 minutes 44 seconds",exact:"1076.62412644 days"});
 expect(elapsedDurationPresentation(make("-1.5"))?.display).toBe("−(1 day 12 hours)");
 expect(elapsedDurationPresentation(make("1.5","hours"))?.display).toBe("1 hour 30 minutes");
 expect(elapsedDurationPresentation(make("0.9999","seconds"))?.display).toBe("0 seconds");
 expect(elapsedDurationPresentation(make("9007199254740993","days"))?.display).toBe("9007199254740993 days");
 expect(elapsedDurationPresentation({...make("1.5"),interval:undefined})).toBeUndefined();
 expect(elapsedDurationPresentation({...make("1.5"),interval:{start:{kind:"date"},end:{kind:"date"}}})).toBeUndefined();
 expect(elapsedDurationPresentation(make("1.5","months"))).toBeUndefined();
 expect(elapsedDurationPresentation({kind:"money",amount:"1.5",currency:"USD"})).toBeUndefined();
});
