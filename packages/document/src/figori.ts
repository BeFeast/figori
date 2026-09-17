
import {parse, stringify} from "smol-toml";
import {importDocument, validateSettings, type Worksheet, type WorksheetSettings} from "./index";

function record(value: unknown, name: string): Record<string,unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid " + name);
  return value as Record<string,unknown>;
}
function keys(value:Record<string,unknown>, allowed:string[], name:string) {
  if (Object.keys(value).some(key=>!allowed.includes(key))) throw new Error("Unsupported " + name + " field");
}
function identity(value:unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}
/** Version 1 stores source and identity, never derived results. Unknown fields are rejected. */
export function parseFigori(text:string):Worksheet {
  if (new TextEncoder().encode(text).length > 32 * 1024 * 1024) throw new Error("Figori file exceeds 32 MB");
  const opening=text.match(/^\+\+\+(?:\r\n|\n)/);
  if(!opening) throw new Error("Figori file must begin with +++ frontmatter");
  const remaining=text.slice(opening[0].length);
  const closing=/^\+\+\+(?:\r\n|\n)/m.exec(remaining);
  if(!closing) throw new Error("Missing Figori closing frontmatter delimiter and newline");
  const source=remaining.slice(closing.index+closing[0].length);
  const data=record(parse(remaining.slice(0,closing.index)),"Figori document");
  keys(data,["format","schema_version","id","source_format","line_ids","settings"],"document");
  if(data.format!=="figori") throw new Error("Invalid Figori format marker");
  if(data.schema_version!==1) throw new Error("Unsupported Figori schema version");
  if(!identity(data.id) || !["numi","markdown"].includes(String(data.source_format))) throw new Error("Invalid Figori identity or source");
  const settings=record(data.settings,"settings");
  keys(settings,["timezone","anchor","billing"],"settings");
  const anchor=record(settings.anchor,"anchor");
  keys(anchor,["mode","date"],"anchor");
  validateSettings(settings as unknown as WorksheetSettings);
  const doc=importDocument(source,{id:data.id,format:data.source_format as "numi"|"markdown",settings:settings as unknown as WorksheetSettings});
  if(!Array.isArray(data.line_ids) || data.line_ids.length!==doc.lines.length || !data.line_ids.every(identity) || new Set(data.line_ids).size!==data.line_ids.length) throw new Error("Invalid or mismatched Figori line identities");
  doc.lines.forEach((line,index)=>{line.id=(data.line_ids as string[])[index]!;});
  return doc;
}
/** TOML syntax/comments are normalized; source string itself is preserved exactly. */
export function serializeFigori(document:Worksheet):string {
  if(document.lines.map(line=>line.source+line.ending).join("")!==document.source) throw new Error("Worksheet lines do not match source");
  const metadata=stringify({
    format:"figori",schema_version:1,id:document.id,source_format:document.format,
    line_ids:document.lines.map(line=>line.id),
    settings:document.settings,
  });
  // Canonical LF framing; source begins immediately after the closing delimiter newline.
  const text="+++\n"+metadata.replace(/\r\n/g,"\n").replace(/\n?$/,"\n")+"+++\n"+document.source;
  parseFigori(text);
  return text;
}
