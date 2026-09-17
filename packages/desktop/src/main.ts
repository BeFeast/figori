import { columnLimits, resultWidth, savedColumnRatio } from "./splitter";
import { OperationGate } from "./operation";
import { Compartment } from "@codemirror/state";
import {
  EditorState,
  RangeSet,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  EditorView,
  GutterMarker,
  gutter,
  keymap,
  drawSelection,
  highlightActiveLine,
  Decoration,
  type DecorationSet,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { bracketMatching } from "@codemirror/language";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { evaluateExpression } from "@my-numi/core";
import {
  evaluateDocument,
  importDocument,
  type Worksheet,
  type WorksheetSettings,
} from "@my-numi/document";
import {
  displayResult,
  editorText,
  fromEditor,
  openedWorksheet,
  readableBasis,
  sourceTitle,
  type Opened,
  type Recovery,
  type RateState,
} from "./model";
const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const nativeWindow = getCurrentWindow();
let initializing = true;
const readOnly = new Compartment();
let worksheet = importDocument("", { format: "numi" });
let path: string | null = null,
  sourceHash: string | null = null,
  dirty = false,
  busy = false,
  precision = Number(localStorage.getItem("precision") ?? 2);
if (![0, 1, 2, 3, 4, 6].includes(precision)) precision = 2;
let rates: RateState = { status: "unavailable" },
  revision = 0;
let baseline: Recovery = {
  path: null,
  source: "",
  sourceHash: null,
  settings: worksheet.settings,
  dirty: false,
};
let recoveryTimer: ReturnType<typeof setTimeout> | undefined,
  evaluationTimer: ReturnType<typeof setTimeout> | undefined;
function compute() {
  return evaluateDocument(worksheet, evaluateExpression, {
    now: new Date().toISOString(),
    rates: rates.snapshot,
  });
}
let lastEvaluated: ReturnType<typeof compute> | undefined;
let resultCopy = "";
function notice(message = "") {
  el("notice").textContent = message;
  el("notice").hidden = !message;
}
function report(error: unknown) {
  notice(error instanceof Error ? error.message : String(error));
}
function contextText() {
  const s = worksheet.settings;
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: s.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return `${s.anchor.mode === "today" ? "Today " + today : s.anchor.date} · ${s.timezone}`;
}
function updateChrome() {
  const name = path?.split(/[\\/]/).at(-1) ?? "Untitled";
  const title = name + (dirty ? "*" : "");
  const filename = el("filename");
  if (filename.textContent !== title) filename.textContent = title;
  filename.classList.toggle("dirty", dirty);
  filename.title =
    (path ?? "New worksheet") + (dirty ? " — Unsaved changes" : "");
  filename.setAttribute(
    "aria-label",
    name + (dirty ? ", unsaved changes" : ""),
  );
  el("save-status").hidden = !busy;
  el("save-status").textContent = busy ? "Working…" : "";
  el("context-button").textContent = contextText();
  void nativeWindow.setTitle(`${title} — Figori`).catch(report);
}
function setDirty() {
  dirty = true;
  revision++;
  updateChrome();
  queueRecovery();
}
let recoveryWrite: Promise<unknown> = Promise.resolve();
function persistRecovery() {
  const snapshot = {
    source: worksheet.source,
    settings: worksheet.settings,
    path,
    sourceHash,
    dirty,
  };
  recoveryWrite = recoveryWrite
    .catch(() => {})
    .then(() => invoke("save_recovery", snapshot));
  return recoveryWrite;
}
function queueRecovery() {
  clearTimeout(recoveryTimer);
  recoveryTimer = setTimeout(() => {
    void persistRecovery().catch(report);
  }, 400);
}
async function flushRecovery() {
  clearTimeout(recoveryTimer);
  await persistRecovery();
}
function rateChrome() {
  const button = el<HTMLButtonElement>("rates");
  button.textContent =
    rates.status === "unavailable"
      ? "Rates unavailable · Refresh"
      : rates.status === "stale"
        ? "Rates stale · Refresh"
        : `Rates ${rates.snapshot?.asOf ?? ""} · Refresh`;
  button.classList.toggle("unavailable", rates.status !== "fresh");
  button.title =
    [rates.snapshot?.source, rates.error].filter(Boolean).join("\n") ||
    "Get current exchange rates";
}
async function refreshRates() {
  const button = el<HTMLButtonElement>("rates");
  button.disabled = true;
  button.textContent = "Refreshing rates…";
  try {
    rates = await invoke<RateState>("refresh_rates");
    notice(rates.error ?? "");
    rateChrome();
    evaluate();
  } catch (error) {
    report(error);
  } finally {
    button.disabled = false;
    rateChrome();
  }
}
function details(index: number) {
  const line = lastEvaluated?.lines[index];
  if (!line) return;
  el("detail-expression").textContent = sourceTitle(line);
  resultCopy = line.evaluation?.ok
    ? (line.evaluation.formatted ?? "")
    : (line.evaluation?.diagnostics.map((d) => d.message).join("\n") ??
      line.source);
  el("detail-result").textContent = resultCopy;
  el("detail-basis").textContent = [
    readableBasis(line.evaluation?.basis),
    line.historicalResult !== undefined
      ? `Captured original result: ${line.historicalResult}`
      : "",
    !line.evaluation?.ok && rates.error ? rates.error : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  el<HTMLDialogElement>("details").showModal();
}
class ResultMarker extends GutterMarker {
  constructor(
    readonly text: string,
    readonly full: string,
    readonly index: number,
    readonly failed: boolean,
  ) {
    super();
  }
  eq(other: ResultMarker) {
    return (
      this.text === other.text &&
      this.full === other.full &&
      this.index === other.index &&
      this.failed === other.failed
    );
  }
  toDOM() {
    const button = document.createElement("button");
    button.className = "result" + (this.failed ? " error" : "");
    button.textContent = this.text;
    button.title = this.full;
    button.setAttribute(
      "aria-label",
      `Line ${this.index + 1}: ${this.full}. Show details`,
    );
    button.onclick = () => details(this.index);
    return button;
  }
}
const setResults = StateEffect.define<RangeSet<GutterMarker>>();
const refreshGutter = StateEffect.define<null>();
const gutterMeasureKey = {};
function measureResultGutter() {
  view.requestMeasure({
    key: gutterMeasureKey,
    read: (current) => current.state.doc,
    write: (measuredDocument, current) => {
      // Dispatch after the measurement cycle, never from inside its write phase.
      queueMicrotask(() => {
        if (current.state.doc === measuredDocument)
          current.dispatch({ effects: refreshGutter.of(null) });
      });
    },
  });
}
const resultField = StateField.define<RangeSet<GutterMarker>>({
  create: () => RangeSet.empty,
  update(value, tr) {
    for (const effect of tr.effects)
      if (effect.is(setResults)) return effect.value;
    return value.map(tr.changes);
  },
});
const setHidden = StateEffect.define<DecorationSet>();
const hiddenField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    for (const effect of tr.effects)
      if (effect.is(setHidden)) return effect.value;
    return value.map(tr.changes);
  },
  provide: (field) => [
    EditorView.decorations.from(field),
    EditorView.atomicRanges.of((view) => view.state.field(field)),
  ],
});
const setSyntax = StateEffect.define<DecorationSet>();
const syntaxField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    for (const effect of tr.effects)
      if (effect.is(setSyntax)) return effect.value;
    return value.map(tr.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});
function evaluate() {
  clearTimeout(evaluationTimer);
  try {
    lastEvaluated = compute();
    const markers: ReturnType<GutterMarker["range"]>[] = [];
    const marks: ReturnType<Decoration["range"]>[] = [];
    const hidden: ReturnType<Decoration["range"]>[] = [];
    lastEvaluated.lines.forEach((line, index) => {
      if (index >= view.state.doc.lines) return;
      const position = view.state.doc.line(index + 1);
      if (line.evaluation) {
        const full = line.evaluation.ok
          ? (line.evaluation.formatted ?? "")
          : line.evaluation.diagnostics.map((d) => d.message).join("; ");
        const failed = !line.evaluation.ok;
        markers.push(
          new ResultMarker(
            failed ? full : displayResult(full, precision),
            full,
            index,
            failed,
          ).range(position.from),
        );
      }
      if (line.assignment)
        marks.push(
          Decoration.mark({ class: "variable" }).range(
            position.from,
            Math.min(position.to, position.from + line.source.indexOf("=")),
          ),
        );
      else if (
        (line.kind === "heading" || line.kind === "comment") &&
        position.length
      )
        marks.push(
          Decoration.mark({ class: "heading" }).range(
            position.from,
            position.to,
          ),
        );
      if (line.historicalResult !== undefined) {
        const equal = line.source.lastIndexOf("=");
        if (equal >= 0 && position.from + equal < position.to)
          hidden.push(
            Decoration.replace({}).range(position.from + equal, position.to),
          );
      }
    });
    view.dispatch({
      effects: [
        setResults.of(RangeSet.of(markers, true)),
        setSyntax.of(Decoration.set(marks, true)),
        setHidden.of(Decoration.set(hidden, true)),
      ],
    });
    // Hidden captured output changes visual line geometry. Marker equality alone
    // does not make CodeMirror resync gutters after its first measured layout.
    measureResultGutter();
    positionColumnSplitter();
    // CodeMirror hides gutters by default because they normally contain line
    // numbers. Our result gutter contains interactive controls, so expose it.
    for (const gutter of view.dom.querySelectorAll(".cm-gutters-after")) {
      gutter.setAttribute("aria-hidden", "false");
      gutter.setAttribute("role", "region");
      gutter.setAttribute("aria-label", "Calculation results");
      gutter.id = "result-column";
    }
    updateChrome();
  } catch (error) {
    report(error);
  }
}
function editorState(doc: string) {
  return EditorState.create({
    doc,
    extensions: [
      readOnly.of(EditorState.readOnly.of(busy || initializing)),
      history(),
      drawSelection(),
      highlightActiveLine(),
      bracketMatching(),
      EditorView.lineWrapping,
      resultField,
      syntaxField,
      hiddenField,
      gutter({
        class: "result-gutter",
        side: "after",
        lineMarkerChange: (update) =>
          update.geometryChanged ||
          update.transactions.some((transaction) =>
            transaction.effects.some((effect) => effect.is(refreshGutter)),
          ),
        markers: (view) => view.state.field(resultField),
      }),
      EditorView.theme(
        {
          "&": { backgroundColor: "var(--bg)", color: "var(--text)" },
          ".cm-scroller": { overflow: "auto" },
          ".cm-content": { minWidth: "0" },
        },
        { dark: true },
      ),
      keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
      EditorView.contentAttributes.of({
        id: "source-editor",
        "aria-label": "Worksheet source",
        spellcheck: "false",
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          worksheet = fromEditor(worksheet, update.state.doc.toString());
          setDirty();
          clearTimeout(evaluationTimer);
          evaluationTimer = setTimeout(evaluate, 30);
        }
        if (update.selectionSet || update.docChanged) {
          const line = update.state.doc.lineAt(
            update.state.selection.main.head,
          );
          el("line-status").textContent =
            `Line ${line.number} of ${update.state.doc.lines}`;
        }
      }),
    ],
  });
}
// WebKit can cache gutter geometry before bundled chrome fonts finish loading.
// Build the editor after that first layout, then remeasure any later font load.
await document.fonts.ready;
const view = new EditorView({ parent: el("editor"), state: editorState("") });
document.fonts.addEventListener("loadingdone", () => measureResultGutter());
const splitter = el("column-splitter");
const splitterMeasureKey = {};
let preferredResultRatio = savedColumnRatio(
  localStorage.getItem("result-column-ratio"),
);
let columnDrag: number | null = null;
function positionColumnSplitter() {
  view.requestMeasure({
    key: splitterMeasureKey,
    read: (current) => {
      const gutter = current.dom.querySelector(".cm-gutters-after");
      return gutter
        ? gutter.getBoundingClientRect().left -
            el("editor").getBoundingClientRect().left
        : null;
    },
    write: (left) => {
      if (left !== null) {
        splitter.style.left = left - 5 + "px";
        splitter.style.visibility = "visible";
      }
    },
  });
}
function setColumnWidth(requested?: number, persist = false) {
  const available = view.scrollDOM.clientWidth;
  if (!available) return;
  const width = resultWidth(
    available,
    requested ?? available * preferredResultRatio,
  );
  el("editor").style.setProperty("--result-width", width + "px");
  const limits = columnLimits(available);
  splitter.setAttribute("aria-valuemin", String(Math.round(limits.minimum)));
  splitter.setAttribute("aria-valuemax", String(Math.round(limits.maximum)));
  splitter.setAttribute("aria-valuenow", String(Math.round(width)));
  splitter.setAttribute(
    "aria-valuetext",
    Math.round(width) +
      " pixels for results, " +
      Math.round(available - width) +
      " for expressions",
  );
  if (persist) {
    preferredResultRatio = width / available;
    localStorage.setItem("result-column-ratio", String(preferredResultRatio));
  }
  measureResultGutter();
  positionColumnSplitter();
}
function dragColumns(event: PointerEvent) {
  const bounds = view.scrollDOM.getBoundingClientRect();
  setColumnWidth(
    bounds.left + view.scrollDOM.clientWidth - event.clientX,
    true,
  );
}
splitter.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  columnDrag = event.pointerId;
  splitter.setPointerCapture(event.pointerId);
  document.body.classList.add("resizing-columns");
  splitter.focus();
});
splitter.addEventListener("pointermove", (event) => {
  if (columnDrag === event.pointerId) dragColumns(event);
});
function finishColumns(event: PointerEvent) {
  if (columnDrag !== event.pointerId) return;
  columnDrag = null;
  document.body.classList.remove("resizing-columns");
  if (splitter.hasPointerCapture(event.pointerId))
    splitter.releasePointerCapture(event.pointerId);
}
splitter.addEventListener("pointerup", finishColumns);
splitter.addEventListener("pointercancel", finishColumns);
splitter.addEventListener("lostpointercapture", () => {
  columnDrag = null;
  document.body.classList.remove("resizing-columns");
});
splitter.addEventListener("dblclick", () => {
  const widths = Array.from(
    view.dom.querySelectorAll<HTMLElement>(".result-gutter .result"),
    (button) => button.scrollWidth,
  );
  if (widths.length) setColumnWidth(Math.max(...widths) + 26, true);
});
splitter.addEventListener("keydown", (event) => {
  const width = resultWidth(
    view.scrollDOM.clientWidth,
    view.scrollDOM.clientWidth * preferredResultRatio,
  );
  const step = event.shiftKey ? 64 : 16;
  if (event.key === "ArrowLeft") setColumnWidth(width + step, true);
  else if (event.key === "ArrowRight") setColumnWidth(width - step, true);
  else if (event.key === "Home") setColumnWidth(0, true);
  else if (event.key === "End")
    setColumnWidth(view.scrollDOM.clientWidth, true);
  else return;
  event.preventDefault();
});
new ResizeObserver(() => setColumnWidth()).observe(view.scrollDOM);
setColumnWidth();

requestAnimationFrame(() => view.requestMeasure());
const operations = new OperationGate((active) => {
  busy = active;
  view.dispatch({
    effects: readOnly.reconfigure(
      EditorState.readOnly.of(active || initializing),
    ),
  });
  for (const id of ["new", "open", "save", "save-as", "context-button"])
    el<HTMLButtonElement>(id).disabled = active || initializing;
  updateChrome();
});
function replaceEditor(doc: Worksheet) {
  worksheet = doc;
  view.setState(editorState(editorText(doc.source)));
  el("line-status").textContent = `Line 1 of ${view.state.doc.lines}`;
  revision++;
  evaluate();
  view.focus();
}
async function save(saveAs = false): Promise<boolean> {
  return operations.run(() => saveUnlocked(saveAs), false);
}
async function saveUnlocked(saveAs = false): Promise<boolean> {
  const submitted = worksheet;
  const start = revision;
  try {
    const result = await invoke<Opened | null>("save_document", {
      path,
      source: submitted.source,
      settings: submitted.settings,
      saveAs,
      expectedHash: sourceHash,
    });
    if (!result) return false;
    path = result.path;
    sourceHash = result.sourceHash;
    baseline = {
      path,
      source: submitted.source,
      settings: submitted.settings,
      sourceHash,
      dirty: false,
    };
    dirty = revision !== start;
    notice(result.warning ?? "");
    await flushRecovery();
    return !dirty;
  } catch (error) {
    report(error);
    return false;
  }
}
async function discardGuard(): Promise<boolean> {
  if (!dirty) return true;
  const choice = await invoke<string>("confirm_close");
  if (choice === "cancel") return false;
  if (choice === "save") return saveUnlocked();
  if (choice !== "discard") return false;
  replaceEditor(
    importDocument(baseline.source, {
      format: "numi",
      settings: baseline.settings,
    }),
  );
  path = baseline.path;
  sourceHash = baseline.sourceHash;
  dirty = false;
  await flushRecovery();
  updateChrome();
  return true;
}
async function adopt(opened: Opened) {
  replaceEditor(openedWorksheet(opened));
  path = opened.path;
  sourceHash = opened.sourceHash;
  dirty = false;
  baseline = {
    path,
    source: worksheet.source,
    sourceHash,
    settings: worksheet.settings,
    dirty: false,
  };
  notice(opened.warning ?? "");
  updateChrome();
  await flushRecovery();
}
async function open(filePath?: string) {
  return operations.run(() => openUnlocked(filePath), undefined);
}
async function openUnlocked(filePath?: string) {
  try {
    if (!(await discardGuard())) return;
    const opened = filePath
      ? await invoke<Opened>("read_document", { path: filePath })
      : await invoke<Opened | null>("open_document");
    if (opened) await adopt(opened);
  } catch (error) {
    report(error);
  }
}
async function newWorksheet() {
  return operations.run(newWorksheetUnlocked, undefined);
}
async function newWorksheetUnlocked() {
  try {
    if (!(await discardGuard())) return;
    replaceEditor(
      importDocument("", { format: "numi", settings: worksheet.settings }),
    );
    path = null;
    sourceHash = null;
    dirty = false;
    baseline = {
      path,
      source: "",
      sourceHash,
      settings: worksheet.settings,
      dirty: false,
    };
    notice();
    updateChrome();
    await flushRecovery();
  } catch (error) {
    report(error);
  }
}
el("new").onclick = () => void newWorksheet();
el("open").onclick = () => void open();
el("save").onclick = () => void save();
el("save-as").onclick = () => void save(true);
el("rates").onclick = () => void refreshRates();
el<HTMLSelectElement>("precision").value = String(precision);
el("precision").onchange = () => {
  precision = Number(el<HTMLSelectElement>("precision").value);
  localStorage.setItem("precision", String(precision));
  evaluate();
};
function applyTheme(theme: string) {
  document.body.classList.toggle(
    "light",
    theme === "light" ||
      (theme === "system" &&
        matchMedia("(prefers-color-scheme: light)").matches),
  );
}
applyTheme(localStorage.getItem("theme") ?? "dark");
el("context-button").onclick = () => {
  const s = worksheet.settings;
  el<HTMLSelectElement>("anchor-mode").value = s.anchor.mode;
  el<HTMLInputElement>("anchor-date").value =
    s.anchor.date ?? new Date().toISOString().slice(0, 10);
  el<HTMLInputElement>("timezone").value = s.timezone;
  el<HTMLInputElement>("partial").checked = s.billing === "include-partial";
  el<HTMLSelectElement>("theme").value =
    localStorage.getItem("theme") ?? "dark";
  el("date-label").hidden = s.anchor.mode !== "fixed";
  el<HTMLDialogElement>("settings").showModal();
};
el("anchor-mode").onchange = () => {
  el("date-label").hidden =
    el<HTMLSelectElement>("anchor-mode").value !== "fixed";
};
el("settings-cancel").onclick = () => el<HTMLDialogElement>("settings").close();
el<HTMLFormElement>("settings-form").onsubmit = (event) => {
  event.preventDefault();
  try {
    const mode = el<HTMLSelectElement>("anchor-mode").value;
    const settings: WorksheetSettings = {
      timezone: el<HTMLInputElement>("timezone").value,
      anchor:
        mode === "today"
          ? { mode: "today" }
          : { mode: "fixed", date: el<HTMLInputElement>("anchor-date").value },
      billing: el<HTMLInputElement>("partial").checked
        ? "include-partial"
        : "completed",
    };
    worksheet = importDocument(worksheet.source, { ...worksheet, settings });
    setDirty();
    const theme = el<HTMLSelectElement>("theme").value;
    localStorage.setItem("theme", theme);
    applyTheme(theme);
    el<HTMLDialogElement>("settings").close();
    notice();
    evaluate();
  } catch (error) {
    report(error);
  }
};
el("detail-close").onclick = () => el<HTMLDialogElement>("details").close();
el("detail-copy").onclick = () => {
  void navigator.clipboard.writeText(resultCopy).catch(report);
};
let closing = false;
void nativeWindow.onCloseRequested(async (event) => {
  if (closing) return;
  event.preventDefault();
  await operations.run(async () => {
    try {
      if (!(await discardGuard())) return;
      dirty = false;
      await flushRecovery();
      closing = true;
      await nativeWindow.destroy();
    } catch (error) {
      closing = false;
      report(error);
    }
  }, undefined);
});
void nativeWindow.onDragDropEvent((event) => {
  document.body.classList.toggle(
    "dragging",
    event.payload.type === "over" || event.payload.type === "enter",
  );
  if (event.payload.type === "drop") {
    document.body.classList.remove("dragging");
    if (event.payload.paths[0]) void open(event.payload.paths[0]);
  }
});
void listen<string>("figori-open-file", (event) => {
  void open(event.payload);
});
setInterval(evaluate, 60000);
async function start() {
  try {
    rates = await invoke<RateState>("load_rates");
    rateChrome();
  } catch (error) {
    rates = { status: "unavailable", error: String(error) };
    rateChrome();
  }
  try {
    const initial = await invoke<string[]>("initial_paths");
    if (initial[0]) {
      await openUnlocked(initial[0]);
      return;
    }
    const recovery = await invoke<Recovery | null>("load_recovery");
    if (recovery) {
      replaceEditor(
        importDocument(recovery.source, {
          format: "numi",
          settings: recovery.settings,
        }),
      );
      path = recovery.path;
      sourceHash = recovery.sourceHash;
      dirty = recovery.dirty;
      if (path && dirty) {
        try {
          const original = await invoke<Opened>("read_document", { path });
          baseline = {
            path: original.path,
            source: original.source,
            sourceHash: original.sourceHash,
            settings: original.settings ?? worksheet.settings,
            dirty: false,
          };
        } catch {
          baseline = {
            path: null,
            source: "",
            sourceHash: null,
            settings: worksheet.settings,
            dirty: false,
          };
        }
      } else baseline = { ...recovery, dirty: false };
      notice(
        dirty ? "Recovered unsaved worksheet. Save to keep these changes." : "",
      );
    }
  } catch (error) {
    report(error);
  }
  evaluate();
  view.focus();
}
void operations.run(async () => {
  try {
    await start();
  } finally {
    initializing = false;
  }
}, undefined);

void listen<string>("figori-menu", (event) => {
  if (event.payload === "new") void newWorksheet();
  else if (event.payload === "open") void open();
  else if (event.payload === "save") void save();
  else if (event.payload === "save-as") void save(true);
});
