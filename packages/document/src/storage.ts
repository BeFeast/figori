import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, readFile, writeFile, rename, unlink, open, link, readdir, stat, copyFile, rmdir } from "node:fs/promises";
import { dirname, basename, join, extname } from "node:path";
import { importDocument, serializeNumi, validateSettings, type Worksheet, type WorksheetSettings, type SourceFormat } from "./index";

interface Snapshot {
  schemaVersion: 1;
  document: Worksheet;
  sourceHash: string;
  updatedAt: string;
}
export interface StorageOptions { directory: string }
export interface NumiSidecar {
  schemaVersion: 1;
  documentId: string;
  sourceHash: string;
  settings: WorksheetSettings;
  lineIds: string[];
}
function hash(source: string): string { return createHash("sha256").update(source, "utf8").digest("hex"); }
function checkId(id: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(id)) throw new Error("Invalid worksheet id");
}
function paths(id: string, options: StorageOptions) {
  checkId(id);
  return { path: join(options.directory, id + ".json"), recoveryPath: join(options.directory, id + ".recovery.json") };
}
function errorCode(error: unknown): string | undefined { return (error as NodeJS.ErrnoException)?.code; }
function decode(bytes: Uint8Array): string {
  // Keep the BOM in source; reject corrupt bytes instead of replacing source with U+FFFD.
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
}
function validateSnapshot(value: unknown, id: string): Snapshot {
  const snapshot = value as Snapshot;
  if (!snapshot || snapshot.schemaVersion !== 1 || typeof snapshot.updatedAt !== "string") throw new Error("Unsupported or invalid worksheet snapshot");
  const doc = snapshot.document;
  if (!doc || doc.schemaVersion !== 1 || doc.id !== id || typeof doc.source !== "string" || !["numi", "markdown"].includes(doc.format)) throw new Error("Invalid worksheet document");
  validateSettings(doc.settings);
  if (snapshot.sourceHash !== hash(doc.source)) throw new Error("Worksheet source checksum mismatch");
  const expected = importDocument(doc.source, doc);
  if (!Array.isArray(doc.lines) || doc.lines.length !== expected.lines.length) throw new Error("Invalid worksheet line metadata");
  const ids = new Set<string>();
  expected.lines.forEach((line, index) => {
    const saved = doc.lines[index]!;
    if (!saved || typeof saved.id !== "string" || !saved.id || ids.has(saved.id) || saved.source !== line.source || saved.ending !== line.ending) throw new Error("Invalid worksheet line identity");
    ids.add(saved.id);
    line.id = saved.id;
  });
  // Derive expression metadata again from preserved source instead of trusting stale cached parsing.
  return { ...snapshot, document: expected };
}
async function readSnapshot(path: string, id: string): Promise<Snapshot> {
  return validateSnapshot(JSON.parse(decode(await readFile(path))), id);
}
async function syncDirectory(directory: string): Promise<void> {
  let handle;
  try { handle = await open(directory, "r"); await handle.sync(); }
  catch (error) { if (!["EINVAL", "ENOTSUP", "EBADF"].includes(errorCode(error) ?? "")) throw error; }
  finally { await handle?.close(); }
}
async function atomicWrite(path: string, content: string, overwrite: boolean): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = join(dirname(path), "." + basename(path) + "." + randomUUID() + ".tmp");
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(content, "utf8");
    await handle.sync();
    await handle.close(); handle = undefined;
    if (overwrite) await rename(temporary, path);
    else { await link(temporary, path); await unlink(temporary); }
    await syncDirectory(dirname(path));
  } finally {
    await handle?.close();
    await unlink(temporary).catch((error) => { if (errorCode(error) !== "ENOENT") throw error; });
  }
}

/** Saves app-owned storage only. Import paths are never save targets. */
export async function saveDocument(document: Worksheet, options: StorageOptions): Promise<{ path: string; recoveryPath: string }> {
  const target = paths(document.id, options);
  validateSettings(document.settings);
  const snapshot: Snapshot = { schemaVersion: 1, document, sourceHash: hash(document.source), updatedAt: new Date().toISOString() };
  validateSnapshot(snapshot, document.id);
  await mkdir(options.directory, { recursive: true, mode: 0o700 });
  const lock = target.path + ".lock";
  try { await mkdir(lock, { mode: 0o700 }); }
  catch (error) { if (errorCode(error) === "EEXIST") throw new Error("Worksheet save already in progress (or stale lock after interruption): " + lock); throw error; }
  try {
    let previous: Snapshot | undefined;
    try { previous = await readSnapshot(target.path, document.id); }
    catch (error) {
      if (errorCode(error) !== "ENOENT") {
        // Never replace the last valid recovery with a corrupt primary.
        await readSnapshot(target.recoveryPath, document.id);
      }
    }
    if (previous) await atomicWrite(target.recoveryPath, JSON.stringify(previous), true);
    await atomicWrite(target.path, JSON.stringify(snapshot), true);
    // A first save also has an independently usable recovery copy.
    if (!previous) {
      try { await atomicWrite(target.recoveryPath, JSON.stringify(snapshot), false); }
      catch (error) { if (errorCode(error) !== "EEXIST") throw error; }
    }
    return target;
  } finally { await rmdir(lock); }
}

export async function loadDocument(id: string, options: StorageOptions): Promise<{ document: Worksheet; recovered: boolean }> {
  const target = paths(id, options);
  try { return { document: (await readSnapshot(target.path, id)).document, recovered: false }; }
  catch (primaryError) {
    try { return { document: (await readSnapshot(target.recoveryPath, id)).document, recovered: true }; }
    catch (recoveryError) {
      throw new AggregateError([primaryError, recoveryError], "Cannot open worksheet or its recovery copy: " + id);
    }
  }
}

export async function listDocuments(options: StorageOptions): Promise<Array<{
  id: string; title: string; format?: SourceFormat; updatedAt: string; recovered: boolean; error?: string;
}>> {
  let files: string[];
  try { files = await readdir(options.directory); }
  catch (error) { if (errorCode(error) === "ENOENT") return []; throw error; }
  const ids = new Set(files.filter((file) => file.endsWith(".json")).map((file) => file.replace(/(?:\.recovery)?\.json$/, "")));
  const result = [];
  for (const id of ids) {
    try {
    checkId(id);
    const loaded = await loadDocument(id, options);
    const target = paths(id, options);
    const snapshot = await readSnapshot(loaded.recovered ? target.recoveryPath : target.path, id);
    const first = loaded.document.lines.find((line) => line.source.trim())?.source ?? "Untitled worksheet";
    result.push({ id, title: first.replace(/^#+\s*/, "").slice(0, 100), format: loaded.document.format, updatedAt: snapshot.updatedAt, recovered: loaded.recovered });
    } catch (error) {
      result.push({ id, title: "Unreadable worksheet", updatedAt: "", recovered: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function importFile(path: string, options: {
  format?: SourceFormat; settings?: Partial<WorksheetSettings>; readSidecar?: boolean;
} = {}): Promise<Worksheet> {
  const source = decode(await readFile(path));
  const format = options.format ?? (extname(path).toLowerCase() === ".md" ? "markdown" : "numi");
  const document = importDocument(source, { format, settings: options.settings });
  if (options.readSidecar === false) return document;
  let sidecar: NumiSidecar;
  try { sidecar = JSON.parse(decode(await readFile(path + ".my-numi.json"))); }
  catch (error) { if (errorCode(error) === "ENOENT") return document; throw new Error("Invalid worksheet sidecar", { cause: error }); }
  if (sidecar.schemaVersion !== 1 || sidecar.sourceHash !== hash(source)) throw new Error("Worksheet sidecar version or source checksum mismatch; import with readSidecar:false to keep text without metadata");
  checkId(sidecar.documentId);
  validateSettings(sidecar.settings);
  if (!Array.isArray(sidecar.lineIds) || sidecar.lineIds.length !== document.lines.length || new Set(sidecar.lineIds).size !== sidecar.lineIds.length || sidecar.lineIds.some((id) => typeof id !== "string" || !id)) throw new Error("Invalid worksheet sidecar line ids");
  document.id = sidecar.documentId;
  document.settings = { ...sidecar.settings, ...options.settings, anchor: { ...(options.settings?.anchor ?? sidecar.settings.anchor) } };
  validateSettings(document.settings);
  document.lines.forEach((line, index) => { line.id = sidecar.lineIds[index]!; });
  return document;
}

export async function exportNumi(document: Worksheet, path: string, options: {
  overwrite?: boolean; sidecar?: boolean;
} = {}): Promise<{ path: string; sidecarPath?: string; warnings: string[] }> {
  const exported = serializeNumi(document);
  const sidecarPath = path + ".my-numi.json";
  const withSidecar = options.sidecar !== false;
  // Fail before touching either file if a destination already exists.
  if (!options.overwrite) {
    for (const destination of withSidecar ? [path, sidecarPath] : [path]) {
      try { await stat(destination); throw new Error("Export destination already exists: " + destination); }
      catch (error) { if (errorCode(error) !== "ENOENT") throw error; }
    }
  }
  if (options.overwrite) {
    // An explicit overwrite keeps the old plain text independently recoverable.
    try { await copyFile(path, path + ".recovery", constants.COPYFILE_EXCL); }
    catch (error) { if (!["ENOENT", "EEXIST"].includes(errorCode(error) ?? "")) throw error; }
  }
  await atomicWrite(path, exported.text, options.overwrite === true);
  if (withSidecar) {
    const sidecar: NumiSidecar = {
      schemaVersion: 1, documentId: document.id, sourceHash: hash(exported.text),
      settings: document.settings, lineIds: document.lines.map((line) => line.id),
    };
    try { await atomicWrite(sidecarPath, JSON.stringify(sidecar, null, 2) + "\n", options.overwrite === true); }
    catch (error) {
      // The valid plain text survives. A checksum mismatch prevents silently
      // applying old settings if interruption occurs between the two renames.
      throw new Error("Numi text exported, but sidecar save failed: " + path, { cause: error });
    }
  }
  return { path, ...(withSidecar ? { sidecarPath } : {}), warnings: exported.warnings };
}
