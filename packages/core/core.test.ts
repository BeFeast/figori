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

describe("textual dates with an omitted year", () => {
  const september = { now: "2026-09-17T12:00:00Z", timezone: "Asia/Jerusalem" };
  test("both subtraction orders use this anchor year and retain signed exact days", () => {
    expect(value("(27 dec - today) in days", september)).toBe("101 days");
    expect(value("(today - 27 dec) in days", september)).toBe("-101 days");
    expect(evaluate("27 dec - today", september).ok).toBe(true);
    expect(evaluate("today - 27 dec", september).ok).toBe(true);
    expect(value("1 jan", september)).toBe("2026-01-01");
    expect(value("27 DECEMBER", september)).toBe("2026-12-27");
    expect(evaluate("27 dec", september).basis.notes.join(" ")).toContain(
      "resolved to 2026 from anchor 2026-09-17",
    );
  });
  test("selected timezone and pinned anchor choose year without changing today", () => {
    const newYear = {
      now: "2025-01-01T00:30:00Z",
      timezone: "America/New_York",
    };
    expect(value("27 dec", newYear)).toBe("2024-12-27");
    expect(value("27 dec", { ...newYear, timezone: "Asia/Jerusalem" })).toBe(
      "2025-12-27",
    );
    const pinned = {
      ...september,
      anchor: { mode: "fixed" as const, date: "2024-02-01" },
    };
    expect(value("29 feb", pinned)).toBe("2024-02-29");
    expect(value("today", pinned)).toBe("2026-09-17");
    expect(value("27 dec 2023", pinned)).toBe("2023-12-27");
  });
  test("invalid dates reject rather than constrain or roll to a leap year", () => {
    expect(evaluate("29 feb", september).ok).toBe(false);
    expect(evaluate("31 apr", september).ok).toBe(false);
    expect(evaluate("27 decemberish", september).ok).toBe(false);
    expect(value("29 feb 12:30", ctx)).toContain("2024-02-29T12:30:00+02:00");
    expect(value("12 USD", september)).toBe("12.00 USD");
    expect(value("9 months", september)).toBe("9 months");
  });
});

describe("calendar-day questions", () => {
  const today = { now: "2026-09-17T12:00:00Z", timezone: "Asia/Jerusalem" };
  test("date-only results convert to signed days from the visible anchor", () => {
    expect(value("(10 dec 2010 + 16 years) in days", today)).toBe("84 days");
    expect(value("16 sep 2026 in days", today)).toBe("-1 days");
    expect(value("17 sep 2026 in days", today)).toBe("0 days");
    const pinned = {
      ...today,
      anchor: { mode: "fixed" as const, date: "2024-02-28" },
    };
    expect(value("1 mar 2024 in days", pinned)).toBe("2 days");
    expect(
      evaluate("1 mar 2024 in days", pinned).basis.notes.join(" "),
    ).toContain("reference anchor 2024-02-28");
    expect(evaluate("10 dec 2026 12:00 in days", today).ok).toBe(false);
  });
  test("since/until use actual local today in both directions regardless of pinned anchor", () => {
    expect(value("days since 27 dec 1969", today)).toBe("20718 days");
    expect(value("days until 27 dec 1969", today)).toBe("-20718 days");
    expect(value("days until 27 dec", today)).toBe("101 days");
    expect(value("days since 27 dec", today)).toBe("-101 days");
    const pinned = {
      ...today,
      anchor: { mode: "fixed" as const, date: "2024-02-28" },
    };
    expect(value("days until 18 sep 2026", pinned)).toBe("1 days");
    expect(
      evaluate("days until 18 sep 2026", pinned).basis.notes.join(" "),
    ).toContain("actual local today 2026-09-17");
  });
  test("date ranges preserve intervals and calendar days across DST", () => {
    expect(value("(today to 27 dec) in days", today)).toBe("101 days");
    expect(value("(27 dec to today) in days", today)).toBe("-101 days");
    expect(value("today to 27 dec", today)).toBe("3 months 10 days");
    const dst = { now: "2024-03-10T05:30:00Z", timezone: "America/New_York" };
    expect(value("11 mar in days", dst)).toBe("1 days");
    expect(value("days until 11 mar", dst)).toBe("1 days");
    expect(value("days since 9 mar", dst)).toBe("1 days");
    expect(
      value("(10 mar 2024 00:00 to 11 mar 2024 00:00) in hours", dst),
    ).toBe("23 hours");
    expect(value("2 km in m", today)).toBe("2000 m");
  });
  test("invalid day questions remain diagnostic without timestamp coercion", () => {
    for (const source of [
      "days until 29 feb 2026",
      "days since 10",
      "today to 12 USD",
      "days until 18 sep 2026 12:00",
      "today to",
      "days since",
    ]) {
      expect(evaluate(source, today).ok).toBe(false);
    }
  });
});

describe("bare English month dates", () => {
  const today = { now: "2026-09-17T12:00:00Z", timezone: "Asia/Jerusalem" };
  test("full and abbreviated months assume day one and the anchor year", () => {
    for (const month of ["november", "Nov", "NOVEMBER"]) {
      expect(value(`days until ${month}`, today)).toBe("45 days");
    }
    expect(value("november", today)).toBe("2026-11-01");
    expect(value("days until january", today)).toBe("-259 days");
    expect(evaluate("november", today).basis.notes.join(" ")).toContain(
      "assumes day 1 and year 2026 from anchor 2026-09-17",
    );
  });
  test("pinned anchor chooses the omitted year but explicit year wins", () => {
    const pinned = {
      ...today,
      anchor: { mode: "fixed" as const, date: "2024-02-29" },
    };
    expect(value("november", pinned)).toBe("2024-11-01");
    expect(value("november 2027", pinned)).toBe("2027-11-01");
    expect(value("days until november 2027", pinned)).toBe("410 days");
    expect(evaluate("november 2027", pinned).basis.notes.join(" ")).toContain(
      "assumes day 1; explicit year 2027",
    );
  });
  test("existing exact-name variables have priority; units and day-month dates retain meaning", () => {
    const variables = { november: { kind: "number" as const, amount: "3" } };
    expect(value("november + 2", { ...today, variables })).toBe("5");
    expect(evaluate("days until november", { ...today, variables }).ok).toBe(
      false,
    );
    expect(value("9 months", today)).toBe("9 months");
    expect(value("27 nov", today)).toBe("2026-11-27");
    expect(value("november 2027 12:00", today)).toContain(
      "2027-11-01T12:00:00",
    );
    for (const invalid of ["novemberish", "november 202", "months", "month"]) {
      expect(evaluate(invalid, today).ok).toBe(false);
    }
  });
});

describe("human-readable converted durations", () => {
  const today = { now: "2026-09-17T12:00:00Z", timezone: "Asia/Jerusalem" };
  test("calendar years/months/weeks display components instead of repeating fractions", () => {
    expect(value("(today - 1 apr 2025) in years", today)).toBe(
      "1 year 5 months 16 days",
    );
    expect(value("(1 apr 2025 - today) in years", today)).toBe(
      "−(1 year 5 months 16 days)",
    );
    expect(value("(today - 1 apr 2025) in months", today)).toBe(
      "17 months 16 days",
    );
    expect(value("(1 apr 2025 - today) in weeks", today)).toBe(
      "−(76 weeks 2 days)",
    );
    expect(value("(today - 1 apr 2025) in days", today)).toBe("534 days");
    expect(value("(1 apr 2025 - today) in days", today)).toBe("-534 days");
  });
  test("calendar components respect month ends, leap days and zero values", () => {
    expect(value("(1 mar 2024 - 31 jan 2024) in months")).toBe("1 month 1 day");
    expect(value("(31 jan 2024 - 1 mar 2024) in months")).toBe(
      "−(1 month 1 day)",
    );
    expect(value("(1 mar 2024 - 28 feb 2024) in weeks")).toBe("2 days");
    expect(value("(1 mar 2024 - 1 mar 2024) in weeks")).toBe("0 weeks");
  });
  test("formatting leaves exact fractional quantity amounts available to arithmetic", () => {
    const converted = evaluate("(1 mar 2024 - 31 jan 2024) in months");
    expect(converted.value?.kind).toBe("quantity");
    if (converted.value?.kind !== "quantity")
      throw new Error("Expected quantity");
    expect(converted.value.unit).toBe("months");
    expect(converted.value.amount).toBe(
      "1.032258064516129032258064516129032258065",
    );
    const multiplied = evaluate("duration * 2", {
      ...ctx,
      variables: { duration: converted.value },
    });
    expect(
      multiplied.value?.kind === "quantity" && multiplied.value.amount,
    ).toBe("2.06451612903225806451612903225806451613");
    expect(value("0.1 + 0.2")).toBe("0.3");
    expect(value("12 USD")).toBe("12.00 USD");
  });
  test("timestamp formatting bounds precision without pretending DST days are 24 hours", () => {
    const c = { ...ctx, timezone: "America/New_York" };
    expect(value("(11 mar 2024 00:00 - 10 mar 2024 00:00) in hours", c)).toBe(
      "23 hours",
    );
    expect(value("(11 mar 2024 00:00 - 10 mar 2024 00:00) in days", c)).toBe(
      "≈0.958333333333 days",
    );
    expect(value("(10 mar 2024 00:00 - 11 mar 2024 00:00) in days", c)).toBe(
      "≈-0.958333333333 days",
    );
    expect(value("(11 mar 2024 - 10 mar 2024) in weeks", c)).toBe("1 day");
  });
});
