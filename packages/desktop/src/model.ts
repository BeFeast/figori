import Decimal from "decimal.js";
import {
  importDocument,
  updateDocument,
  type Worksheet,
  type WorksheetSettings,
} from "@my-numi/document";
export type Opened = {
  path: string;
  source: string;
  sourceHash: string;
  settings?: WorksheetSettings;
  warning?: string;
};
export type Recovery = {
  path: string | null;
  source: string;
  sourceHash: string | null;
  settings: WorksheetSettings;
  dirty: boolean;
};
export type RateState = {
  status: "fresh" | "stale" | "unavailable";
  snapshot?: {
    base: string;
    rates: Record<string, string>;
    source: string;
    asOf: string;
  };
  error?: string;
};
export function editorText(source: string) {
  return source.replace(/\r\n|\r/g, "\n");
}
/** Keep original per-line separators across normal edits and multiline paste. */
export function fromEditor(previous: Worksheet, text: string): Worksheet {
  const parsed = updateDocument(previous, text);
  const endings = new Map(previous.lines.map((line) => [line.id, line.ending]));
  const preferred = previous.lines.find((line) => line.ending)?.ending ?? "\n";
  const source = parsed.lines
    .map(
      (line) =>
        line.source + (line.ending ? endings.get(line.id) || preferred : ""),
    )
    .join("");
  return updateDocument(previous, source);
}
export function openedWorksheet(value: Opened): Worksheet {
  return importDocument(value.source, {
    format: "numi",
    settings: value.settings,
  });
}
export function displayResult(text: string, precision: number): string {
  return text.replace(
    /(^|[\s($€£₪])([+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?)(?=$|[\s),])/gi,
    (_match, prefix: string, amount: string) => {
      try {
        return (
          prefix +
          new Decimal(amount)
            .toDecimalPlaces(precision, Decimal.ROUND_HALF_UP)
            .toString()
        );
      } catch {
        return prefix + amount;
      }
    },
  );
}
export function sourceTitle(line: {
  source: string;
  expression: string;
  historicalResult?: string;
  label?: string;
  assignment?: string;
}): string {
  return line.historicalResult === undefined
    ? line.source
    : (line.assignment
        ? line.assignment + " = "
        : line.label
          ? line.label + ": "
          : "") + line.expression;
}
export function readableBasis(basis: unknown): string {
  if (!basis || typeof basis !== "object") return "";
  const value = basis as {
    notes?: string[];
    timezone?: string;
    anchorDate?: string;
    rateSource?: string;
    rateAsOf?: string;
  };
  return [
    value.anchorDate && `Date: ${value.anchorDate}`,
    value.timezone && `Timezone: ${value.timezone}`,
    ...(value.notes ?? []),
    value.rateSource && `Rates: ${value.rateSource} · ${value.rateAsOf ?? ""}`,
  ]
    .filter(Boolean)
    .join("\n");
}
