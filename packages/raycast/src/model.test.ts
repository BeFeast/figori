import { describe, expect, test } from "bun:test";
import {
  contextFor,
  defaults,
  resolvedAnchor,
  validateSettings,
} from "./model";
describe("visible evaluation context", () => {
  test("today follows the selected timezone around midnight", () => {
    expect(resolvedAnchor(defaults, "2026-01-01T22:30:00Z")).toBe("2026-01-02");
    expect(
      resolvedAnchor(
        { ...defaults, timezone: "America/New_York" },
        "2026-01-01T22:30:00Z",
      ),
    ).toBe("2026-01-01");
  });
  test("pinned anchors remain pinned and reject normalized invalid dates", () => {
    const fixed = {
      ...defaults,
      anchorMode: "fixed" as const,
      anchorDate: "2024-02-29",
    };
    expect(validateSettings(fixed)).toBeUndefined();
    expect(resolvedAnchor(fixed, "2030-01-01T00:00:00Z")).toBe("2024-02-29");
    expect(validateSettings({ ...fixed, anchorDate: "2023-02-29" })).toContain(
      "not a valid",
    );
    expect(
      validateSettings({ ...fixed, timezone: "Invalid/Timezone" }),
    ).toContain("IANA");
  });
  test("billing choice and shared clock reach the evaluator unchanged", () => {
    const now = "2026-01-01T00:00:00Z";
    expect(
      contextFor({ ...defaults, includePartial: true }, now),
    ).toMatchObject({
      now,
      billing: "include-partial",
      anchor: { mode: "today" },
    });
    expect(contextFor(defaults, now).billing).toBe("completed");
  });
});

test("captured result rows display only the expression while source remains intact", async () => {
  const { expressionTitle } = await import("./model");
  const captured = {
    source: "Duration: 2 months in days = 61 days",
    expression: "2 months in days",
    label: "Duration",
    historicalResult: "61 days",
  };
  expect(expressionTitle(captured)).toBe("Duration: 2 months in days");
  expect(captured.source).toBe("Duration: 2 months in days = 61 days");
  expect(
    expressionTitle({
      source: "price = 12",
      expression: "12",
      assignment: "price",
    }),
  ).toBe("price = 12");
  expect(expressionTitle({ source: "Saved heading", expression: "" })).toBe(
    "Saved heading",
  );
});

test("result accessories round decimal digits without losing integer precision", async () => {
  const { compactResult } = await import("./model");
  expect(
    compactResult("-1.463013698630136986301369863013698630137 years"),
  ).toBe("-1.46 years");
  expect(compactResult("999999999999999999999999999999.999 USD")).toBe(
    "1000000000000000000000000000000 USD",
  );
  expect(compactResult("-1.235 ILS")).toBe("-1.24 ILS");
  expect(compactResult("12.00 USD")).toBe("12 USD");
  expect(compactResult("0.004")).toBe("0");
  expect(compactResult("-0.004")).toBe("0");
  expect(compactResult("+12.345")).toBe("+12.35");
  expect(compactResult("123456789012345678901234567890")).toBe(
    "123456789012345678901234567890",
  );
  expect(compactResult("1 year 2 months 3 days")).toBe(
    "1 year 2 months 3 days",
  );
  expect(compactResult("2 days 3.125 seconds")).toBe("2 days 3.13 seconds");
  expect(compactResult("2032-02-01T12:30:45.123+02:00")).toBe(
    "2032-02-01T12:30:45.123+02:00",
  );
  expect(compactResult("1.2345e+30")).toBe("1.2345e+30");
});
