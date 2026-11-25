import { Action, ActionPanel, Form, showToast, Toast } from "@raycast/api";
import { useRef, useState } from "react";
import {
  importFile,
  saveDocument,
  storageOptions,
  type Worksheet,
} from "./storage";
import { WorksheetDetail } from "./worksheet-ui";

/** Shared by the top-level file command and Saved Worksheets. */
export function ImportForm({ onImported }: { onImported?: () => void }) {
  const [files, setFiles] = useState<string[]>([]);
  const [format, setFormat] = useState("auto");
  const [opening, setOpening] = useState(false);
  const [document, setDocument] = useState<Worksheet>();
  const inFlight = useRef(false);
  async function submit() {
    if (inFlight.current) return;
    if (files.length !== 1) {
      await showToast(Toast.Style.Failure, "Choose One File");
      return;
    }
    inFlight.current = true;
    setOpening(true);
    try {
      const imported = await importFile(
        files[0],
        format === "auto" ? {} : { format: format as "numi" | "markdown" },
      );
      await saveDocument(imported, storageOptions);
      onImported?.();
      setDocument(imported);
      await showToast(Toast.Style.Success, "Opened a Local Worksheet Copy");
    } catch (e) {
      await showToast(Toast.Style.Failure, "Could Not Open File", String(e));
    } finally {
      inFlight.current = false;
      setOpening(false);
    }
  }
  // Replace this import screen in place so Escape returns to the caller rather
  // than another filled import form that could accidentally create a duplicate.
  if (document)
    return <WorksheetDetail document={document} onSaved={onImported} />;
  return (
    <Form
      navigationTitle="Figori · Open Numi File"
      isLoading={opening}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Open Worksheet" onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.FilePicker
        id="file"
        title="File"
        value={files}
        onChange={setFiles}
        allowMultipleSelection={false}
        canChooseDirectories={false}
      />
      <Form.Dropdown
        id="format"
        title="Interpretation"
        value={format}
        onChange={setFormat}
      >
        <Form.Dropdown.Item value="auto" title="Automatic (Recommended)" />
        <Form.Dropdown.Item value="numi" title="Numi Plain Text" />
        <Form.Dropdown.Item value="markdown" title="Captured Markdown" />
      </Form.Dropdown>
      <Form.Description
        title="Open a Copy"
        text="Choose a .numi, .md or plain-text calculation file. Assignments and captured results are recognized automatically. A local copy opens immediately; the original file is never changed."
      />
    </Form>
  );
}
