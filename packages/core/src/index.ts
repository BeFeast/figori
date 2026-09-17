import { Temporal } from "@js-temporal/polyfill";
import Decimal from "decimal.js";
const D = Decimal.clone({ precision: 40 });
export type DateValue = { kind: "date" | "datetime"; iso: string };
export type Value =
  | { kind: "number"; amount: string; percentage?: true }
  | { kind: "money"; amount: string; currency: string }
  | {
      kind: "quantity";
      amount: string;
      unit: string;
      interval?: { start: DateValue; end: DateValue };
    }
  | DateValue
  | { kind: "interval"; start: DateValue; end: DateValue };
export interface RateSnapshot {
  base: string;
  rates: Record<string, string | number>;
  source: string;
  asOf: string;
}
export interface EvaluationContext {
  now?: string;
  timezone?: string;
  anchor?: { mode: "today" | "fixed"; date?: string };
  variables?: Record<string, Value>;
  rates?: RateSnapshot;
  billing?: "completed" | "include-partial";
}
export interface Basis {
  timezone: string;
  anchorDate: string;
  anchorMode: "today" | "fixed";
  notes: string[];
  rateSource?: string;
  rateAsOf?: string;
}
export interface EvaluationResult {
  ok: boolean;
  value?: Value;
  formatted?: string;
  diagnostics: { code: string; message: string }[];
  basis: Basis;
}
class CalcError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
function fail(code: string, message: string): never {
  throw new CalcError(code, message);
}
const num = (n: Decimal.Value): Value => ({
  kind: "number",
  amount: new D(n).toString(),
});
const unitAliases: Record<string, string> = {
  year: "years",
  month: "months",
  week: "weeks",
  day: "days",
  hour: "hours",
  hr: "hours",
  minute: "minutes",
  min: "minutes",
  second: "seconds",
  sec: "seconds",
  meter: "m",
  meters: "m",
  kilometer: "km",
  kilometers: "km",
  centimeter: "cm",
  centimeters: "cm",
  kilogram: "kg",
  kilograms: "kg",
  gram: "g",
  grams: "g",
};
const units = new Set([
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
]);
const currencyAliases: Record<string, string> = {
  USD: "USD",
  $: "USD",
  EUR: "EUR",
  "€": "EUR",
  ILS: "ILS",
  NIS: "ILS",
  "₪": "ILS",
  GBP: "GBP",
  "£": "GBP",
};
const currency = (s: string) =>
  currencyAliases[s.toUpperCase()] ?? s.toUpperCase();
const currencyToken = /^(?:USD\b|EUR\b|ILS\b|NIS\b|GBP\b|[$€₪£])/i;
const isCurrency = (s: string) =>
  Object.hasOwn(currencyAliases, s.toUpperCase());
const canonical = (s: string) =>
  unitAliases[s.toLowerCase()] ?? s.toLowerCase();
const timeFactors: Record<string, string> = {
  weeks: "604800",
  days: "86400",
  hours: "3600",
  minutes: "60",
  seconds: "1",
};
const physical: Record<string, [string, string]> = {
  m: ["length", "1"],
  km: ["length", "1000"],
  cm: ["length", "0.01"],
  kg: ["mass", "1000"],
  g: ["mass", "1"],
};
const date = (iso: string): DateValue => ({ kind: "date", iso });
const datetime = (iso: string): DateValue => ({ kind: "datetime", iso });
const isDate = (v: Value): v is DateValue =>
  v.kind === "date" || v.kind === "datetime";
function zdt(v: DateValue, basis: Basis) {
  if (v.kind === "datetime") return Temporal.ZonedDateTime.from(v.iso);
  basis.notes.push("Date-only value promoted to local start of day.");
  return Temporal.PlainDate.from(v.iso).toZonedDateTime(basis.timezone);
}
function shift(v: DateValue, n: string, u: string, basis: Basis): DateValue {
  const amount = new D(n);
  if (!amount.isInteger())
    fail("fractional_calendar", "Date arithmetic requires integer units.");
  if (
    ![
      "years",
      "months",
      "weeks",
      "days",
      "hours",
      "minutes",
      "seconds",
    ].includes(u)
  )
    fail("incompatible_units", "This unit cannot be added to a date.");
  const delta = { [u]: amount.toNumber() };
  if (v.kind === "date" && ["years", "months", "weeks", "days"].includes(u))
    return date(
      Temporal.PlainDate.from(v.iso)
        .add(delta, { overflow: "constrain" })
        .toString(),
    );
  return datetime(
    zdt(v, basis).add(delta, { overflow: "constrain" }).toString(),
  );
}
function intervalAmount(
  v: Extract<Value, { kind: "interval" }>,
  u: string,
  basis: Basis,
): string {
  if (v.start.kind === "date" && v.end.kind === "date") {
    const start = Temporal.PlainDate.from(v.start.iso),
      end = Temporal.PlainDate.from(v.end.iso);
    if (u === "months" || u === "years") {
      return calendarFraction(start, end, u, basis);
    }
    const days = start.until(end, { largestUnit: "days" }).days;
    if (timeFactors[u]) {
      basis.notes.push(
        "Calendar dates: each day is a calendar day (time-unit conversion uses nominal 24-hour days).",
      );
      return new D(days).mul(86400).div(timeFactors[u]).toString();
    }
  }
  const start = zdt(v.start, basis),
    end = zdt(v.end, basis);
  if (u === "months" || u === "years")
    return calendarFraction(start, end, u, basis);
  if (timeFactors[u]) {
    basis.notes.push(
      u === "days"
        ? "Elapsed days of exactly 24 hours."
        : "Elapsed time between instants.",
    );
    return new D((end.epochNanoseconds - start.epochNanoseconds).toString())
      .div(1e9)
      .div(timeFactors[u])
      .toString();
  }
  return fail("incompatible_units", "Cannot convert interval to this unit.");
}
function calendarFraction(
  start: Temporal.PlainDate | Temporal.ZonedDateTime,
  end: Temporal.PlainDate | Temporal.ZonedDateTime,
  u: "months" | "years",
  basis: Basis,
): string {
  const isPlain = start instanceof Temporal.PlainDate;
  const delta = isPlain
    ? (start as Temporal.PlainDate).until(end as Temporal.PlainDate, {
        largestUnit: u,
      })
    : (start as Temporal.ZonedDateTime).until(end as Temporal.ZonedDateTime, {
        largestUnit: u,
      });
  const whole = u === "months" ? delta.months : delta.years;
  const base = start.add({ [u]: whole });
  const distance = (a: typeof start, b: typeof start) =>
    isPlain
      ? new D(
          (a as Temporal.PlainDate).until(b as Temporal.PlainDate, {
            largestUnit: "days",
          }).days,
        )
      : new D(
          (
            (b as Temporal.ZonedDateTime).epochNanoseconds -
            (a as Temporal.ZonedDateTime).epochNanoseconds
          ).toString(),
        );
  const remainder = distance(base, end);
  if (remainder.isZero()) return String(whole);
  const step = remainder.isNegative() ? -1 : 1;
  const next = start.add({ [u]: whole + step });
  basis.notes.push(
    "Fractional calendar period measured against its adjacent anchored boundary.",
  );
  return new D(whole)
    .plus(remainder.div(distance(base, next).abs()))
    .toString();
}
function convert(
  v: Value,
  target: string,
  ctx: EvaluationContext,
  basis: Basis,
): Value {
  const u = canonical(target);
  if (isCurrency(target) && v.kind !== "money")
    fail(
      "currency_required",
      "Specify the source currency before conversion, for example (amount) ILS to USD.",
    );
  if (v.kind === "date" && u === "days") {
    basis.notes.push(
      `Calendar days from reference anchor ${basis.anchorDate} to ${v.iso}.`,
    );
    return convert(
      { kind: "interval", start: date(basis.anchorDate), end: v },
      u,
      ctx,
      basis,
    );
  }
  if (v.kind === "money") {
    if (!isCurrency(target))
      fail("incompatible_units", "Money requires a supported target currency.");
    const to = currency(target);
    if (to === v.currency) return v;
    const r = ctx.rates;
    if (!r) fail("rate_unavailable", "No exchange-rate snapshot is available.");
    const rate = (c: string) =>
      c === currency(r.base)
        ? new D(1)
        : r.rates[c] === undefined
          ? fail("rate_unavailable", `No ${c} rate in snapshot.`)
          : new D(r.rates[c]);
    const fromRate = rate(v.currency),
      toRate = rate(to);
    if (
      !fromRate.isPositive() ||
      !toRate.isPositive() ||
      !fromRate.isFinite() ||
      !toRate.isFinite()
    )
      fail("invalid_rate", "Rates must be finite positive values.");
    basis.rateSource = r.source;
    basis.rateAsOf = r.asOf;
    basis.notes.push(
      `Rate snapshot: ${r.source}, as of ${r.asOf}; live freshness not assumed.`,
    );
    return {
      kind: "money",
      currency: to,
      amount: new D(v.amount).div(fromRate).mul(toRate).toString(),
    };
  }
  if (v.kind === "interval")
    return {
      kind: "quantity",
      amount: intervalAmount(v, u, basis),
      unit: u,
      interval: { start: v.start, end: v.end },
    };
  if (v.kind !== "quantity")
    return fail(
      "incompatible_units",
      "Only quantities, intervals, or money can be converted.",
    );
  if (v.unit === u) return v;
  if (v.interval)
    return {
      kind: "quantity",
      amount: intervalAmount({ kind: "interval", ...v.interval }, u, basis),
      unit: u,
      interval: v.interval,
    };
  if (["months", "years"].includes(v.unit) || ["months", "years"].includes(u)) {
    const end = shift(date(basis.anchorDate), v.amount, v.unit, basis);
    basis.notes.push(`Calendar conversion anchored at ${basis.anchorDate}.`);
    return {
      kind: "quantity",
      amount: intervalAmount(
        { kind: "interval", start: date(basis.anchorDate), end },
        u,
        basis,
      ),
      unit: u,
    };
  }
  if (timeFactors[v.unit] && timeFactors[u])
    return {
      kind: "quantity",
      amount: new D(v.amount)
        .mul(timeFactors[v.unit])
        .div(timeFactors[u])
        .toString(),
      unit: u,
    };
  if (physical[v.unit] && physical[u] && physical[v.unit][0] === physical[u][0])
    return {
      kind: "quantity",
      amount: new D(v.amount)
        .mul(physical[v.unit][1])
        .div(physical[u][1])
        .toString(),
      unit: u,
    };
  return fail("incompatible_units", `Cannot convert ${v.unit} to ${u}.`);
}
function binary(
  a: Value,
  op: string,
  b: Value,
  ctx: EvaluationContext,
  basis: Basis,
): Value {
  if (isDate(a) && isDate(b) && op === "-")
    return { kind: "interval", start: b, end: a };
  if (isDate(a) && b.kind === "quantity" && (op === "+" || op === "-"))
    return shift(
      a,
      op === "-" ? new D(b.amount).neg().toString() : b.amount,
      b.unit,
      basis,
    );
  if (a.kind === "quantity" && isDate(b) && op === "+")
    return shift(b, a.amount, a.unit, basis);
  if (
    op === "*" &&
    ((a.kind === "money" && b.kind === "quantity") ||
      (b.kind === "money" && a.kind === "quantity"))
  ) {
    const money =
      a.kind === "money" ? a : (b as Extract<Value, { kind: "money" }>);
    const period =
      a.kind === "quantity" ? a : (b as Extract<Value, { kind: "quantity" }>);
    if (period.unit !== "months" || !period.interval)
      return fail(
        "billing_anchor_required",
        "Monthly money multiplication requires an anchored date interval in months.",
      );
    const { start, end } = period.interval;
    const startDate =
      start.kind === "date"
        ? start.iso
        : Temporal.ZonedDateTime.from(start.iso).toPlainDate().toString();
    const endDate =
      end.kind === "date"
        ? end.iso
        : Temporal.ZonedDateTime.from(end.iso).toPlainDate().toString();
    const count = countBillingMonths(
      startDate,
      endDate,
      ctx.billing ?? "completed",
    );
    if (start.kind === "datetime" || end.kind === "datetime")
      return fail(
        "billing_date_required",
        "Monthly billing requires date-only endpoints; choose billing dates explicitly.",
      );
    basis.notes.push(
      `Monthly billing ${ctx.billing ?? "completed"}: ${count.completed} completed, ${count.billed} billed; partial=${count.partial}. Fractional calendar-month display is replaced by the selected whole-month billing count; source remains unchanged.`,
    );
    return {
      kind: "money",
      currency: money.currency,
      amount: new D(money.amount).mul(count.billed).toString(),
    };
  }
  if (a.kind === "interval") a = convert(a, "days", ctx, basis);
  if (b.kind === "interval") b = convert(b, "days", ctx, basis);
  if (!("amount" in a) || !("amount" in b))
    return fail(
      "incompatible_types",
      "Operation is not defined for these values.",
    );
  if (a.kind === "money" && b.kind === "money" && a.currency !== b.currency)
    b = convert(b, a.currency, ctx, basis) as typeof b;
  if (a.kind === "quantity" && b.kind === "quantity" && a.unit !== b.unit)
    b = convert(b, a.unit, ctx, basis) as typeof b;
  const x = new D(a.amount),
    y = new D(b.amount);
  if (op === "/" && y.isZero())
    return fail("division_by_zero", "Division by zero.");
  if (a.kind === "number" && b.kind === "number") {
    const amount =
      op === "+"
        ? x.plus(y)
        : op === "-"
          ? x.minus(y)
          : op === "*"
            ? x.mul(y)
            : x.div(y);
    const percentage =
      op === "+" || op === "-"
        ? a.percentage === true && b.percentage === true
        : op === "*"
          ? (a.percentage === true) !== (b.percentage === true)
          : a.percentage === true && b.percentage !== true;
    return {
      kind: "number",
      amount: amount.toString(),
      ...(percentage ? { percentage: true as const } : {}),
    };
  }
  if (op === "+" || op === "-") {
    if (a.kind !== b.kind)
      return fail(
        "incompatible_types",
        "Addition and subtraction require matching value types.",
      );
    return {
      ...a,
      ...(a.kind === "quantity" ? { interval: undefined } : {}),
      amount: (op === "+" ? x.plus(y) : x.minus(y)).toString(),
    };
  }
  if (op === "/" && a.kind === b.kind) return num(x.div(y));
  if (a.kind !== "number" && b.kind !== "number")
    return fail(
      "unsupported_compound_unit",
      "Compound unit arithmetic is not supported.",
    );
  if (op === "/" && a.kind === "number" && b.kind !== "number")
    return fail(
      "unsupported_compound_unit",
      "Inverse units are not supported.",
    );
  const prototype = a.kind === "number" ? b : a;
  return {
    ...prototype,
    ...(prototype.kind === "quantity" ? { interval: undefined } : {}),
    amount: (op === "*" ? x.mul(y) : x.div(y)).toString(),
  };
}
const months = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];
const fullNames = [
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
];
class Parser {
  pos = 0;

  constructor(
    public text: string,
    public ctx: EvaluationContext,
    public basis: Basis,
    public now: Temporal.ZonedDateTime,
  ) {}
  ws() {
    while (/\s/.test(this.text[this.pos] ?? "") && this.pos < this.text.length)
      this.pos++;
  }
  match(re: RegExp) {
    this.ws();
    const m = this.text.slice(this.pos).match(re);
    if (m) this.pos += m[0].length;
    return m;
  }
  expression(): Value {
    const annotationStart = this.pos;
    const annotation = this.match(/^([A-Za-z][A-Za-z ]*?)\s+was\s+/i);
    if (annotation) {
      if (
        annotation[1]
          .trim()
          .split(/\s+/)
          .some((name) => Object.hasOwn(this.ctx.variables ?? {}, name))
      )
        this.pos = annotationStart;
      else this.basis.notes.push(`Descriptive label: ${annotation[1].trim()}.`);
    }
    const question = this.match(
      /^(years?|months?|weeks?|days?)\s+(since|until)\b/i,
    );
    let a = this.sum();
    if (question) {
      if (a.kind !== "date")
        fail(
          "incompatible_types",
          "Calendar since/until questions require a date-only value; subtract timestamps explicitly for elapsed time.",
        );
      const today = date(this.now.toPlainDate().toString());
      const unit = canonical(question[1]);
      const since = question[2].toLowerCase() === "since";
      this.basis.notes.push(
        `Calendar ${unit} ${since ? "since" : "until"} ${a.iso}, using actual local today ${today.iso}.`,
      );
      a = convert(
        { kind: "interval", start: since ? a : today, end: since ? today : a },
        unit,
        this.ctx,
        this.basis,
      );
    }
    if ((a.kind === "date" || a.kind === "datetime") && this.match(/^to\b/i)) {
      const end = this.sum();
      if (
        (a.kind !== "date" && a.kind !== "datetime") ||
        (end.kind !== "date" && end.kind !== "datetime")
      )
        fail(
          "incompatible_types",
          "Date range requires two dates or timestamps; use in for unit conversion.",
        );
      this.basis.notes.push(`Date range from ${a.iso} to ${end.iso}.`);
      a = { kind: "interval", start: a, end };
    }
    while (this.match(/^(?:in|to)\b/i)) {
      const t = this.match(/^(?:[A-Za-z]+\b|[$€₪£])/);
      if (!t) fail("syntax", "Expected conversion unit.");
      a = convert(a, t[0], this.ctx, this.basis);
    }
    return a;
  }
  sum(): Value {
    let a = this.product();
    for (;;) {
      const op = this.match(/^[+-]/);
      if (!op) return a;
      let b = this.product();
      if (
        b.kind === "number" &&
        b.percentage === true &&
        !(a.kind === "number" && a.percentage === true)
      ) {
        this.basis.notes.push(
          "Added/subtracted percentage is relative to the preceding amount.",
        );
        b = binary(a, "*", b, this.ctx, this.basis);
      }
      a = binary(a, op[0], b, this.ctx, this.basis);
    }
  }
  product(): Value {
    let a = this.unary();
    for (;;) {
      const op =
        this.match(/^[*/]/) ??
        (a.kind === "number" && a.percentage === true
          ? this.match(/^of\b/i)
          : null);
      if (!op) return a;
      a = binary(
        a,
        op[0].toLowerCase() === "of" ? "*" : op[0],
        this.unary(),
        this.ctx,
        this.basis,
      );
      if (op[0].toLowerCase() === "of" && a.kind === "number")
        a = num(a.amount);
    }
  }
  unary(): Value {
    const op = this.match(/^[+-]/);
    if (op) {
      const v = this.unary();
      if (!("amount" in v))
        return fail(
          "incompatible_types",
          "Unary sign requires a numeric value.",
        );
      const signed: Value = {
        ...v,
        ...(v.kind === "quantity" && op[0] === "-"
          ? { interval: undefined }
          : {}),
        amount: op[0] === "-" ? new D(v.amount).neg().toString() : v.amount,
      };

      return signed;
    }
    return this.postfix();
  }
  postfix(): Value {
    let v = this.primary();
    if (this.match(/^%/)) {
      if (v.kind !== "number")
        fail("incompatible_types", "Percent requires a number.");
      v = num(new D(v.amount).div(100));
      v = { ...v, percentage: true } as Value;
    }
    const saved = this.pos;
    const suffix = this.match(/^(?:[A-Za-z]+\b|[$€₪£])/);
    if (suffix) {
      const u = canonical(suffix[0]);
      if (v.kind === "number" && isCurrency(suffix[0]))
        v = { kind: "money", amount: v.amount, currency: currency(suffix[0]) };
      else if (v.kind === "number" && units.has(u))
        v = { kind: "quantity", amount: v.amount, unit: u };
      else this.pos = saved;
    }
    const annotationStart = this.pos;
    const annotation = this.match(/^(?:earnings|people|persons?|tip)\b/i);
    if (annotation) {
      if (Object.hasOwn(this.ctx.variables ?? {}, annotation[0]))
        this.pos = annotationStart;
      else this.basis.notes.push(`Descriptive annotation: ${annotation[0]}.`);
    }
    return v;
  }
  primary(): Value {
    const prefixStart = this.pos;
    const prefix = this.match(currencyToken);
    if (prefix && !Object.hasOwn(this.ctx.variables ?? {}, prefix[0])) {
      const amount = this.unary();
      if (amount.kind !== "number")
        fail(
          "incompatible_types",
          "Currency prefix requires a dimensionless amount.",
        );
      return {
        kind: "money",
        amount: amount.amount,
        currency: currency(prefix[0]),
      };
    }
    this.pos = prefixStart;
    if (this.match(/^\(/)) {
      const v = this.expression();
      if (!this.match(/^\)/)) fail("syntax", "Expected closing parenthesis.");
      return v;
    }
    if (this.match(/^ln\b/i)) {
      if (!this.match(/^\(/)) fail("syntax", "ln needs parentheses.");
      const v = this.expression();
      if (!this.match(/^\)/) || v.kind !== "number")
        fail("syntax", "ln requires one number.");
      if (new D(v.amount).lte(0))
        fail("domain", "ln requires a positive number.");
      return num(new D(v.amount).ln());
    }
    if (this.match(/^today\b/i)) return date(this.now.toPlainDate().toString());
    if (this.match(/^now\b/i)) return datetime(this.now.toString());
    if (this.match(/^previous\s+saturday\b/i)) {
      const days = (this.now.dayOfWeek - 6 + 7) % 7 || 7;
      this.basis.notes.push(
        "Previous Saturday is strictly before the current local date.",
      );
      return this.withTime(this.now.toPlainDate().subtract({ days }));
    }
    const iso = this.match(/^\d{4}-\d{2}-\d{2}(?!\d)/);
    if (iso) return this.withTime(Temporal.PlainDate.from(iso[0]));
    const english =
      this.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\b/) ??
      this.match(
        /^(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i,
      );
    if (english) {
      const monthName = english[2].toLowerCase();
      const month =
        Math.max(months.indexOf(monthName), fullNames.indexOf(monthName)) + 1;
      if (!month) fail("invalid_date", "Unknown English month.");
      const year =
        english[3] === undefined
          ? Temporal.PlainDate.from(this.basis.anchorDate).year
          : +english[3];
      if (english[3] === undefined) {
        this.basis.notes.push(
          `Omitted year in "${english[0]}" resolved to ${year} from anchor ${this.basis.anchorDate}; no future-year rollover.`,
        );
      }
      return this.withTime(
        Temporal.PlainDate.from(
          { year, month, day: +english[1] },
          { overflow: "reject" },
        ),
      );
    }
    // English grouping only: contiguous comma-separated groups of exactly three
    // digits. Never strip commas globally (they may delimit function arguments).
    const n = this.match(/^(?:\d{1,3}(?:,\d{3})+(?:\.\d*)?(?:e[+-]?\d+)?)(?![\d,])/i)
      ?? this.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
    if (n) {
      const multiplier = this.text
        .slice(this.pos)
        .match(/^(k|K|M|B)(?![A-Za-z0-9_])/);
      if (multiplier) {
        this.pos += multiplier[0].length;
        const factor =
          multiplier[0].toLowerCase() === "k"
            ? 1000
            : multiplier[0] === "M"
              ? 1000000
              : 1000000000;
        return num(new D(n[0].replaceAll(",", "")).mul(factor));
      }
      return num(n[0].replaceAll(",", ""));
    }
    const id = this.match(/^[A-Za-z_][\w]*/);
    if (id) {
      const v =
        this.ctx.variables && Object.hasOwn(this.ctx.variables, id[0])
          ? this.ctx.variables[id[0]]
          : undefined;
      if (v) return v;
      const monthName = id[0].toLowerCase();
      const month =
        Math.max(months.indexOf(monthName), fullNames.indexOf(monthName)) + 1;
      if (month > 0) {
        const explicitYear = this.match(/^\d{4}\b/);
        const year = explicitYear
          ? +explicitYear[0]
          : Temporal.PlainDate.from(this.basis.anchorDate).year;
        this.basis.notes.push(
          explicitYear
            ? `Month "${id[0]} ${explicitYear[0]}" assumes day 1; explicit year ${year}.`
            : `Month "${id[0]}" assumes day 1 and year ${year} from anchor ${this.basis.anchorDate}; no future-year rollover.`,
        );
        return this.withTime(
          Temporal.PlainDate.from(
            { year, month, day: 1 },
            { overflow: "reject" },
          ),
        );
      }
      return fail("unknown_variable", `Unknown variable: ${id[0]}`);
    }
    return fail("syntax", `Unexpected input at column ${this.pos + 1}.`);
  }
  withTime(d: Temporal.PlainDate): DateValue {
    const t = this.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?\b/i);
    if (!t) return date(d.toString());
    let hour = +t[1];
    if (t[4]) {
      if (hour < 1 || hour > 12)
        fail("invalid_time", "AM/PM hour must be 1..12.");
      hour = (hour % 12) + (t[4].toLowerCase() === "pm" ? 12 : 0);
    }
    const plain = d.toPlainDateTime(
      Temporal.PlainTime.from(
        { hour, minute: +t[2], second: +(t[3] ?? 0) },
        { overflow: "reject" },
      ),
    );
    try {
      return datetime(
        plain
          .toZonedDateTime(this.basis.timezone, { disambiguation: "reject" })
          .toString(),
      );
    } catch {
      return fail(
        "ambiguous_time",
        "Local time is missing or ambiguous across a timezone transition; choose an unambiguous time.",
      );
    }
  }
}
export function formatValue(v: Value): string {
  if (v.kind === "number") return v.amount;
  if (v.kind === "money") {
    const amount = new D(v.amount);
    const symbol =
      v.currency === "USD"
        ? "$"
        : v.currency === "EUR"
          ? "€"
          : v.currency === "ILS"
            ? "₪"
            : undefined;
    return symbol
      ? `${amount.isNegative() ? "-" : ""}${symbol}${amount.abs().toFixed(2)}`
      : `${amount.toFixed(2)} ${v.currency}`;
  }
  if (v.kind === "quantity") {
    if (v.interval) {
      const { start, end } = v.interval;
      if (
        start.kind === "date" &&
        end.kind === "date" &&
        ["years", "months", "weeks"].includes(v.unit)
      ) {
        const duration = Temporal.PlainDate.from(start.iso).until(
          Temporal.PlainDate.from(end.iso),
          {
            largestUnit: v.unit as "years" | "months" | "weeks",
          },
        );
        const parts = (["years", "months", "weeks", "days"] as const)
          .filter((unit) => duration[unit] !== 0)
          .map((unit) => {
            const amount = Math.abs(duration[unit]);
            return `${amount} ${amount === 1 ? unit.slice(0, -1) : unit}`;
          });
        const text = parts.join(" ") || `0 ${v.unit}`;
        return duration.sign < 0
          ? parts.length > 1
            ? `−(${text})`
            : `-${text}`
          : text;
      }
      // Timestamp-backed quantities retain elapsed-unit semantics. Round only
      // presentation, explicitly marked approximate; arithmetic uses v.amount.
      const displayed = new D(v.amount).toSignificantDigits(12);
      return `${displayed.eq(v.amount) ? "" : "≈"}${displayed.toString()} ${v.unit}`;
    }
    return `${v.amount} ${v.unit}`;
  }
  if (v.kind === "interval") {
    let duration: Temporal.Duration;
    if (v.start.kind === "date" && v.end.kind === "date")
      duration = Temporal.PlainDate.from(v.start.iso).until(
        Temporal.PlainDate.from(v.end.iso),
        { largestUnit: "years" },
      );
    else {
      const zone = Temporal.ZonedDateTime.from(
        v.start.kind === "datetime" ? v.start.iso : v.end.iso,
      ).timeZoneId;
      const local = (d: DateValue) =>
        d.kind === "datetime"
          ? Temporal.ZonedDateTime.from(d.iso)
          : Temporal.PlainDate.from(d.iso).toZonedDateTime(zone);
      duration = local(v.start).until(local(v.end), { largestUnit: "years" });
    }
    const parts = (
      ["years", "months", "days", "hours", "minutes", "seconds"] as const
    )
      .filter((unit) => duration[unit] !== 0)
      .map((unit) => {
        const amount = Math.abs(duration[unit]);
        return `${amount} ${amount === 1 ? unit.slice(0, -1) : unit}`;
      });
    return (duration.sign < 0 ? "−" : "") + (parts.join(" ") || "0 days");
  }
  return v.iso;
}
export function evaluateExpression(
  source: string,
  context: EvaluationContext = {},
): EvaluationResult {
  const basis: Basis = {
    timezone: context.timezone ?? "Asia/Jerusalem",
    anchorDate: "",
    anchorMode: context.anchor?.mode ?? "today",
    notes: [],
  };
  try {
    const now = (
      context.now ? Temporal.Instant.from(context.now) : Temporal.Now.instant()
    ).toZonedDateTimeISO(basis.timezone);
    basis.anchorDate =
      basis.anchorMode === "fixed"
        ? Temporal.PlainDate.from(
            context.anchor?.date ??
              fail("invalid_anchor", "Fixed anchor requires a date."),
          ).toString()
        : now.toPlainDate().toString();
    const parser = new Parser(
      source
        .replace(/\u00a0/g, " ")
        .replace(/÷/g, "/")
        .replace(/×/g, "*"),
      context,
      basis,
      now,
    );
    const value = parser.expression();
    parser.ws();
    if (parser.pos !== parser.text.length)
      fail("syntax", `Unexpected trailing input at column ${parser.pos + 1}.`);
    if ("amount" in value && !new D(value.amount).isFinite())
      fail("nonfinite", "Result is not finite.");
    basis.notes = [...new Set(basis.notes)];
    return {
      ok: true,
      value,
      formatted: formatValue(value),
      diagnostics: [],
      basis,
    };
  } catch (e) {
    return {
      ok: false,
      diagnostics: [
        {
          code: e instanceof CalcError ? e.code : "invalid_input",
          message: e instanceof Error ? e.message : "Invalid input",
        },
      ],
      basis,
    };
  }
}
export function countBillingMonths(
  startISO: string,
  endISO: string,
  mode: "completed" | "include-partial" = "completed",
): { completed: number; billed: number; partial: boolean; direction: number } {
  const start = Temporal.PlainDate.from(startISO),
    end = Temporal.PlainDate.from(endISO),
    direction = Temporal.PlainDate.compare(end, start) >= 0 ? 1 : -1;
  let count = Math.abs(start.until(end, { largestUnit: "months" }).months);
  const reached = (n: number) =>
    Temporal.PlainDate.compare(start.add({ months: n * direction }), end) *
      direction <=
    0;
  while (reached(count + 1)) count++;
  while (count > 0 && !reached(count)) count--;
  const partial = !start.add({ months: count * direction }).equals(end);
  return {
    completed: count * direction,
    billed:
      (count + (mode === "include-partial" && partial ? 1 : 0)) * direction,
    partial,
    direction,
  };
}
