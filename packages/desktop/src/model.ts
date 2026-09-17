import Decimal from "decimal.js";
import {
  importDocument,
  parseFigori,
  serializeFigori,
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
  format?: string;
  originPath?: string | null;
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
export function formatForPath(path: string | null) {
  return /\.md$/i.test(path ?? "") ? ("markdown" as const) : ("numi" as const);
}
export function openedWorksheet(value: Opened): Worksheet {
  if (/\.figori$/i.test(value.path)) return parseFigori(value.source);
  return importDocument(value.source, {
    format: formatForPath(value.path),
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

export function recoverySnapshot(
  document: Worksheet,
  path: string | null,
  sourceHash: string | null,
  dirty: boolean,
  originPath: string | null = null,
): Recovery {
  return {
    format: "figori",
    source: serializeFigori(document),
    settings: document.settings,
    path,
    sourceHash,
    dirty,
    originPath,
  };
}
export function recoveredWorksheet(recovery: Recovery): Worksheet {
  if (recovery.format === "figori") return parseFigori(recovery.source);
  if (recovery.format !== undefined)
    throw new Error("Unsupported recovery format");
  // Older native snapshots omitted the format discriminator. A native path
  // still requires a valid container; never reinterpret corruption as text.
  if (/\.figori$/i.test(recovery.path ?? ""))
    return parseFigori(recovery.source);
  return importDocument(recovery.source, {
    format: formatForPath(recovery.path),
    settings: recovery.settings,
  });
}
export function openedState(opened: Opened) {
  const document = openedWorksheet(opened);
  const native = /\.figori$/i.test(opened.path);
  return {
    document,
    path: native ? opened.path : null,
    sourceHash: native ? opened.sourceHash : null,
    dirty: !native,
    originPath: native ? null : opened.path,
  };
}
export function recoveredState(recovery: Recovery) {
  const document = recoveredWorksheet(recovery);
  const native =
    (recovery.format === "figori" ||
      (recovery.format === undefined && /\.figori$/i.test(recovery.path ?? ""))) &&
    (!recovery.path || /\.figori$/i.test(recovery.path));
  return {
    document,
    path: native ? recovery.path : null,
    sourceHash: native ? recovery.sourceHash : null,
    dirty: native ? recovery.dirty : true,
    originPath: recovery.originPath ?? (!native ? recovery.path : null),
  };
}

export function newNativeWorksheet(settings?: WorksheetSettings): Worksheet {
  return importDocument("", { format: "markdown", settings });
}
