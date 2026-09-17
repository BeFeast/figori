import { expect, test } from "bun:test";
import { EditorState } from "@codemirror/state";
import { CompletionContext } from "@codemirror/autocomplete";
import { worksheetCompletions } from "./completion";
function complete(doc: string, pos = doc.length, explicit = false) {
  return worksheetCompletions(
    new CompletionContext(EditorState.create({ doc }), pos, explicit),
    { now: "2026-09-17T12:00:00Z", timezone: "Asia/Jerusalem" },
  );
}
test("only prior variables are suggested with current values and no future definitions", () => {
  const doc = "price = 12\nprice * 3\npr\nfuture = 99";
  const pos = doc.indexOf("\npr\n") + 3;
  const result = complete(doc, pos)!;
  expect(result.from).toBe(pos - 2);
  expect(result.options.find((o) => o.label === "price")?.detail).toBe("12");
  expect(result.options.some((o) => o.label === "future")).toBe(false);
  expect(
    complete("price = 20\npr")!.options.find((o) => o.label === "price")
      ?.detail,
  ).toBe("20");
  expect(
    complete("cost = 20\npr")!.options.some((o) => o.label === "price"),
  ).toBe(false);
  expect(complete("pr")!.options.some((o) => o.label === "price")).toBe(false);
});
test("conversion and date-question contexts restrict suggestions to relevant values", () => {
  const units = complete("10 in ")!.options.map((o) => o.label);
  expect(units).toContain("weeks");
  expect(units).toContain("USD");
  expect(units).not.toContain("ln");
  const question = complete("years s")!;
  expect(question.from).toBe(0);
  expect(question.options.map((o) => o.label)).toEqual([
    "years since",
    "years until",
  ]);
  const doc = "event = 1 may 2025\nprice = 12\nyears since ev";
  const dates = complete(doc)!.options.map((o) => o.label);
  expect(dates).toContain("event");
  expect(dates).not.toContain("price");
  expect(dates).not.toContain("ln");
});
test("comments and definition names stay ordinary typing; CtrlSpace can open an empty expression", () => {
  expect(complete("// notes pr")).toBeNull();
  expect(complete("# Heading")).toBeNull();
  expect(complete("price = 12", 2)).toBeNull();
  expect(complete("")).toBeNull();
  const labels = complete("", 0, true)!.options.map((o) => o.label);
  expect(labels).toContain("ln");
  expect(labels).toContain("previous saturday");
  expect(labels).toContain("years until");
  expect(labels).not.toContain("sqrt");
});

test("currency to targets and symbol-valued variables remain readable", () => {
  const result = complete("10 USD to ")!;
  expect(result.options.map((o) => o.label)).toContain("EUR");
  expect(result.options.map((o) => o.label)).not.toContain("ln");
  expect(
    complete("pay = 12 USD\npa")!.options.find((o) => o.label === "pay")
      ?.detail,
  ).toBe("$12");
});

test("Markdown completion excludes fenced variable declarations", () => {
  const doc = "```\nsecret = 99\n```\nprice = 12\npr";
  const result = worksheetCompletions(
    new CompletionContext(EditorState.create({ doc }), doc.length, true),
    {},
    "markdown",
  )!;
  expect(result.options.some((o) => o.label === "secret")).toBe(false);
  expect(result.options.find((o) => o.label === "price")?.detail).toBe("12");
});

test("Markdown code fences do not offer calculator completions", () => {
  const doc = "```\npri\n```";
  expect(
    worksheetCompletions(
      new CompletionContext(EditorState.create({ doc }), 7, true),
      {},
      "markdown",
    ),
  ).toBeNull();
});

test("Numi-origin native documents keep fenced declarations and completions inert", () => {
 for(const format of ["numi", "markdown"] as const){
  const doc="visible = 12\n~~~\nhidden = 99\npri\n~~~\nvi";
  const inside=doc.indexOf("pri")+3;
  expect(worksheetCompletions(new CompletionContext(EditorState.create({doc}),inside,true),{},format)).toBeNull();
  const result=worksheetCompletions(new CompletionContext(EditorState.create({doc}),doc.length,true),{},format)!;
  expect(result.options.some(o=>o.label==="hidden")).toBe(false);
  expect(result.options.find(o=>o.label==="visible")?.detail).toBe("12");
 }
});
