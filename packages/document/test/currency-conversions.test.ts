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
