import { expect, test } from "bun:test";
import { evaluateExpression } from "../../core/src/index";
import { evaluateDocument, importDocument } from "../src/index";

test("explicit day questions without digits evaluate in worksheets while month headings stay headings", () => {
  const document = importDocument(
    "days until november\ndays since november\ntoday to november\nNovember\nMonthly notes\n",
    { format: "numi" },
  );
  const evaluated = evaluateDocument(document, evaluateExpression, {
    now: "2026-09-17T12:00:00Z",
  });
  expect(evaluated.lines[0]!.evaluation?.formatted).toBe("45 days");
  expect(evaluated.lines[1]!.evaluation?.formatted).toBe("-45 days");
  expect(evaluated.lines[2]!.evaluation?.formatted).toBe("1 month 15 days");
  expect(evaluated.lines[3]!.kind).toBe("heading");
  expect(evaluated.lines[3]!.evaluation).toBeUndefined();
  expect(evaluated.lines[4]!.kind).toBe("heading");
});

test("assigned dates evaluate all since/until units and captured questions without becoming headings", () => {
  const source =
    "stocks_date = 1 may 2025\nmorgage_date = 1 june 2028\nyears since stocks_date\nweeks since stocks_date\ndays since stocks_date\nyears until morgage_date\nweeks until morgage_date\ndays until morgage_date\nmonths since stocks_date = 16 months 16 days\nYears of planning\n";
  const document = importDocument(source, { format: "numi" });
  const result = evaluateDocument(document, evaluateExpression, {
    now: "2026-09-17T12:00:00Z",
    timezone: "Asia/Jerusalem",
  });
  expect(
    result.lines.slice(2, 9).map((line) => line.evaluation?.formatted),
  ).toEqual([
    "1 year 4 months 16 days",
    "72 weeks",
    "504 days",
    "1 year 8 months 15 days",
    "89 weeks",
    "623 days",
    "16 months 16 days",
  ]);
  expect(result.lines[9]?.kind).toBe("heading");
  expect(result.lines[9]?.evaluation).toBeUndefined();
  expect(document.source).toBe(source);
});

test("timestamp variables answer calendar since/until questions in worksheets", () => {
  const source =
    "# Hello\nlast_drink = 21 september 2024 21:00\nyears since last_drink\ndays until (last_drink + 3 years)\n";
  const document = importDocument(source, { format: "numi" });
  const result = evaluateDocument(document, evaluateExpression, {
    now: "2026-09-18T09:00:00Z",
    timezone: "Asia/Jerusalem",
  });
  expect(result.lines[1]?.evaluation?.formatted).toBe(
    "2024-09-21T21:00:00+03:00[Asia/Jerusalem]",
  );
  expect(result.lines[2]?.evaluation?.ok).toBe(true);
  expect(result.lines[2]?.evaluation?.formatted).toBe(
    "1 year 11 months 28 days",
  );
  expect(result.lines[3]?.evaluation?.formatted).toBe("368 days");
  expect(document.source).toBe(source);
});
