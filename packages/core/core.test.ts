import { describe, test, expect } from "bun:test";
import {
  evaluateExpression as evaluate,
  countBillingMonths,
  type EvaluationContext,
} from "./src/index.ts";
const ctx: EvaluationContext = {
  now: "2024-02-01T10:00:00Z",
  timezone: "Asia/Jerusalem",
};
function value(s: string, c: EvaluationContext = ctx) {
  const r = evaluate(s, c);
  expect(r.diagnostics).toEqual([]);
  return r.formatted;
}
describe("exact expression arithmetic", () => {
  test("precedence, unary, parentheses, percent, ln", () => {
    expect(value("-(2+3)*4")).toBe("-20");
    expect(value("200 * 10%")).toBe("20");
    expect(value("ln(1)")).toBe("0");
    expect(value("0.1 + 0.2")).toBe("0.3");
    expect(Number(value("16*ln(13)+31"))).toBeCloseTo(72.0391897);
  });
  test("rejects unsafe or incomplete syntax", () => {
    for (const x of [
      "1/0",
      "ln(0)",
      "2+",
      "process.exit()",
      "1 m in kg",
      "29 feb 2023",
    ])
      expect(evaluate(x, ctx).ok).toBe(false);
  });
  test("units and variables", () => {
    expect(value("2 km in m")).toBe("2000 m");
    expect(
      value("a*2", {
        ...ctx,
        variables: { a: { kind: "number", amount: "4" } },
      }),
    ).toBe("8");
  });
});
describe("calendar context", () => {
  test("calendar month arithmetic constrains month end", () => {
    expect(value("13 may 2022 + 9 months")).toBe("2023-02-13");
    expect(value("31 jan 2024 + 1 month")).toBe("2024-02-29");
    expect(value("29 feb 2024 + 1 year")).toBe("2025-02-28");
  });
  test("anchor is dynamic or fixed and visible", () => {
    expect(value("1 month in days")).toBe("29 days");
    expect(
      value("1 month in days", {
        ...ctx,
        anchor: { mode: "fixed", date: "2023-02-01" },
      }),
    ).toBe("28 days");
    expect(evaluate("1 year in days", ctx).basis.anchorDate).toBe("2024-02-01");
  });
  test("date differences remain calendar days through historical offset changes", () => {
    expect(value("(1 jan 1900 - 31 dec 1899) in days")).toBe("1 days");
    expect(value("(1 mar 2024 - 28 feb 2024) in days")).toBe("2 days");
    expect(value("(28 feb 2024 - 1 mar 2024) in days")).toBe("-2 days");
  });
  test("dates and timestamps differ over DST", () => {
    const c = { ...ctx, timezone: "America/New_York" };
    expect(value("(11 mar 2024 - 10 mar 2024) in hours", c)).toBe("24 hours");
    expect(value("(11 mar 2024 00:00 - 10 mar 2024 00:00) in hours", c)).toBe(
      "23 hours",
    );
    expect(evaluate("10 mar 2024 2:30", c).diagnostics[0].code).toBe(
      "ambiguous_time",
    );
    expect(evaluate("3 nov 2024 1:30", c).ok).toBe(false);
  });
  test("preserves mixed timestamp time, signed calendar months", () => {
    expect(value("(2 feb 2024 12:00 - 1 feb 2024) in hours")).toBe("36 hours");
    expect(value("(1 feb 2024 - 1 may 2024) in months")).toBe("-3 months");
    expect(value("(1 may 2024 - 1 may 2024) in years")).toBe("0 years");
  });
  test("previous Saturday is strictly previous and AM/PM explicit", () => {
    expect(
      value("previous saturday 15:00", { ...ctx, now: "2024-02-03T10:00:00Z" }),
    ).toStartWith("2024-01-27T15:00");
    expect(value("7 oct 2023 6:00am")).toStartWith("2023-10-07T06:00");
    expect(evaluate("1 jan 2024 13:00pm", ctx).ok).toBe(false);
  });
});
describe("money and billing", () => {
  test("exact decimal money and injected snapshot provenance", () => {
    const c = {
      ...ctx,
      rates: {
        base: "USD",
        rates: { ILS: "3.7" },
        source: "synthetic",
        asOf: "2024-02-01",
      },
    };
    expect(value("(0.1+0.2) nis")).toBe("0.30 ILS");
    expect(value("37 nis in usd", c)).toBe("10.00 USD");
    expect(evaluate("37 nis in usd", ctx).diagnostics[0].code).toBe(
      "rate_unavailable",
    );
    expect(evaluate("37 nis in usd", c).basis.rateSource).toBe("synthetic");
  });
  test("whole anchored billing periods do not clamp drift or add exact-boundary month", () => {
    expect(
      countBillingMonths("2024-01-31", "2024-02-29", "include-partial"),
    ).toEqual({ completed: 1, billed: 1, partial: false, direction: 1 });
    expect(
      countBillingMonths("2024-01-31", "2024-03-30", "completed").billed,
    ).toBe(1);
    expect(
      countBillingMonths("2024-01-31", "2024-03-30", "include-partial").billed,
    ).toBe(2);
    expect(countBillingMonths("2024-01-31", "2024-03-31").billed).toBe(2);
  });
});

describe("legacy worksheet intervals and rent", () => {
  test("default interval is useful calendar decomposition with endpoints retained", () => {
    const r = evaluate("1 may 2024 - 15 feb 2023", ctx);
    expect(r.formatted).toBe("1 years 2 months 16 days");
    expect(r.value?.kind).toBe("interval");
    expect(value("1 feb 2024 - 1 feb 2024")).toBe("0 days");
    expect(value("1 feb 2024 - 1 mar 2024")).toBe("−1 months");
  });
  test("legacy months multiplied by rent follows explicit whole-period policy", () => {
    const source = "((30 mar 2024 - 31 jan 2024) in months) * 1000 nis";
    expect(value(source, { ...ctx, billing: "completed" })).toBe("1000.00 ILS");
    expect(value(source, { ...ctx, billing: "include-partial" })).toBe(
      "2000.00 ILS",
    );
    expect(
      evaluate(source, { ...ctx, billing: "include-partial" }).basis.notes.join(
        " ",
      ),
    ).toContain("2 billed");
    expect(
      value("1000 nis * ((29 feb 2024 - 31 jan 2024) in months)", {
        ...ctx,
        billing: "include-partial",
      }),
    ).toBe("1000.00 ILS");
  });
  test("rejects fake month names and fractional-money shortcuts without anchors", () => {
    expect(evaluate("1 janxxxxx 2024", ctx).ok).toBe(false);
    expect(evaluate("1.5 months * 1000 nis", ctx).diagnostics[0].code).toBe(
      "billing_anchor_required",
    );
  });
});
test("chained anchored conversions keep source endpoints; altered counts do not reuse billing provenance", () => {
  expect(value("((1 mar 2023 - 1 feb 2023) in months) in days")).toBe(
    "28 days",
  );
  expect(
    evaluate("(-((30 mar 2024 - 31 jan 2024) in months)) * 1000 nis", ctx)
      .diagnostics[0].code,
  ).toBe("billing_anchor_required");
});
