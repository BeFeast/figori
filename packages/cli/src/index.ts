#!/usr/bin/env bun
import {
  evaluateExpression,
  countBillingMonths,
  type EvaluationContext,
} from "../../core/src/index.ts";
const args = process.argv.slice(2);
if (args.includes("--request")) {
  const { handleRequest, readRequest } = await import("./protocol.ts");
  let response: Record<string, unknown>;
  try {
    response = await handleRequest(await readRequest(Bun.stdin.stream()));
  } catch (error) {
    response = {
      version: 1,
      id: "",
      ok: false,
      diagnostics: [
        {
          code: "request_error",
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
  console.log(JSON.stringify(response));
  process.exit(response.ok ? 0 : 1);
}
const context: EvaluationContext = {};
let json = false;
const expressions: string[] = [];
function usage() {
  console.log(
    "my-numi [--json] [--now ISO_INSTANT] [--timezone IANA] [--anchor YYYY-MM-DD] [--rates snapshot.json] EXPRESSION\nmy-numi --billing START END [--include-partial] [--json]\nmy-numi --request  (one JSON request line on stdin; document/storage/rates protocol)\nNo expression: read one expression per stdin line. JSON protocol version: 1.",
  );
}
try {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = () => {
      if (!args[i + 1]) throw Error(`Missing value for ${arg}`);
      return args[++i];
    };
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
    if (arg === "--json") json = true;
    else if (arg === "--now") context.now = next();
    else if (arg === "--timezone") context.timezone = next();
    else if (arg === "--anchor")
      context.anchor = { mode: "fixed", date: next() };
    else if (arg === "--rates")
      context.rates = JSON.parse(await Bun.file(next()).text());
    else if (arg === "--include-partial") context.billing = "include-partial";
    else if (arg === "--billing") {
      const start = next(),
        end = next();
      expressions.push(`__billing:${start}:${end}`);
    } else if (arg.startsWith("--")) throw Error(`Unknown option: ${arg}`);
    else expressions.push(arg);
  }
  context.now ??= new Date().toISOString();
  const lines = expressions.length
    ? [expressions.join(" ")]
    : (await Bun.stdin.text()).split(/\r?\n/).filter((x) => x.trim());
  if (!lines.length) {
    usage();
    process.exit(0);
  }
  for (const source of lines) {
    if (source.startsWith("__billing:")) {
      const [, start, end] = source.split(":");
      const value = countBillingMonths(start, end, context.billing);
      console.log(
        json
          ? JSON.stringify({ version: 1, ok: true, billing: value })
          : `${value.billed} billing months (${value.completed} completed; partial=${value.partial})`,
      );
      continue;
    }
    const result = evaluateExpression(source, context);
    console.log(
      json
        ? JSON.stringify({ version: 1, source, ...result })
        : result.ok
          ? `${result.formatted}\n  anchor: ${result.basis.anchorDate} (${result.basis.anchorMode}); timezone: ${result.basis.timezone}${result.basis.notes.length ? "\n  " + result.basis.notes.join(" ") : ""}`
          : result.diagnostics.map((d) => `${d.code}: ${d.message}`).join("\n"),
    );
    if (!result.ok) process.exitCode = 1;
  }
} catch (e) {
  const message = e instanceof Error ? e.message : String(e);
  console.error(
    json
      ? JSON.stringify({
          version: 1,
          ok: false,
          diagnostics: [{ code: "cli_error", message }],
        })
      : message,
  );
  process.exitCode = 1;
}
