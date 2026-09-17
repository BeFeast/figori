import { writeFile } from "node:fs/promises";
import {
  Action,
  ActionPanel,
  Color,
  Form,
  Icon,
  List,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useMemo, useRef, useState } from "react";
import { evaluateExpression } from "@my-numi/core";
import { evaluateDocument, serializeNumi } from "@my-numi/document";
import { compactContext, contextFor, validateSettings } from "./model";
import { rateDescription, useRates } from "./rates";
import { CalculationInfo, ContextEditor, useClock } from "./ui";
import { appendLine, replaceLine } from "./line-editor";
import {
  exportNumi,
  importDocument,
  saveDocument,
  settingsFrom,
  settingsTo,
  storageOptions,
  updateDocument,
  Worksheet,
} from "./storage";
export function evaluated(
  doc: Worksheet,
  now: string,
  rates?: NonNullable<Parameters<typeof evaluateExpression>[1]>["rates"],
) {
  return evaluateDocument(doc, evaluateExpression, {
    ...contextFor(settingsFrom(doc), now),
    rates,
  });
}
export function rendered(
  doc: Worksheet,
  now: string,
  rates?: NonNullable<Parameters<typeof evaluateExpression>[1]>["rates"],
) {
  return evaluated(doc, now, rates)
    .lines.map((line) =>
      line.evaluation
        ? `${line.source} → ${line.evaluation.ok ? line.evaluation.formatted : line.evaluation.diagnostics.map((d) => d.message).join("; ")}`
        : line.source,
    )
    .join("\n");
}
/** Optional bulk source editor; normal worksheet entry stays in the List search bar. */
export function WorksheetEditor({
  document,
  onSave,
}: {
  document: Worksheet;
  onSave: (doc: Worksheet) => Promise<void>;
}) {
  const [source, setSource] = useState(document.source);
  const [saving, setSaving] = useState(false);
  const { pop } = useNavigation();
  async function save() {
    if (source.length > 262_144) {
      await showToast(Toast.Style.Failure, "Worksheet exceeds 256 KiB.");
      return;
    }
    setSaving(true);
    try {
      await onSave(updateDocument(document, source));
      pop();
    } catch (e) {
      await showToast(Toast.Style.Failure, "Save Failed", String(e));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Form
      navigationTitle="Edit Full Source"
      isLoading={saving}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Source" onSubmit={save} />
        </ActionPanel>
      }
    >
      <Form.TextArea
        id="source"
        title="Source"
        value={source}
        onChange={setSource}
        placeholder={"price = 12\nprice * 3"}
      />
      <Form.Description
        title="Worksheet"
        text="Paste or edit multiple lines here. Save to return to calculation results."
      />
    </Form>
  );
}
export function WorksheetDetail({
  document: initialDocument,
  onSaved,
}: {
  document?: Worksheet;
  onSaved?: () => void;
}) {
  const [document, setDocument] = useState(
    () => initialDocument ?? importDocument("", { format: "numi" }),
  );
  const [input, setInput] = useState("");
  const inputRef = useRef("");
  function changeInput(value: string) {
    inputRef.current = value;
    setInput(value);
  }
  const [editing, setEditing] = useState<string | undefined>();
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const { now, refresh } = useClock();
  const { state: rates, loading: loadingRates, refreshRates } = useRates();
  const { push } = useNavigation();
  const context = compactContext(settingsFrom(document), now);
  const evaluation = useMemo(() => {
    try {
      return {
        value: evaluated(document, now, rates.snapshot),
        error: undefined,
      };
    } catch (e) {
      return { value: undefined, error: String(e) };
    }
  }, [document, now, rates.snapshot]);
  const draft = useMemo(() => {
    if (!input.trim()) return undefined;
    try {
      const next = editing
        ? replaceLine(document, editing, input)
        : appendLine(document, input);
      const results = evaluated(next, now, rates.snapshot);
      const index = editing
        ? document.lines.findIndex((line) => line.id === editing)
        : next.lines.length - 1;
      return { next, line: results.lines[index], error: undefined };
    } catch (e) {
      return { next: undefined, line: undefined, error: String(e) };
    }
  }, [document, input, editing, now, rates.snapshot]);
  async function persist(next: Worksheet) {
    if (savingRef.current) throw new Error("A save is already in progress.");
    if (next.source.length > 262_144)
      throw new Error("Worksheet exceeds 256 KiB.");
    const error = validateSettings(settingsFrom(next));
    if (error) throw new Error(error);
    savingRef.current = true;
    setSaving(true);
    try {
      await saveDocument(next, storageOptions);
      setDocument(next);
      onSaved?.();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  async function commit() {
    if (!draft?.next || savingRef.current) return;
    try {
      await persist(draft.next);
      if (inputRef.current === input) {
        changeInput("");
        setSelected(editing ?? draft.next.lines.at(-1)?.id ?? null);
        setEditing(undefined);
      }
      await showToast(Toast.Style.Success, "Worksheet Saved");
    } catch (e) {
      await showToast(Toast.Style.Failure, "Save Failed", String(e));
    }
  }
  function cancel() {
    changeInput("");
    setEditing(undefined);
    setSelected(
      document.lines.find((line) => line.kind !== "blank")?.id ?? null,
    );
  }
  function edit(id: string) {
    const line = document.lines.find((l) => l.id === id);
    if (line) {
      setEditing(id);
      changeInput(line.source);
    }
  }
  const common = (
    <>
      {(input || editing) && (
        <Action
          title="Cancel Draft"
          icon={Icon.XMarkCircle}
          onAction={cancel}
          shortcut={{ modifiers: ["cmd"], key: "backspace" }}
        />
      )}
      <Action
        title="Edit Full Source"
        icon={Icon.Document}
        onAction={() =>
          push(<WorksheetEditor document={document} onSave={persist} />)
        }
        shortcut={{ modifiers: ["cmd", "shift"], key: "e" }}
      />
      <Action.Push
        title="Change Date and Timezone"
        icon={Icon.Calendar}
        target={
          <ContextEditor
            settings={settingsFrom(document)}
            now={now}
            onSave={(settings) =>
              persist({ ...document, settings: settingsTo(settings) })
            }
          />
        }
      />
      <Action.CopyToClipboard
        title="Copy All Results"
        content={
          evaluation.value?.lines
            .map((line) =>
              line.evaluation
                ? `${line.source} → ${line.evaluation.ok ? line.evaluation.formatted : line.evaluation.diagnostics.map((d) => d.message).join("; ")}`
                : line.source,
            )
            .join("\n") ?? ""
        }
      />
      <Action.CopyToClipboard title="Copy Source" content={document.source} />
      <Action.Push
        title="Export Worksheet"
        icon={Icon.Download}
        target={<ExportForm document={document} />}
      />
      <Action
        title="Refresh Exchange Rates"
        icon={Icon.Coins}
        onAction={refreshRates}
      />
      <Action
        title="Recalculate"
        icon={Icon.ArrowClockwise}
        onAction={refresh}
        shortcut={{ modifiers: ["cmd"], key: "r" }}
      />
    </>
  );
  // Raycast can retain an existing selected row while its search bar changes.
  // Every visible row must therefore offer the same draft commit as Enter.
  const draftAction =
    input.trim() || editing ? (
      <Action
        title={editing ? "Save Edited Line" : "Add Line and Save"}
        icon={Icon.Checkmark}
        onAction={commit}
      />
    ) : null;
  const draftResult = draft?.line?.evaluation;
  return (
    <List
      navigationTitle={editing ? "Figori · Edit Line" : "Figori · Worksheet"}
      searchBarPlaceholder={
        editing
          ? "Edit this line · Enter to save"
          : "Add a calculation or heading · Enter to save"
      }
      searchText={input}
      onSearchTextChange={changeInput}
      filtering={false}
      isLoading={saving || loadingRates}
      onSelectionChange={setSelected}
      selectedItemId={input.trim() ? "draft" : (selected ?? undefined)}
    >
      <List.Section
        title={context}
        subtitle={editing ? "Editing line" : "Enter to add · ⌘E to edit"}
      >
        {input.trim() && (
          <List.Item
            id="draft"
            title={input}
            icon={Icon.Pencil}
            subtitle={
              draft?.error ||
              (!draftResult?.ok
                ? draftResult?.diagnostics.map((d) => d.message).join("; ")
                : undefined)
            }
            accessories={
              draftResult?.ok
                ? [
                    {
                      text: {
                        value: draftResult.formatted ?? "",
                        color: Color.Green,
                      },
                      tooltip: draftResult.formatted,
                    },
                  ]
                : [
                    {
                      text:
                        draft?.line?.kind === "heading" ? "Heading" : "Draft",
                    },
                  ]
            }
            actions={
              <ActionPanel>
                <Action
                  title={editing ? "Save Edited Line" : "Add Line and Save"}
                  icon={Icon.Checkmark}
                  onAction={commit}
                />
                {draftResult?.ok && (
                  <Action.CopyToClipboard
                    title="Copy Result"
                    content={draftResult.formatted ?? ""}
                  />
                )}
                <Action.Push
                  title="Calculation Details"
                  target={
                    <CalculationInfo
                      source={input}
                      result={draftResult}
                      context={context}
                      rates={rateDescription(rates)}
                    />
                  }
                />
                {common}
              </ActionPanel>
            }
          />
        )}
        {evaluation.value?.lines.map((line) =>
          line.kind === "blank" ||
          (line.id === editing && input.trim()) ? null : (
            <List.Item
              key={line.id}
              id={line.id}
              title={line.source}
              icon={
                line.evaluation
                  ? line.evaluation.ok
                    ? Icon.Calculator
                    : Icon.Warning
                  : Icon.Text
              }
              subtitle={
                line.evaluation && !line.evaluation.ok
                  ? line.evaluation.diagnostics.map((d) => d.message).join("; ")
                  : undefined
              }
              accessories={
                line.evaluation?.ok
                  ? [
                      {
                        text: {
                          value: line.evaluation.formatted ?? "",
                          color: Color.Green,
                        },
                        tooltip: line.evaluation.formatted,
                      },
                    ]
                  : []
              }
              actions={
                <ActionPanel>
                  {draftAction}
                  {line.evaluation?.ok && (
                    <Action.CopyToClipboard
                      title="Copy Result"
                      content={line.evaluation.formatted ?? ""}
                    />
                  )}
                  <Action
                    title="Edit Line"
                    icon={Icon.Pencil}
                    onAction={() => edit(line.id)}
                    shortcut={{ modifiers: ["cmd"], key: "e" }}
                  />
                  <Action.Push
                    title="Calculation Details"
                    icon={Icon.Info}
                    target={
                      <CalculationInfo
                        source={line.source}
                        result={line.evaluation}
                        context={context}
                        rates={rateDescription(rates)}
                      />
                    }
                  />
                  {common}
                </ActionPanel>
              }
            />
          ),
        )}
        {!input.trim() && !document.source.trim() && (
          <List.Item
            title="Start your worksheet above"
            subtitle="Type a calculation, press Enter, then add another line"
            icon={Icon.Plus}
            actions={
              <ActionPanel>
                {draftAction}
                {common}
              </ActionPanel>
            }
          />
        )}
        {evaluation.error && (
          <List.Item
            title="Could Not Calculate Worksheet"
            subtitle={evaluation.error}
            icon={Icon.Warning}
            actions={
              <ActionPanel>
                {draftAction}
                {common}
              </ActionPanel>
            }
          />
        )}
      </List.Section>
    </List>
  );
}

export function ExportForm({ document }: { document: Worksheet }) {
  const [path, setPath] = useState("");
  const [format, setFormat] = useState("numi");
  const [sidecar, setSidecar] = useState(true);
  const { pop } = useNavigation();
  const warnings = serializeNumi(document).warnings;
  async function submit() {
    if (
      !path.startsWith("/") ||
      !path.endsWith(format === "numi" ? ".numi" : ".md")
    ) {
      await showToast(
        Toast.Style.Failure,
        "Use an Absolute Path with the Selected Extension",
      );
      return;
    }
    try {
      if (format === "markdown") {
        await writeFile(path, document.source, {
          encoding: "utf8",
          flag: "wx",
        });
        await showToast(Toast.Style.Success, "Markdown Source Exported", path);
        pop();
        return;
      }
      const result = await exportNumi(document, path, {
        overwrite: false,
        sidecar,
      });
      await showToast(
        Toast.Style.Success,
        "Exported Without Overwriting",
        result.path,
      );
      pop();
    } catch (e) {
      await showToast(Toast.Style.Failure, "Export Failed", String(e));
    }
  }
  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Export Worksheet" onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.Dropdown
        id="format"
        title="Format"
        value={format}
        onChange={setFormat}
      >
        <Form.Dropdown.Item value="numi" title="Numi Plain Text (.numi)" />
        <Form.Dropdown.Item value="markdown" title="Original Source (.md)" />
      </Form.Dropdown>
      <Form.TextField
        id="path"
        title="Destination"
        value={path}
        onChange={setPath}
        placeholder="/Users/you/Documents/example.numi"
      />
      <Form.Checkbox
        id="sidecar"
        label="Write settings sidecar for Figori (Numi export only)"
        value={sidecar}
        onChange={setSidecar}
      />
      <Form.Description
        title="Compatibility"
        text={
          "Numi receives plain UTF-8 text. Date calculations may differ. Anchor, timezone and monthly billing settings are not read by Numi. Markdown export contains original source only, without settings."
        }
      />
      <Form.Description
        title="Export Notes"
        text={warnings.join("\n") || "Existing files will not be overwritten."}
      />
    </Form>
  );
}
