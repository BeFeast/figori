import { expect, test } from "bun:test";
import { evaluateExpression as evaluate } from "./src/index";
const ctx = { now: "2026-09-17T12:00:00Z", timezone: "Asia/Jerusalem" };
test("supported percent and annotated money phrases", () => {
  for (const [source, result] of [
    ["15% of 490", "73.5"],
    ["-15% of 490", "-73.5"],
    ["100 + (-10%)", "90"],
    ["$3k earnings ÷ 5 people", "$600.00"],
    ["lunch was $55 + 25% tip", "$68.75"],
    ["$55 - 20%", "$44.00"],
    ["€2.5k / 5 persons", "€500.00"],
    ["2M + 1B", "1002000000"],
    ["2 m in cm", "200 cm"],
    ["100 * 10%", "10"],
  ]) {
    const r = evaluate(source!, ctx);
    expect(r.diagnostics).toEqual([]);
    expect(r.formatted).toBe(result!);
  }
});
test("annotations never swallow arbitrary words or exact variables", () => {
  for (const source of [
    "$3k earnigns / 5 people",
    "$55 + typo",
    "55 of 490",
    "5 unknown",
    "2monkeys",
  ]) {
    expect(evaluate(source, ctx).ok).toBe(false);
  }
  const variables = {
    earnings: { kind: "number" as const, amount: "9" },
    lunch: { kind: "number" as const, amount: "5" },
  };
  expect(evaluate("earnings + lunch", { ...ctx, variables }).formatted).toBe(
    "14",
  );
  expect(evaluate("5 earnings", { ...ctx, variables }).ok).toBe(false);
  expect(evaluate("lunch was $55", { ...ctx, variables }).ok).toBe(false);
  expect(evaluate("$3k / 0 people", ctx).diagnostics[0]?.code).toBe(
    "division_by_zero",
  );
});

test("stored and scaled percentages preserve relative arithmetic", () => {
  const percentage = evaluate("25%", ctx).value!;
  const stored = evaluate("55 + tip_rate", {
    ...ctx,
    variables: { tip_rate: percentage },
  });
  expect(stored.formatted).toBe("68.75");
  expect(evaluate("55 + (25% * 2)", ctx).formatted).toBe("82.5");
  // Explicit arithmetic preserves intended financial meaning without relying on provenance.
  expect(
    evaluate("55 * (1 + tip_rate)", {
      ...ctx,
      variables: { tip_rate: percentage },
    }).formatted,
  ).toBe("68.75");
});

test("percentage metadata survives JSON and scalar operations, but ratios cancel", () => {
  const p = evaluate("25%", ctx).value!;
  const c = { ...ctx, variables: { tip_rate: JSON.parse(JSON.stringify(p)) } };
  expect(evaluate("55 + tip_rate", c).formatted).toBe("68.75");
  expect(evaluate("55 + (tip_rate / 2)", c).formatted).toBe("61.875");
  expect(evaluate("55 + (-tip_rate)", c).formatted).toBe("41.25");
  expect(evaluate("25% * 20%", ctx).value).toEqual({
    kind: "number",
    amount: "0.05",
  });
  expect(evaluate("25% / 50%", ctx).value).toEqual({
    kind: "number",
    amount: "0.5",
  });
  expect(evaluate("100 / 25%", ctx).value).toEqual({
    kind: "number",
    amount: "400",
  });
  expect(evaluate("15% of 490", ctx).value).toEqual({
    kind: "number",
    amount: "73.5",
  });
});
