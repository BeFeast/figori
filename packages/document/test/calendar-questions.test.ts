import { expect, test } from "bun:test";
import { evaluateExpression } from "../../core/src/index";
import { evaluateDocument, importDocument } from "../src/index";

test("explicit day questions without digits evaluate in worksheets while month headings stay headings", () => {
  const document = importDocument("days until november\ndays since november\ntoday to november\nNovember\nMonthly notes\n", { format: "numi" });
  const evaluated = evaluateDocument(document, evaluateExpression, { now: "2026-09-17T12:00:00Z" });
  expect(evaluated.lines[0]!.evaluation?.formatted).toBe("45 days");
  expect(evaluated.lines[1]!.evaluation?.formatted).toBe("-45 days");
  expect(evaluated.lines[2]!.evaluation?.formatted).toBe("1 months 15 days");
  expect(evaluated.lines[3]!.kind).toBe("heading");
  expect(evaluated.lines[3]!.evaluation).toBeUndefined();
  expect(evaluated.lines[4]!.kind).toBe("heading");
});
