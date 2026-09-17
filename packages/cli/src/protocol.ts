import { homedir } from "node:os";
import { join } from "node:path";
import {
  evaluateExpression,
  type EvaluationContext,
  type Value,
} from "../../core/src/index.ts";
import {
  importDocument,
  updateDocument,
  evaluateDocument,
  type Worksheet,
  type SourceFormat,
  type WorksheetSettings,
} from "../../document/src/index.ts";
import {
  saveDocument,
  loadDocument,
  listDocuments,
  importFile,
  exportNumi,
} from "../../document/src/storage.ts";

import { loadRates, refreshRates } from "../../rates/src/index.ts";

export interface Request {
  version: 1;
  id: string;
  op: string;
  source?: string;
  format?: SourceFormat;
  settings?: Partial<WorksheetSettings>;
  context?: EvaluationContext;
  directory?: string;
  documentId?: string;
  path?: string;
  overwrite?: boolean;
}
function required(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.length)
    throw new Error(`${name} must be a non-empty string`);
  return value;
}
function source(request: Request): string {
  if (typeof request.source !== "string")
    throw new Error("source must be a string");
  return request.source;
}
function format(request: Request): SourceFormat {
  if (
    request.format !== undefined &&
    request.format !== "numi" &&
    request.format !== "markdown"
  )
    throw new Error("Unknown document format");
  return request.format ?? "numi";
}
function snapshot(request: Request): Worksheet {
  return importDocument(source(request), {
    format: format(request),
    settings: request.settings,
  });
}
export function defaultDirectory(): string {
  return (
    process.env.FIGORI_DATA_DIR ??
    process.env.MY_NUMI_DATA_DIR ??
    join(
      process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"),
      "my-numi",
      "worksheets",
    )
  );
}
export async function handleRequest(
  input: unknown,
): Promise<Record<string, unknown>> {
  const id =
    input &&
    typeof input === "object" &&
    "id" in input &&
    typeof input.id === "string"
      ? input.id
      : "";
  try {
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new Error("Request must be an object");
    const request = input as Request;
    if (request.version !== 1)
      throw new Error("Unsupported request protocol version");
    required(request.id, "id");
    required(request.op, "op");
    const options = {
      directory:
        request.directory === undefined
          ? defaultDirectory()
          : required(request.directory, "directory"),
    };
    let data: unknown;
    switch (request.op) {
      case "evaluate":
        data = evaluateExpression(source(request), request.context);
        break;
      case "document.evaluate": {
        const document = snapshot(request);
        const context = {
          ...request.context,
          now: request.context?.now ?? new Date().toISOString(),
        };
        data = evaluateDocument<Value, typeof context>(
          document,
          evaluateExpression,
          context,
        );
        break;
      }
      case "rates.load":
        data = await loadRates({ directory: join(options.directory, "rates") });
        break;
      case "rates.refresh":
        data = await refreshRates({
          directory: join(options.directory, "rates"),
        });
        break;
      case "document.list":
        data = await listDocuments(options);
        break;
      case "document.load":
        data = await loadDocument(
          required(request.documentId, "documentId"),
          options,
        );
        break;
      case "document.save": {
        let document: Worksheet;
        if (request.documentId) {
          const loaded = await loadDocument(
            required(request.documentId, "documentId"),
            options,
          );
          if (
            request.format !== undefined &&
            request.format !== loaded.document.format
          )
            throw new Error(
              "Changing saved document format requires an explicit import into a new document",
            );
          document = updateDocument(loaded.document, source(request));
          // Re-parse settings through the validated constructor, keeping source and line identities.
          const validated = importDocument(document.source, {
            id: document.id,
            format:
              request.format === undefined ? document.format : format(request),
            settings: {
              ...document.settings,
              ...request.settings,
              anchor: request.settings?.anchor ?? document.settings.anchor,
            },
          });
          document = { ...validated, lines: document.lines };
        } else document = snapshot(request);
        const receipt = await saveDocument(document, options);
        data = { document, ...receipt };
        break;
      }
      case "document.import":
        data = {
          document: await importFile(required(request.path, "path"), {
            format: request.format,
            settings: request.settings,
          }),
        };
        break;
      case "document.export": {
        const document =
          request.source !== undefined
            ? snapshot(request)
            : (
                await loadDocument(
                  required(request.documentId, "documentId"),
                  options,
                )
              ).document;
        data = await exportNumi(document, required(request.path, "path"), {
          overwrite: request.overwrite === true,
        });
        break;
      }
      default:
        throw new Error(`Unknown operation: ${request.op}`);
    }
    return { version: 1, id, ok: true, data };
  } catch (error) {
    return {
      version: 1,
      id,
      ok: false,
      diagnostics: [
        {
          code: "request_error",
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
}

/** One JSON line per short-lived request process; no EOF or persistent daemon required. */
export async function readRequest(
  stream: ReadableStream<Uint8Array>,
): Promise<unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      text += done ? decoder.decode() : decoder.decode(value, { stream: true });
      if (text.length > 2_000_000)
        throw new Error("Request exceeds 2 MB limit");
      const newline = text.indexOf("\n");
      if (newline >= 0) return JSON.parse(text.slice(0, newline));
      if (done) return JSON.parse(text);
    }
  } finally {
    await reader.cancel();
  }
}
