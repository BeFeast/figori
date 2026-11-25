import { emitKeypressEvents, type Key } from "node:readline";
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { evaluateExpression, type Value, type EvaluationContext } from "@my-numi/core";
import { evaluateDocument, importDocument, validateSettings, type SourceFormat, type WorksheetSettings } from "@my-numi/document";
import { exportNumi, importFile, listDocuments, loadDocument, saveDocument } from "@my-numi/document/storage";
import { loadRates, refreshRates, type RateState } from "@my-numi/rates";
import { applyEdit, createEditor, cursorPosition, displayWidth, fit, newlineFor, safeText, type EditorState } from "./editor";

export interface TuiOptions { directory?: string; source?: string; format?: SourceFormat; id?: string }
interface Prompt { label: string; value: string; details?: string[]; submit: (value: string) => Promise<void> | void }
export function defaultDirectory(): string {
  return process.env.FIGORI_DATA_DIR ?? process.env.MY_NUMI_DATA_DIR ?? join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "my-numi", "worksheets");
}
export function brandHeader(text: string, env = process.env): string {
  return env.NO_COLOR !== undefined ? text : `\x1b[1;92m${text}\x1b[0m`;
}
function pathFromInput(value: string): string {
  return resolve(value.startsWith("~/") ? join(homedir(), value.slice(2)) : value);
}
export function calculate(state: EditorState, rates: RateState, now = new Date().toISOString()) {
  return evaluateDocument<Value, Record<string, unknown>>(state.document,
    (source, context) => evaluateExpression(source, context as unknown as EvaluationContext),
    { now, ...(rates.snapshot ? { rates: rates.snapshot } : {}) });
}

export async function copyResult(text: string): Promise<void> {
  const candidates = process.platform === "darwin" ? [["pbcopy"]] : [["wl-copy"], ["xclip", "-selection", "clipboard"]];
  for (const [command, ...args] of candidates) {
    try {
      await new Promise<void>((accept, reject) => {
        const child = execFile(command!, args, { timeout: 2000 }, (error) => error ? reject(error) : accept());
        child.stdin?.on("error", () => {});
        child.stdin?.end(text);
      });
      return;
    } catch {}
  }
  throw new Error("Clipboard unavailable; result remains visible and can be exported. Install wl-copy/xclip or use terminal selection.");
}

export async function runTui(options: TuiOptions = {}): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY || !process.stdin.setRawMode) {
    throw new Error("Interactive worksheet requires a terminal. Use CLI text/JSON modes for pipes or accessibility.");
  }
  const directory = options.directory ?? defaultDirectory();
  let editor = createEditor(importDocument(options.source ?? "", { format: options.format ?? "numi" }));
  let status = "New worksheet. Ctrl+O opens saved sheets; Ctrl+L imports a file.";
  if (options.id) {
    const loaded = await loadDocument(options.id, { directory });
    editor = createEditor(loaded.document);
    status = loaded.recovered ? "Recovered worksheet from backup; Ctrl+S writes a fresh primary." : "Opened saved worksheet.";
  }
  let rates = await loadRates({ directory: join(directory, "rates") });
  if (rates.error) status = rates.error;
  let results = calculate(editor, rates);
  let refreshTimer: ReturnType<typeof setInterval> | undefined;
  let prompt: Prompt | undefined;
  let busy = false;
  let closed = false;
  let refreshing = false;
  let refreshGeneration = 0;
  let resolveDone!: () => void;
  const done = new Promise<void>((resolve) => { resolveDone = resolve; });
  const previousRaw = process.stdin.isRaw;
  const reevaluate = () => { results = calculate(editor, rates); };
  const message = (error: unknown) => error instanceof Error ? error.message : String(error);
  const render = () => {
    if (closed) return;
    const columns = process.stdout.columns || 100;
    const rows = process.stdout.rows || 24;
    if (columns < 40 || rows < 10) {
      process.stdout.write("\x1b[H\x1b[2JTerminal too small; resize to at least 40x10. Ctrl+Q saves and exits.");
      return;
    }
    const position = cursorPosition(editor);
    const left = Math.max(20, Math.floor(columns * 0.6));
    const contentWidth = left - 6;
    const right = columns - left - 1;
    const bodyHeight = rows - 7;
    const sourceLines = editor.document.source.split(/\r\n|\r|\n/);
    const top = Math.max(0, position.line - bodyHeight + 1);
    const selectedText = sourceLines[position.line] ?? "";
    const prefix = Array.from(selectedText).slice(0, position.column).join("");
    const scroll = Math.max(0, position.column - contentWidth + 3);
    const shownPrefix = Array.from(prefix).slice(scroll).join("");
    const resolved = results.lines.find((line) => line.evaluation?.basis)?.evaluation?.basis as { anchorDate?: string } | undefined;
    const settings = editor.document.settings;
    const lines: string[] = [
      brandHeader(fit(`Figori ${editor.dirty ? "*" : ""}  ${editor.document.id}${busy ? "  working..." : ""}`, columns)),
      fit(`Anchor ${settings.anchor.mode === "fixed" ? settings.anchor.date : "today → " + (resolved?.anchorDate ?? new Intl.DateTimeFormat("en-CA", {timeZone: settings.timezone, year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()))} | ${settings.timezone} | billing ${settings.billing}`, columns),
      fit(`Rates ${rates.status}${rates.snapshot ? " | " + rates.snapshot.source + " | " + rates.snapshot.asOf : ""}${refreshing ? " | refreshing" : ""}`, columns),
    ];
    if (prompt) {
      lines.push(fit(prompt.label, columns));
      lines.push(fit("> " + prompt.value, columns));
      for (let index = 0; index < bodyHeight - 2; index++) lines.push(fit(prompt.details?.[index] ?? "", columns));
    } else {
      for (let index = 0; index < bodyHeight; index++) {
        const lineIndex = top + index;
        const text = sourceLines[lineIndex];
        const evaluated = results.lines[lineIndex]?.evaluation;
        const result = evaluated?.ok ? evaluated.formatted ?? "" : evaluated?.diagnostics.map((item) => item.message).join("; ") ?? "";
        const number = text === undefined ? "" : String(lineIndex + 1).padStart(4) + (lineIndex === position.line ? "> " : "  ");
        lines.push(fit(number + Array.from(text ?? "").slice(lineIndex === position.line ? scroll : 0).join(""), left) + "│" + fit(result, right));
      }
    }
    const selected = results.lines[position.line]?.evaluation;
    const explanation = selected?.diagnostics.length
      ? selected.diagnostics.map((item) => item.message).join("; ")
      : ((selected?.basis as { notes?: string[] } | undefined)?.notes?.join("; ") ?? "");
    lines.push(fit(status || explanation || "Ready", columns));
    lines.push(fit("Ctrl S save | O open | L import | E export | N new | Y copy | Q save+quit", columns));
    lines.push(fit("Ctrl A anchor | T timezone | B billing | R refresh rates | D discard+quit", columns));
    lines.push(fit(prompt ? "Enter confirms, Escape cancels" : explanation || "Arrow keys move; Enter inserts a line; source is preserved.", columns));
    const cursorRow = prompt ? 5 : 4 + position.line - top;
    const cursorColumn = prompt ? Math.min(columns, displayWidth("> " + prompt.value) + 1) : Math.min(left, 7 + displayWidth(shownPrefix));
    process.stdout.write("\x1b[?25l\x1b[H" + lines.join("\r\n") + "\x1b[J" + `\x1b[${cursorRow};${cursorColumn}H\x1b[?25h`);
  };
  const finish = () => {
    if (closed) return;
    closed = true; refreshGeneration++;
    process.stdin.off("keypress", onKey);
    process.stdout.off("resize", onResize);
    process.off("SIGTERM", onTerm);
    process.off("SIGHUP", onTerm);
    process.off("SIGCONT", onResume);
    clearInterval(refreshTimer);
    process.stdin.setRawMode(previousRaw);
    process.stdout.write("\x1b[?2004l\x1b[?25h\x1b[?1049l");
    process.stdin.pause();
    resolveDone();
  };
  const save = async () => {
    const snapshot = editor.document;
    await saveDocument(snapshot, { directory });
    if (editor.document === snapshot) editor = { ...editor, dirty: false };
    status = "Saved " + snapshot.id;
  };
  const perform = async (action: () => Promise<void> | void) => {
    busy = true; render();
    try { await action(); }
    catch (error) { status = message(error); }
    finally { busy = false; if (!closed) { reevaluate(); render(); } }
  };
  const setSettings = (patch: Partial<WorksheetSettings>) => {
    const settings = { ...editor.document.settings, ...patch };
    validateSettings(settings);
    editor = { ...editor, document: { ...editor.document, settings }, dirty: true };
  };
  const openSaved = async () => {
    if (editor.dirty) await save();
    const docs = await listDocuments({ directory });
    if (!docs.length) { status = "No saved worksheets yet. Ctrl+L imports a file."; return; }
    prompt = {
      label: "Open saved worksheet: enter number or id",
      value: "",
      details: docs.map((doc, index) => `${index + 1}. ${doc.title}${doc.error ? " [unreadable]" : doc.recovered ? " [recovery]" : ""}`),
      submit: async (value) => {
        const id = /^\d+$/.test(value) ? docs[Number(value) - 1]?.id : value;
        if (!id) throw new Error("Unknown worksheet selection");
        const loaded = await loadDocument(id, { directory });
        editor = createEditor(loaded.document);
        status = loaded.recovered ? "Opened recovery copy. Ctrl+S restores primary." : "Opened saved worksheet.";
      },
    };
  };
  const refresh = () => {
    if (refreshing) return;
    refreshing = true;
    const generation = ++refreshGeneration;
    void refreshRates({ directory: join(directory, "rates") }).then((next) => {
      if (closed || generation !== refreshGeneration) return;
      rates = next;
      status = next.error ?? "Currency snapshot refreshed: " + next.status;
      reevaluate();
    }).catch((error) => { if (!closed) status = message(error); }).finally(() => {
      if (closed || generation !== refreshGeneration) return;
      refreshing = false; render();
    });
  };
  const onKey = (text: string | undefined, key: Key = {}) => {
    if (closed) return;
    if (key.ctrl && key.name === "d") { finish(); return; }
    if (busy) return;
    if (key.ctrl && (key.name === "q" || key.name === "c")) { prompt = undefined; void perform(async () => { if (editor.dirty) await save(); finish(); }); return; }
    if (prompt) {
      if (key.ctrl && key.name === "u") prompt.value = "";
      else if (key.name === "escape") { prompt = undefined; status = "Cancelled"; }
      else if (key.name === "return") {
        const current = prompt; prompt = undefined;
        void perform(() => current.submit(current.value.trim()));
        return;
      } else if (key.name === "backspace") prompt.value = Array.from(prompt.value).slice(0, -1).join("");
      else if (!key.ctrl && !key.meta && text && !text.startsWith("\x1b")) prompt.value += safeText(text);
      render(); return;
    }
    if (key.ctrl) {
      if (key.name === "s") { void perform(save); return; }
      if (key.name === "o") { void perform(openSaved); return; }
      if (key.name === "n") { void perform(async () => { if (editor.dirty) await save(); editor = createEditor(); status = "New worksheet"; }); return; }
      if (key.name === "l") {
        prompt = { label: "Import UTF-8 .numi or captured .md file (input stays unchanged)", value: "", submit: async (value) => {
          if (!value) throw new Error("A file path is required");
          if (editor.dirty) await save();
          editor = { ...createEditor(await importFile(pathFromInput(value))), dirty: true };
          status = "Imported a copy; Ctrl+S persists it in application storage.";
        } };
      } else if (key.name === "e") {
        prompt = { label: "Export .numi path (refuses existing files; includes settings sidecar)", value: "", submit: async (value) => {
          if (!value) throw new Error("An export path is required");
          const result = await exportNumi(editor.document, pathFromInput(value));
          status = "Exported text + sidecar. Native Numi does not apply Figori anchor/billing settings.";
          void result;
        } };
      } else if (key.name === "a") {
        prompt = { label: "Anchor: today or fixed ISO date YYYY-MM-DD", value: editor.document.settings.anchor.mode === "today" ? "today" : editor.document.settings.anchor.date ?? "", submit: (value) => {
          setSettings({ anchor: value === "today" ? { mode: "today" } : { mode: "fixed", date: value } });
          status = "Anchor updated";
        } };
      } else if (key.name === "t") {
        prompt = { label: "Timezone: IANA name, e.g. Asia/Jerusalem", value: editor.document.settings.timezone, submit: (value) => { setSettings({ timezone: value }); status = "Timezone updated"; } };
      } else if (key.name === "b") {
        setSettings({ billing: editor.document.settings.billing === "completed" ? "include-partial" : "completed" });
        status = "Monthly billing policy updated";
      } else if (key.name === "r") refresh();
      else if (key.name === "y") {
        const result = results.lines[cursorPosition(editor).line]?.evaluation;
        if (result?.ok && result.formatted) void perform(async () => { await copyResult(result.formatted!); status = "Result copied"; });
        else status = "Current line has no valid result to copy";
      }
    } else {
      const movement: Record<string, "left" | "right" | "up" | "down" | "home" | "end" | "backspace" | "delete"> = {
        left: "left", right: "right", up: "up", down: "down", home: "home", end: "end", backspace: "backspace", delete: "delete",
      };
      if (movement[key.name ?? ""]) editor = applyEdit(editor, { type: movement[key.name!]! });
      else if (key.name === "return") editor = applyEdit(editor, { type: "insert", text: newlineFor(editor.document) });
      else if (key.name === "tab") editor = applyEdit(editor, { type: "insert", text: "\t" });
      else if (!key.meta && text && !text.startsWith("\x1b")) editor = applyEdit(editor, { type: "insert", text });
      status = "";
    }
    reevaluate(); render();
  };
  const onResize = () => render();
  const onTerm = () => { finish(); };
  const onResume = () => { reevaluate(); render(); };
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("keypress", onKey);
  process.stdout.on("resize", onResize);
  process.on("SIGTERM", onTerm);
  process.on("SIGHUP", onTerm);
  process.on("SIGCONT", onResume);
  refreshTimer = setInterval(onResume, 60_000);
  process.stdout.write("\x1b[?1049h\x1b[?2004h");
  render();
  await done;
}

