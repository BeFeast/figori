import { Temporal } from "@js-temporal/polyfill";
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

/** Display elapsed timestamp intervals, never infer duration semantics from a unit alone. */
export function elapsedDurationPresentation(value: unknown, basis?: unknown): { display: string; exact: string } | undefined {
  const v = value as { kind?: string; amount?: string; unit?: string; interval?: { start: { kind: string; iso: string }; end: { kind: string; iso: string } } } | undefined;
  if (v?.kind !== "quantity" || !v.interval ||
      (v.interval.start.kind !== "datetime" && v.interval.end.kind !== "datetime") ||
      typeof v.amount !== "string") return;
  const factors: Record<string, string> = { weeks: "604800", days: "86400", hours: "3600", minutes: "60", seconds: "1" };
  if (v.unit === "months" || v.unit === "years") {
    const timezone = (basis as { timezone?: string } | undefined)?.timezone ?? "UTC";
    const zoned = (endpoint: { kind: string; iso: string }) => endpoint.kind === "date"
      ? Temporal.PlainDate.from(endpoint.iso).toZonedDateTime(timezone)
      : Temporal.ZonedDateTime.from(endpoint.iso).withTimeZone(timezone);
    const duration = zoned(v.interval.start).until(zoned(v.interval.end), {
      largestUnit: v.unit, smallestUnit: "seconds", roundingMode: "trunc",
    });
    const parts = (["years", "months", "days", "hours", "minutes", "seconds"] as const)
      .filter(unit => duration[unit] !== 0)
      .map(unit => { const amount = Math.abs(duration[unit]); return `${amount} ${amount === 1 ? unit.slice(0, -1) : unit}`; });
    const text = parts.join(" ") || "0 seconds";
    return { display: duration.sign < 0 ? (parts.length > 1 ? `−(${text})` : `-${text}`) : text, exact: `${v.amount} ${v.unit}` };
  }
  const factor = factors[v.unit ?? ""];
  if (!factor) return; // Calendar months/years do not have a fixed elapsed length.
  const Exact = Decimal.clone({ precision: Math.max(80, v.amount.length + 20) });
  const amount = new Exact(v.amount);
  let remaining = amount.abs().mul(factor).floor();
  const parts: string[] = [];
  for (const [unit, seconds] of [["day", 86400], ["hour", 3600], ["minute", 60], ["second", 1]] as const) {
    const count = remaining.div(seconds).floor();
    remaining = remaining.mod(seconds);
    if (!count.isZero()) parts.push(`${count.toFixed(0)} ${unit}${count.eq(1) ? "" : "s"}`);
  }
  const text = parts.join(" ") || "0 seconds";
  return { display: amount.isNegative() && parts.length ? (parts.length > 1 ? `−(${text})` : `-${text}`) : text, exact: `${v.amount} ${v.unit}` };
}
