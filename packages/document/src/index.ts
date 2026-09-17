export type SourceFormat = "numi" | "markdown";
export interface WorksheetSettings {
  timezone: string;
  anchor: { mode: "today" | "fixed"; date?: string };
  billing: "completed" | "include-partial";
}
export interface Diagnostic { code: string; message: string }
export interface DocumentLine {
  id: string;
  source: string;
  ending: string;
  kind: "blank" | "heading" | "comment" | "expression";
  expression: string;
  historicalResult?: string;
  assignment?: string;
  label?: string;
}
export interface Worksheet {
  schemaVersion: 1;
  id: string;
  format: SourceFormat;
  source: string;
  settings: WorksheetSettings;
  lines: DocumentLine[];
}
export interface Evaluation<V> {
  ok: boolean;
  value?: V;
  formatted?: string;
  diagnostics: Diagnostic[];
  basis?: unknown;
}
export type Evaluator<V, C = Record<string, unknown>> = (
  expression: string, context: C & WorksheetSettings & { variables: Record<string, V> }
) => Evaluation<V>;
export const defaultSettings: WorksheetSettings = {
  timezone: "Asia/Jerusalem", anchor: { mode: "today" }, billing: "completed",
};
const identifier = /^[\p{L}_][\p{L}\p{N}_]*$/u;
const assignment = /^([\p{L}_][\p{L}\p{N}_]*)\s*=\s*([^=].*)$/u;

export function normalizeExpression(source: string): string {
  return source.replace(/[\u00a0\u202f]/g, " ").replace(/\b(\d{1,2}:\d{2})\s*([ap])\.?m\.?\b/gi, "$1 $2m").trim();
}

function splitLines(source: string): Array<{ source: string; ending: string }> {
  const lines: Array<{ source: string; ending: string }> = [];
  const pattern = /([^\r\n]*)(\r\n|\r|\n|$)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) && match[0]) {
    lines.push({ source: match[1]!, ending: match[2]! });
  }
  if (!lines.length) lines.push({ source: "", ending: "" });
  return lines;
}

function parseLine(raw: string, ending: string, format: SourceFormat): DocumentLine {
  const line: DocumentLine = { id: crypto.randomUUID(), source: raw, ending, kind: "expression", expression: "" };
  let text = normalizeExpression(raw.replace(/^\uFEFF/, ""));
  if (!text) return { ...line, kind: "blank" };
  if (/^#{1,6}\s|^[-=]{3,}$/.test(text)) return { ...line, kind: "heading" };
  if (/^(?:\/\/|;)/.test(text)) return { ...line, kind: "comment" };
  if (format === "markdown") {
    const equals = text.lastIndexOf("=");
    if (equals >= 0) {
      const left = text.slice(0, equals).trim();
      const right = text.slice(equals + 1).trim();
      // A bare identifier on the left is a native assignment, never a captured result.
      if (left && right && (!identifier.test(left) || /^(today|now)$/i.test(left)) && !/[<>=!]$/.test(left)) {
        line.historicalResult = right;
        text = left;
      }
    }
  }
  const assigned = text.match(assignment);
  if (assigned) {
    line.assignment = assigned[1];
    text = assigned[2]!;
  } else {
    // A label is optional display text, not part of the mathematical expression.
    const labeled = text.match(/^([\p{L}][\p{L}\p{N} _/-]*):\s+(.+)$/u);
    if (labeled) {
      line.label = labeled[1];
      text = labeled[2]!;
    }
  }
  // Plain headings may contain years, parentheses and slashes. A compact function
  // call, date, known relative date, assignment or captured result is still math.
  const plainHeading = /^[\p{L}][\p{L}\p{N}\s/()'’"—–#\-]*$/u.test(text.replace(/\?$/, ""))
    && !/\p{L}\(/u.test(text)
    && !/\b(?:today|now|previous|in)\b/i.test(text)
    && !(/\d/.test(text) && /\b(?:years?|months?|weeks?|days?|hours?|minutes?|seconds?|nis|ils|usd)\b/i.test(text));
  if (!line.assignment && !line.label && !line.historicalResult && (plainHeading || /:$/.test(text))) {
    line.kind = "heading";
  }
  line.expression = normalizeExpression(text);
  return line;
}

export function importDocument(
  source: string,
  options: { format: SourceFormat; id?: string; settings?: Partial<WorksheetSettings> },
): Worksheet {
  const settings = { ...defaultSettings, ...options.settings, anchor: { ...(options.settings?.anchor ?? defaultSettings.anchor) } };
  validateSettings(settings);
  return {
    schemaVersion: 1, id: options.id ?? crypto.randomUUID(), source, format: options.format, settings,
    lines: splitLines(source).map(({ source, ending }) => parseLine(source, ending, options.format)),
  };
}

/** Preserve identities of unchanged/moved lines; reuse edited line identities when possible. */
export function updateDocument(document: Worksheet, source: string): Worksheet {
  const next = importDocument(source, document);
  const available = new Map<string, DocumentLine[]>();
  for (const line of document.lines) {
    const queue = available.get(line.source) ?? [];
    queue.push(line);
    available.set(line.source, queue);
  }
  const reused = new Set<string>();
  const unmatched: number[] = [];
  next.lines.forEach((line, index) => {
    const old = available.get(line.source)?.shift();
    if (old) { line.id = old.id; reused.add(old.id); } else unmatched.push(index);
  });
  const remaining = document.lines.filter((line) => !reused.has(line.id));
  unmatched.forEach((index, i) => { if (remaining[i]) next.lines[index]!.id = remaining[i]!.id; });
  return next;
}

export function validateSettings(settings: WorksheetSettings): void {
  if (typeof settings.timezone !== "string") throw new Error("Invalid worksheet timezone");
  try { new Intl.DateTimeFormat("en", { timeZone: settings.timezone }); }
  catch { throw new Error("Invalid worksheet timezone"); }
  if (!settings.anchor || !["today", "fixed"].includes(settings.anchor.mode)) throw new Error("Invalid anchor mode");
  if (settings.anchor.mode === "fixed") {
    const date = settings.anchor.date;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Fixed anchor requires an ISO date");
    const parsed = new Date(date + "T00:00:00Z");
    if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) throw new Error("Invalid fixed anchor date");
  }
  if (!["completed", "include-partial"].includes(settings.billing)) throw new Error("Invalid billing policy");
}

export function evaluateDocument<V, C extends Record<string, unknown>>(
  document: Worksheet,
  evaluator: Evaluator<V, C>,
  context: C,
): { lines: Array<DocumentLine & { evaluation?: Evaluation<V> }>; variables: Record<string, V> } {
  const variables: Record<string, V> = Object.create(null);
  const failed = new Set<string>();
  const declared = new Set(document.lines.flatMap((line) => line.assignment ? [line.assignment] : []));
  // Shared evaluation clock: a caller-supplied instant wins, otherwise capture once.
  const sharedContext = { now: new Date().toISOString(), ...context, ...document.settings, variables };
  const lines = document.lines.map((line) => {
    // A plain identifier becomes a reference if a preceding assignment defines it.
    const reference = identifier.test(line.expression) && (Object.hasOwn(variables, line.expression) || failed.has(line.expression) || declared.has(line.expression));
    if (line.kind !== "expression" && !reference) return line;
    const tokens = line.expression.match(/[\p{L}_][\p{L}\p{N}_]*/gu) ?? [];
    const dependency = tokens.find((token) => failed.has(token));
    let evaluation: Evaluation<V>;
    if (dependency) {
      evaluation = { ok: false, diagnostics: [{ code: "dependency-error", message: `Variable "${dependency}" has no valid value because its assignment failed.` }] };
    } else {
      try { evaluation = evaluator(line.expression, sharedContext as C & WorksheetSettings & { variables: Record<string, V> }); }
      catch (error) { evaluation = { ok: false, diagnostics: [{ code: "evaluation-error", message: error instanceof Error ? error.message : String(error) }] }; }
    }
    if (line.assignment) {
      if (evaluation.ok && evaluation.value !== undefined) {
        variables[line.assignment] = evaluation.value;
        failed.delete(line.assignment);
      } else {
        delete variables[line.assignment];
        failed.add(line.assignment);
      }
    }
    return { ...line, kind: "expression" as const, evaluation };
  });
  return { lines, variables };
}

export function serializeNumi(document: Worksheet): { text: string; warnings: string[] } {
  const warnings = [
    "Numi text does not carry worksheet timezone, dynamic/fixed anchor, or monthly billing policy. Keep the Figori sidecar or saved worksheet.",
    "Text compatibility does not guarantee identical native Numi calendar or currency results.",
  ];
  if (document.format === "numi") return { text: document.source, warnings };
  const text = document.lines.map((line) => {
    if (line.historicalResult === undefined) return line.source + line.ending;
    // Strip only the captured historical suffix, keeping original Unicode and whitespace.
    const equals = line.source.lastIndexOf("=");
    return line.source.slice(0, equals).trimEnd() + line.ending;
  }).join("");
  return { text, warnings };
}
