import { environment } from "@raycast/api";
import { join } from "node:path";
import { importDocument, updateDocument, type Worksheet } from "@my-numi/document";
import { saveDocument, listDocuments, loadDocument, importFile, exportNumi } from "@my-numi/document/storage";
import { defaults, type Settings } from "./model";
export const storageOptions = { directory: join(environment.supportPath, "worksheets") };
export { importDocument, updateDocument, saveDocument, listDocuments, loadDocument, importFile, exportNumi };
export type { Worksheet };
export function settingsFrom(doc: Worksheet): Settings {
  return { ...defaults, timezone: doc.settings.timezone, anchorMode: doc.settings.anchor.mode, anchorDate: doc.settings.anchor.date ?? "", includePartial: doc.settings.billing === "include-partial" };
}
export function settingsTo(settings: Settings): Worksheet["settings"] {
  return { timezone: settings.timezone, anchor: settings.anchorMode === "today" ? { mode: "today" } : { mode: "fixed", date: settings.anchorDate }, billing: settings.includePartial ? "include-partial" : "completed" };
}
