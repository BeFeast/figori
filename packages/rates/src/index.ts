import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";

export interface RateSnapshot {
  base: string;
  rates: Record<string, string>;
  source: string;
  asOf: string;
}
export interface RateState {
  snapshot?: RateSnapshot;
  status: "fresh" | "stale" | "unavailable";
  error?: string;
  fetchedAt?: string;
}
type FetchResponse = Pick<Response, "ok" | "status" | "json">;
export interface RateOptions {
  directory: string;
  now?: Date;
  maxAgeMs?: number;
}
export interface RefreshOptions extends RateOptions {
  fetch?: (url: string, init?: RequestInit) => Promise<FetchResponse>;
  timeoutMs?: number;
}
interface Cache {
  schemaVersion: 1;
  snapshot: RateSnapshot;
  fetchedAt: string;
  checksum: string;
}
export const PROVIDER_URL = "https://api.frankfurter.dev/v2/providers/ecb/rate/ils/usd";
export const PROVIDER_NAME = "Frankfurter / European Central Bank";
export const DEFAULT_MAX_AGE_MS = 72 * 60 * 60 * 1000;
const filename = "ecb-ils-usd.v1.json";
function checksum(snapshot: RateSnapshot): string {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}
function clock(options: RateOptions): Date {
  const now = options.now ?? new Date();
  if (!Number.isFinite(now.valueOf())) throw new Error("Invalid rates clock");
  return now;
}
function dateStamp(date: unknown): string {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Rate as-of date must be ISO YYYY-MM-DD");
  const parsed = new Date(date + "T00:00:00Z");
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) throw new Error("Invalid rate as-of date");
  return date;
}
function rateAmount(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") throw new Error("Missing exchange rate");
  const text = String(value);
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text) || !Number.isFinite(Number(text)) || Number(text) <= 0) throw new Error("Exchange rate must be finite and positive");
  return text;
}
function checkedSnapshot(snapshot: RateSnapshot, now: Date): RateSnapshot {
  if (!snapshot || snapshot.base !== "ILS" || snapshot.source !== PROVIDER_NAME || !snapshot.rates || typeof snapshot.rates !== "object") throw new Error("Invalid rate snapshot provenance or currency pair");
  const asOf = dateStamp(snapshot.asOf);
  if (asOf > now.toISOString().slice(0, 10)) throw new Error("Rate snapshot is from the future");
  return { base: "ILS", rates: { USD: rateAmount(snapshot.rates.USD) }, source: PROVIDER_NAME, asOf };
}
function state(snapshot: RateSnapshot, options: RateOptions, fetchedAt?: string): RateState {
  const maxAge = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  if (!Number.isFinite(maxAge) || maxAge < 0) throw new Error("Invalid rate maximum age");
  const age = clock(options).valueOf() - new Date(snapshot.asOf + "T00:00:00Z").valueOf();
  return { snapshot, status: age > maxAge ? "stale" : "fresh", ...(fetchedAt ? { fetchedAt } : {}) };
}

/** Reads cache only. Network access is explicit through refreshRates. */
export async function loadRates(options: RateOptions): Promise<RateState> {
  try {
    const cached = JSON.parse(await readFile(join(options.directory, filename), "utf8")) as Cache;
    if (cached.schemaVersion !== 1 || cached.checksum !== checksum(cached.snapshot)) throw new Error("Invalid rate cache version or checksum");
    const snapshot = checkedSnapshot(cached.snapshot, clock(options));
    if (typeof cached.fetchedAt !== "string" || !Number.isFinite(new Date(cached.fetchedAt).valueOf())) throw new Error("Invalid cache fetch timestamp");
    return state(snapshot, options, cached.fetchedAt);
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException)?.code === "ENOENT";
    return { status: "unavailable", ...(missing ? {} : { error: error instanceof Error ? error.message : String(error) }) };
  }
}

async function writeCache(snapshot: RateSnapshot, options: RateOptions): Promise<string> {
  await mkdir(options.directory, { recursive: true, mode: 0o700 });
  const path = join(options.directory, filename);
  const temporary = join(options.directory, "." + filename + "." + randomUUID() + ".tmp");
  const fetchedAt = clock(options).toISOString();
  const cache: Cache = { schemaVersion: 1, snapshot, fetchedAt, checksum: checksum(snapshot) };
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(JSON.stringify(cache) + "\n", "utf8");
    await handle.sync();
    await handle.close(); handle = undefined;
    await rename(temporary, path);
  } finally {
    await handle?.close();
    await unlink(temporary).catch((error) => { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; });
  }
  return fetchedAt;
}

/** Fetches the public currency pair only; no worksheet content is sent. */
export async function refreshRates(options: RefreshOptions): Promise<RateState> {
  const cached = await loadRates(options);
  try {
    const fetcher = options.fetch ?? globalThis.fetch;
    const timeoutMs = options.timeoutMs ?? 10_000;
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1) throw new Error("Invalid rate request timeout");
    const response = await fetcher(PROVIDER_URL, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error("Exchange-rate provider returned HTTP " + response.status);
    const data: unknown = await response.json();
    if (!data || typeof data !== "object") throw new Error("Invalid exchange-rate response");
    const row = data as Record<string, unknown>;
    if (row.base !== "ILS" || row.quote !== "USD") throw new Error("Unexpected exchange-rate currency pair");
    const snapshot = checkedSnapshot({
      base: "ILS", rates: { USD: rateAmount(row.rate) }, source: PROVIDER_NAME, asOf: dateStamp(row.date),
    }, clock(options));
    // Do not regress to an older provider snapshot.
    if (cached.snapshot && cached.snapshot.asOf > snapshot.asOf) {
      return { ...cached, error: "Provider returned an older rate; kept the newer cached snapshot." };
    }
    try {
      const fetchedAt = await writeCache(snapshot, options);
      return state(snapshot, options, fetchedAt);
    } catch (error) {
      return { ...state(snapshot, options), error: "Rate fetched but cache save failed: " + (error instanceof Error ? error.message : String(error)) };
    }
  } catch (error) {
    return { ...cached, error: "Rate refresh failed: " + (error instanceof Error ? error.message : String(error)) };
  }
}
