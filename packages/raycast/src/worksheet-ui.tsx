import { writeFile } from "node:fs/promises";
import {
  Action,
  ActionPanel,
  Detail,
  Form,
  Icon,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useMemo, useState } from "react";
import { evaluateExpression } from "@my-numi/core";
import { evaluateDocument, serializeNumi } from "@my-numi/document";
import {
  contextFor,
  defaults,
  describeContext,
  escapeMarkdown,
  textOf,
  validateSettings,
} from "./model";
import { rateDescription, useRates } from "./rates";
import { ContextFields, useClock } from "./ui";
import {
  exportNumi,
  importDocument,
  loadDocument,
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
  const result = evaluated(doc, now, rates);
  return result.lines
    .map((line) =>
      line.evaluation
        ? `${line.source}\n→ ${line.evaluation.ok ? line.evaluation.formatted : line.evaluation.diagnostics.map((d) => d.message).join("; ")}\n${textOf(line.evaluation.basis)}`
        : line.source,
    )
    .join("\n");
}
export function WorksheetEditor({
  document,
  onSaved,
}: {
  document?: Worksheet;
  onSaved?: () => void;
}) {
  const [source, setSource] = useState(document?.source ?? "");
  const [settings, setSettings] = useState(
    document ? settingsFrom(document) : defaults,
  );
  const [saving, setSaving] = useState(false);
  const { now, refresh } = useClock();
  const { state: rates, loading: loadingRates, refreshRates } = useRates();
  const { pop } = useNavigation();
  const error = validateSettings(settings);
  const draft = useMemo(() => {
    const doc = document
      ? updateDocument(document, source)
      : importDocument(source, { format: "numi" });
    return { ...doc, settings: settingsTo(settings) };
  }, [source, settings, document]);
  let preview = error ?? "";
  if (!error && source.length <= 262_144) {
    try {
      preview = rendered(draft, now, rates.snapshot);
    } catch (e) {
      preview = String(e);
    }
  }
  async function save() {
    if (error || source.length > 262_144) {
      await showToast(
        Toast.Style.Failure,
        "Cannot Save",
        error ?? "Worksheet exceeds 256 KiB.",
      );
      return;
    }
    setSaving(true);
    try {
      await saveDocument(draft, storageOptions);
      await showToast(Toast.Style.Success, "Worksheet Saved");
      onSaved?.();
      pop();
    } catch (e) {
      await showToast(Toast.Style.Failure, "Save Failed", String(e));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Form
      isLoading={saving || loadingRates}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Worksheet"
            icon={Icon.Checkmark}
            onSubmit={save}
          />
          <Action
            title="Refresh Exchange Rates"
            icon={Icon.Coins}
            onAction={refreshRates}
          />
          <Action
            title="Refresh Preview"
            icon={Icon.ArrowClockwise}
            onAction={refresh}
            shortcut={{ modifiers: ["cmd"], key: "r" }}
          />
        </ActionPanel>
      }
    >
      <Form.TextArea
        id="source"
        title="Worksheet"
        value={source}
        onChange={setSource}
        placeholder={"Example\n13 may 2022 + 9 months\n1 month in days"}
        error={
          source.length > 262_144 ? "Worksheet exceeds 256 KiB." : undefined
        }
      />
      <Form.Description
        title="Live Preview"
        text={preview || "Enter expressions or labels."}
      />
      <Form.Description title="Exchange Rates" text={rateDescription(rates)} />
      <ContextFields settings={settings} onChange={setSettings} now={now} />
    </Form>
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
        label="Write settings sidecar for My Numi (Numi export only)"
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
        text={
          warnings.map(textOf).join("\n") ||
          "Existing files will not be overwritten."
        }
      />
    </Form>
  );
}
export function WorksheetDetail({
  document: initialDocument,
  onSaved,
}: {
  document: Worksheet;
  onSaved: () => void;
}) {
  const [document, setDocument] = useState(initialDocument);
  async function reload() {
    try {
      const result = await loadDocument(document.id, storageOptions);
      setDocument(result.document);
      onSaved();
    } catch (error) {
      await showToast(Toast.Style.Failure, "Reload Failed", String(error));
    }
  }
  const { now, refresh } = useClock();
  const { push } = useNavigation();
  const { state: rates, loading: loadingRates, refreshRates } = useRates();
  let output: string;
  try {
    output = rendered(document, now, rates.snapshot);
  } catch (e) {
    output = `Evaluation error: ${String(e)}`;
  }
  const markdown = output.split("\n").map(escapeMarkdown).join("  \n");
  return (
    <Detail
      isLoading={loadingRates}
      markdown={markdown}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label
            title="Context"
            text={describeContext(settingsFrom(document), now)}
          />
          <Detail.Metadata.Label title="Rates" text={rateDescription(rates)} />
          <Detail.Metadata.Label title="Format" text={document.format} />
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <Action
            title="Edit Worksheet"
            icon={Icon.Pencil}
            onAction={() =>
              push(
                <WorksheetEditor
                  document={document}
                  onSaved={() => {
                    void reload();
                  }}
                />,
              )
            }
          />
          <Action.CopyToClipboard title="Copy Results" content={output} />
          <Action.CopyToClipboard
            title="Copy Source"
            content={document.source}
          />
          <Action
            title="Refresh Exchange Rates"
            icon={Icon.Coins}
            onAction={refreshRates}
          />
          <Action
            title="Refresh"
            icon={Icon.ArrowClockwise}
            onAction={refresh}
            shortcut={{ modifiers: ["cmd"], key: "r" }}
          />
          <Action
            title="Export Numi File"
            icon={Icon.Download}
            onAction={() => push(<ExportForm document={document} />)}
          />
        </ActionPanel>
      }
    />
  );
}
