import { importDocument, updateDocument, type Worksheet } from "@my-numi/document";

export interface EditorState { document: Worksheet; cursor: number; dirty: boolean }
export type Edit =
  | { type: "insert"; text: string }
  | { type: "left" | "right" | "up" | "down" | "home" | "end" | "backspace" | "delete" };

export function createEditor(document = importDocument("", { format: "numi" })): EditorState {
  return { document, cursor: 0, dirty: false };
}
function previousOffset(text: string, offset: number): number {
  if (offset <= 0) return 0;
  if (text.slice(offset - 2, offset) === "\r\n") return offset - 2;
  const previous = text.charCodeAt(offset - 1);
  return offset - (previous >= 0xdc00 && previous <= 0xdfff && offset > 1 ? 2 : 1);
}
function nextOffset(text: string, offset: number): number {
  if (offset >= text.length) return text.length;
  if (text.slice(offset, offset + 2) === "\r\n") return offset + 2;
  return offset + ((text.codePointAt(offset) ?? 0) > 0xffff ? 2 : 1);
}
export function cursorPosition(state: EditorState): { line: number; column: number; start: number; end: number } {
  const source = state.document.source;
  let start = 0, line = 0;
  for (const match of source.matchAll(/\r\n|\r|\n/g)) {
    const end = match.index!;
    if (state.cursor <= end) return { line, column: Array.from(source.slice(start, state.cursor)).length, start, end };
    start = end + match[0].length;
    line++;
  }
  return { line, column: Array.from(source.slice(start, state.cursor)).length, start, end: source.length };
}
function lineRanges(source: string): Array<{ start: number; end: number }> {
  const ranges = [];
  let start = 0;
  for (const match of source.matchAll(/\r\n|\r|\n/g)) {
    ranges.push({ start, end: match.index! });
    start = match.index! + match[0].length;
  }
  ranges.push({ start, end: source.length });
  return ranges;
}
export function applyEdit(state: EditorState, edit: Edit): EditorState {
  const source = state.document.source;
  let cursor = Math.min(state.cursor, source.length);
  let next = source;
  if (edit.type === "insert") {
    // Keep source text as data; strip terminal controls from paste, not Unicode.
    const text = edit.text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
    next = source.slice(0, cursor) + text + source.slice(cursor);
    cursor += text.length;
  } else if (edit.type === "backspace") {
    const before = previousOffset(source, cursor);
    next = source.slice(0, before) + source.slice(cursor);
    cursor = before;
  } else if (edit.type === "delete") {
    next = source.slice(0, cursor) + source.slice(nextOffset(source, cursor));
  } else if (edit.type === "left") cursor = previousOffset(source, cursor);
  else if (edit.type === "right") cursor = nextOffset(source, cursor);
  else {
    const position = cursorPosition(state);
    if (edit.type === "home") cursor = position.start;
    else if (edit.type === "end") cursor = position.end;
    else {
      const ranges = lineRanges(source);
      const target = ranges[Math.max(0, Math.min(ranges.length - 1, position.line + (edit.type === "up" ? -1 : 1)))]!;
      const chars = Array.from(source.slice(target.start, target.end));
      cursor = target.start + chars.slice(0, position.column).join("").length;
    }
  }
  return next === source ? { ...state, cursor } : { document: updateDocument(state.document, next), cursor, dirty: true };
}
export function newlineFor(document: Worksheet): string {
  return document.source.match(/\r\n|\r|\n/)?.[0] ?? "\n";
}
export function safeText(text: string): string {
  return text.replace(/[\x00-\x1f\x7f-\x9f]/g, (character) => character === "\t" ? "  " : "");
}
function width(character: string): number {
  if (/\p{Mark}/u.test(character)) return 0;
  if (/\p{Extended_Pictographic}/u.test(character) || /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe6f\uff01-\uff60\uffe0-\uffe6]/u.test(character)) return 2;
  return 1;
}
export function displayWidth(text: string): number { return Array.from(safeText(text)).reduce((sum, character) => sum + width(character), 0); }
export function fit(text: string, columns: number): string {
  let result = "", size = 0;
  for (const character of safeText(text)) {
    const amount = width(character);
    if (size + amount > columns) break;
    result += character; size += amount;
  }
  return result + " ".repeat(Math.max(0, columns - size));
}
