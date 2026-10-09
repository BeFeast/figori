import { expect, test } from "bun:test";
import { evaluateExpression } from "../../core/src/index";
import { evaluateDocument, importDocument } from "../src/index";

test("currency conversion ISO codes and symbols evaluate as worksheet expressions", () => {
  for (const format of ["numi", "markdown"] as const) {
    const expressions = [
      "total in $", "total to USD", "total to usd",
      "total in eur", "total to EUR", "total to €",
      "EUR 12", "12 eur", "GBP 12", "12 gbp",
      "total to USD = historical value", "total to EUR = old value",
    ];
    const doc = importDocument(["total = 100 ILS", ...expressions, "Travel to Rome"].join("\n"), {format});
    const result = evaluateDocument(doc, evaluateExpression, {
      now: "2026-09-17T12:00:00Z",
      rates: {base:"ILS",rates:{USD:"0.33",EUR:"0.30",GBP:"0.26"},source:"synthetic",asOf:"2026-09-16"},
    });
    expect(result.lines.slice(1,13).map(line => line.evaluation?.formatted)).toEqual([
      "$33.00","$33.00","$33.00","€30.00","€30.00","€30.00",
      "€12.00","€12.00","12.00 GBP","12.00 GBP","$33.00","€30.00",
    ]);
    expect(result.lines.at(-1)?.kind).toBe("heading");
    expect(doc.lines[11]?.historicalResult).toBe("historical value");
  }
});

test("every ECB currency converts in a worksheet, while ordinary heading words stay headings", () => {
  const source = [
    "1000 pln to ils",
    "100 usd + 100 eur to ILS",
    "100 chf to pln",
    "JPY 1000 in eur",
    "50 TRY to ILS",
    "Ideas to try",
    "Top 5 things to try",
  ].join("\n");
  const result = evaluateDocument(importDocument(source, {format: "numi"}), evaluateExpression, {
    now: "2026-10-09T12:00:00Z",
    rates: {
      base: "ILS",
      rates: {USD: "0.30", EUR: "0.25", PLN: "1.25", CHF: "0.25", JPY: "50", TRY: "10"},
      source: "synthetic",
      asOf: "2026-10-08",
    },
  });
  expect(result.lines.map(line => line.kind)).toEqual([
    "expression", "expression", "expression", "expression", "expression", "heading", "heading",
  ]);
  expect(result.lines.slice(0, 5).map(line => line.evaluation?.formatted)).toEqual([
    "₪800.00", "₪733.33", "500.00 PLN", "€5.00", "₪5.00",
  ]);
});

test("a snapshot without a newly supported currency names the missing rate", () => {
  const result = evaluateDocument(importDocument("1000 pln to ils", {format: "numi"}), evaluateExpression, {
    now: "2026-10-09T12:00:00Z",
    rates: {base: "ILS", rates: {USD: "0.30", EUR: "0.25", GBP: "0.22"}, source: "synthetic", asOf: "2026-10-08"},
  });
  expect(result.lines[0]?.evaluation?.ok).toBe(false);
  expect(result.lines[0]?.evaluation?.diagnostics).toEqual([{code: "rate_unavailable", message: "No PLN rate in snapshot."}]);
});
