# Currency snapshots

This adapter supplies ILS/USD snapshots to the pure calculator core. It uses the
[Frankfurter v2 ECB rate endpoint](https://api.frankfurter.dev/v2/providers/ecb/rate/ils/usd)
and records the source as Frankfurter / European Central Bank. See the
[provider documentation](https://frankfurter.dev/) for coverage and update behavior.
The endpoint requires no API key and receives only the currency pair, never
worksheet text, amounts, dates, names or other user data.

`loadRates({directory, now?, maxAgeMs?})` reads the cache without network access.
`refreshRates({...options, fetch?, timeoutMs?})` explicitly refreshes with a
bounded request (10 seconds by default). Both return:

```ts
{
  snapshot?: {base: string, rates: Record<string,string>, source: string, asOf: string},
  status: "fresh" | "stale" | "unavailable",
  error?: string,
  fetchedAt?: string
}
```

Pass a returned snapshot as `EvaluationContext.rates`. Core performs exact
Decimal conversion; this adapter performs no worksheet arithmetic. Inverse
USD-to-ILS conversion is supported through the same base snapshot by core.

Freshness is computed from the provider's as-of date at UTC midnight, never from
the recent download time. The default threshold is 72 hours, editable through
`maxAgeMs`. This is an application freshness policy, not a guarantee that a
provider rate represents current transaction pricing. The UI should show source,
as-of date and status; a cached stale rate remains usable when clearly marked.

A failed refresh returns the last validated cache plus an error. With no cache,
status is unavailable and no fabricated snapshot is returned. An invalid pair,
nonpositive/nonfinite rate, impossible/future date or malformed response cannot
replace a valid cache. Older provider data cannot regress a newer cached date.
Display `error` even when the retained cache is fresh.

The versioned cache is app-owned, checksum-validated and replaced atomically with
mode 0600. A successful network response whose cache write fails remains usable
for the current session but carries a persistence error. Settings and worksheets
remain in the document package, not in this currency cache. No startup daemon or
automatic background refresh is introduced.

Offline tests inject fetch and clock, covering invalid data, cache corruption,
staleness, failure, timeout and persistence. Run `bun test packages/rates` and
`bun run --cwd packages/rates typecheck`. Tests never call the live provider.
