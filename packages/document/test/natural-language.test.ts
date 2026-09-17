import { expect, test } from "bun:test";
import { importDocument, evaluateDocument } from "../src/index";
import { evaluateExpression } from "../../core/src/index";
test("supported natural language calculations remain expressions in both source formats", () => {
  for (const format of ["numi", "markdown"] as const) {
    const doc = importDocument(
      "15% of 490\n$3k earnings ÷ 5 people\nlunch was $55 + 25% tip\nlunch was 55\nOur lunch was lovely",
      { format },
    );
    const result = evaluateDocument(doc, evaluateExpression, {
      now: "2026-09-17T12:00:00Z",
    });
    expect(
      result.lines.slice(0, 4).map((l) => l.evaluation?.formatted),
    ).toEqual(["73.5", "$600.00", "$68.75", "55"]);
    expect(result.lines[4]?.kind).toBe("heading");
  }
});

test("cross-line percentage variables retain metadata and relative meaning", () => {
  const doc = importDocument(
    "tip_rate = 25%\n55 + tip_rate\n55 + (tip_rate * 2)",
    { format: "numi" },
  );
  const r = evaluateDocument(doc, evaluateExpression, {
    now: "2026-09-17T12:00:00Z",
  });
  expect(r.lines.slice(1).map((l) => l.evaluation?.formatted)).toEqual([
    "68.75",
    "82.5",
  ]);
  expect(r.variables.tip_rate).toEqual({
    kind: "number",
    amount: "0.25",
    percentage: true,
  });
});
