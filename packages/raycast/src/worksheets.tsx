import {
  Action,
  ActionPanel,
  Icon,
  List,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { listDocuments, loadDocument, storageOptions } from "./storage";
import { WorksheetDetail } from "./worksheet-ui";
import { ImportForm } from "./import-form";
export default function Worksheets() {
  const [items, setItems] = useState<Awaited<ReturnType<typeof listDocuments>>>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { push } = useNavigation();
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    try {
      const value = await listDocuments(storageOptions);
      if (request === generation.current) {
        setItems(value);
        setError("");
      }
    } catch (e) {
      if (request === generation.current) setError(String(e));
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    return () => {
      generation.current++;
    };
  }, [refresh]);
  async function open(id: string) {
    try {
      const { document, recovered } = await loadDocument(id, storageOptions);
      if (recovered)
        await showToast(
          Toast.Style.Failure,
          "Recovered Previous Save",
          "Review the worksheet before saving.",
        );
      push(
        <WorksheetDetail
          document={document}
          onSaved={() => {
            void refresh();
          }}
        />,
      );
    } catch (e) {
      await showToast(Toast.Style.Failure, "Open Failed", String(e));
    }
  }
  const common = (
    <>
      <Action
        title="New Worksheet"
        icon={Icon.Plus}
        onAction={() =>
          push(
            <WorksheetDetail
              onSaved={() => {
                void refresh();
              }}
            />,
          )
        }
        shortcut={{ modifiers: ["cmd"], key: "n" }}
      />
      <Action
        title="Import File"
        icon={Icon.Upload}
        onAction={() =>
          push(
            <ImportForm
              onImported={() => {
                void refresh();
              }}
            />,
          )
        }
      />
      <Action
        title="Refresh List"
        icon={Icon.ArrowClockwise}
        onAction={refresh}
        shortcut={{ modifiers: ["cmd"], key: "r" }}
      />
    </>
  );
  return (
    <List
      navigationTitle="Figori · Saved Worksheets"
      isLoading={loading}
      searchBarPlaceholder="Find a saved worksheet"
    >
      <List.EmptyView
        title={error ? "Could Not Load Worksheets" : "No Saved Worksheets"}
        description={error || "Create a worksheet or import a .numi file."}
        actions={<ActionPanel>{common}</ActionPanel>}
      />
      {items.map((item) => (
        <List.Item
          key={item.id}
          title={item.title || "Untitled Worksheet"}
          subtitle={item.error ?? item.format}
          icon={item.error ? Icon.Warning : Icon.Document}
          accessories={item.recovered ? [{ text: "Recovery available" }] : []}
          actions={
            <ActionPanel>
              <Action
                title="Open Worksheet"
                icon={Icon.ArrowRight}
                onAction={() => open(item.id)}
              />
              {common}
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
