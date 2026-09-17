import { parseFigori, evaluateDocument } from "../packages/document/src/index";
import { evaluateExpression } from "../packages/core/src/index";
const counts = { "trip-budget": 12, "consulting-project": 15, "calendar-plan": 10 };
for (const [name, expected] of Object.entries(counts)) {
  const doc = parseFigori(await Bun.file(new URL(`examples/${name}.figori`, import.meta.url)).text());
  const evaluated = evaluateDocument(doc, evaluateExpression, {
    now: "2027-01-15T12:00:00Z",
    rates: { base: "EUR", rates: { USD: "1.10", ILS: "4" }, source: "Synthetic fixture, not market rates", asOf: "2027-01-15" },
  }).lines.filter(line => line.evaluation);
  if (evaluated.length !== expected || evaluated.some(line => !line.evaluation?.ok)) {
    throw new Error(`${name}: expected ${expected} successful calculations, got ${evaluated.length}`);
  }
  console.log(`${name}: ${expected} calculations verified`);
}
