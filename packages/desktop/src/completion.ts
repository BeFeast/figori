import {
  type Completion,
  type CompletionResult,
  CompletionContext,
  insertCompletionText,
} from "@codemirror/autocomplete";
import { evaluateDocument, importDocument } from "@my-numi/document";
import {
  evaluateExpression,
  formatValue,
  type EvaluationContext,
} from "@my-numi/core";
import { displayResult } from "./model";
const units = [
  "years",
  "months",
  "weeks",
  "days",
  "hours",
  "minutes",
  "seconds",
  "m",
  "km",
  "cm",
  "kg",
  "g",
].map((label) => ({ label, type: "unit", detail: "Unit conversion" }));
const currencies = ["USD", "ILS", "NIS", "EUR", "GBP"].map((label) => ({
  label,
  type: "unit",
  detail: "Currency · conversion needs matching rates",
}));
const months = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
].map((label) => ({ label, type: "constant", detail: "Calendar month" }));
const dates: Completion[] = [
  { label: "today", type: "keyword", detail: "Today's date in this timezone" },
  { label: "now", type: "keyword", detail: "Current zoned timestamp" },
  {
    label: "previous saturday",
    type: "keyword",
    detail: "Strictly preceding Saturday",
  },
];
const questions: Completion[] = ["years", "months", "weeks", "days"].flatMap(
  (unit) =>
    ["since", "until"].map((direction) => ({
      label: `${unit} ${direction}`,
      type: "keyword",
      detail: "Calendar interval from actual today",
    })),
);
const naturalLog: Completion = {
  label: "ln",
  type: "function",
  detail: "Natural logarithm · positive number",
  apply(view, _completion, from, to) {
    view.dispatch({
      ...insertCompletionText(view.state, "ln()", from, to),
      selection: { anchor: from + 3 },
    });
  },
};

/** Only preceding source participates; completion never persists or fetches rates. */
export function worksheetCompletions(
  context: CompletionContext,
  evaluation: EvaluationContext = {},
): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos);
  const prefix = context.state.sliceDoc(line.from, context.pos);
  if (/^\s*(?:#|\/\/|;)/.test(prefix)) return null;
  const equals = line.text.indexOf("=");
  if (equals >= 0 && context.pos <= line.from + equals) return null;
  const word = prefix.match(/[A-Za-z_][A-Za-z0-9_]*$/);
  const before = word ? prefix.slice(0, -word[0].length) : prefix;
  const converting = /\bin\s+$/i.test(before);
  const toTarget = /\bto\s+$/i.test(before);
  const question = prefix.match(
    /^\s*((?:years?|months?|weeks?|days?))\s+([A-Za-z]*)$/i,
  );
  if (question) {
    return {
      from: line.from + prefix.indexOf(question[1]!),
      options: ["since", "until"].map((direction) => ({
        label: `${question[1]} ${direction}`,
        type: "keyword",
        detail: "Calendar interval from actual today",
      })),
    };
  }
  if (!word && !context.explicit && !converting && !toTarget) return null;
  const from = context.pos - (word?.[0].length ?? 0);
  if (converting) return { from, options: [...units, ...currencies] };
  const source = context.state.sliceDoc(0, line.from);
  const doc = importDocument(source, { format: "numi" });
  const evaluated = evaluateDocument(doc, evaluateExpression, {
    ...evaluation,
  });
  const names = new Set(
    doc.lines
      .map((item) => item.assignment)
      .filter(
        (name): name is string =>
          Boolean(name) && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name!),
      ),
  );
  const dateOperand = /\b(?:since|until)\s*\(?\s*$/i.test(before);
  const variables: Completion[] = [];
  for (const name of names) {
    const value = evaluated.variables[name];
    if (dateOperand && value && value.kind !== "date") continue;
    const formatted = value ? formatValue(value) : undefined;
    variables.push({
      label: name,
      type: "variable",
      boost: 10,
      detail: formatted
        ? displayResult(formatted, 2)
        : "Defined above · value unavailable",
    });
  }
  if (toTarget)
    return {
      from,
      options: [...variables, ...dates, ...months, ...currencies],
    };
  const options: Completion[] = [...variables, ...dates, ...months];
  if (!dateOperand) {
    options.push(naturalLog, ...units, ...currencies);
    if (!before.trim()) options.push(...questions);
    if (before.trim())
      options.push(
        { label: "in", type: "keyword", detail: "Convert the preceding value" },
        {
          label: "to",
          type: "keyword",
          detail: "Date interval endpoint or currency conversion",
        },
      );
  }
  // No validFor cache: preceding definitions may be renamed/deleted in another
  // transaction while the completion popup remains open.
  return { from, options };
}
