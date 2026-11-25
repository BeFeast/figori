import {
  Action,
  ActionPanel,
  Form,
  LocalStorage,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useEffect, useState } from "react";
import {
  basisDescription,
  defaults,
  describeContext,
  Settings,
  validateSettings,
} from "./model";
export function useClock() {
  const [now, setNow] = useState(() => new Date().toISOString());
  const refresh = () => setNow(new Date().toISOString());
  useEffect(() => {
    const timer = setInterval(refresh, 60000);
    return () => clearInterval(timer);
  }, []);
  return { now, refresh };
}
export function useQuickSettings() {
  const [settings, setSettings] = useState<Settings>(defaults);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    LocalStorage.getItem<string>("quick-context")
      .then((raw) => {
        if (!active) return;
        if (raw) {
          try {
            const value = { ...defaults, ...JSON.parse(raw) };
            if (!validateSettings(value)) setSettings(value);
          } catch {
            /* Keep defaults if old settings are corrupt. */
          }
        }
        setLoaded(true);
      })
      .catch((error) => {
        if (active) {
          setLoaded(true);
          void showToast(
            Toast.Style.Failure,
            "Settings Could Not Be Loaded",
            String(error),
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);
  function update(value: Settings) {
    setSettings(value);
    if (!validateSettings(value))
      void LocalStorage.setItem("quick-context", JSON.stringify(value)).catch(
        (error) =>
          showToast(
            Toast.Style.Failure,
            "Settings Could Not Be Saved",
            String(error),
          ),
      );
  }
  return { settings, setSettings: update, loaded };
}
export function ContextFields({
  settings,
  onChange,
  now,
}: {
  settings: Settings;
  onChange: (value: Settings) => void;
  now: string;
}) {
  return (
    <>
      <Form.Separator />
      <Form.TextField
        id="timezone"
        title="Timezone"
        value={settings.timezone}
        onChange={(timezone) => onChange({ ...settings, timezone })}
        placeholder="Asia/Jerusalem"
      />
      <Form.Dropdown
        id="anchorMode"
        title="Date Anchor"
        value={settings.anchorMode}
        onChange={(anchorMode) =>
          onChange({
            ...settings,
            anchorMode: anchorMode as Settings["anchorMode"],
          })
        }
      >
        <Form.Dropdown.Item value="today" title="Dynamic Today" />
        <Form.Dropdown.Item value="fixed" title="Pinned Date" />
      </Form.Dropdown>
      {settings.anchorMode === "fixed" && (
        <Form.TextField
          id="anchorDate"
          title="Pinned Date"
          value={settings.anchorDate}
          onChange={(anchorDate) => onChange({ ...settings, anchorDate })}
          placeholder="YYYY-MM-DD"
        />
      )}
      <Form.Checkbox
        id="includePartial"
        title="Monthly Billing"
        label="Include the trailing incomplete period"
        value={settings.includePartial}
        onChange={(includePartial) => onChange({ ...settings, includePartial })}
      />
      <Form.Description
        title="Evaluation Context"
        text={describeContext(settings, now)}
      />
    </>
  );
}

export function ContextEditor({
  settings: initial,
  onSave,
  now,
}: {
  settings: Settings;
  onSave: (settings: Settings) => void | Promise<void>;
  now: string;
}) {
  const [settings, setSettings] = useState(initial);
  const { pop } = useNavigation();
  async function save() {
    const error = validateSettings(settings);
    if (error) {
      await showToast(Toast.Style.Failure, "Check Context", error);
      return;
    }
    try {
      await onSave(settings);
      pop();
    } catch (e) {
      await showToast(Toast.Style.Failure, "Could Not Save Context", String(e));
    }
  }
  return (
    <Form
      navigationTitle="Date and Timezone"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Apply Context" onSubmit={save} />
        </ActionPanel>
      }
    >
      <ContextFields settings={settings} onChange={setSettings} now={now} />
    </Form>
  );
}
export function CalculationInfo({
  source,
  result,
  context,
  rates,
}: {
  source: string;
  result?: {
    ok: boolean;
    formatted?: string;
    diagnostics: { message: string }[];
    basis?: unknown;
  };
  context: string;
  rates?: string;
}) {
  return (
    <Form
      navigationTitle="Calculation Details"
      actions={
        <ActionPanel>
          {result?.ok && (
            <Action.CopyToClipboard
              title="Copy Result"
              content={result.formatted ?? ""}
            />
          )}
        </ActionPanel>
      }
    >
      <Form.Description title="Expression" text={source || "No expression"} />
      <Form.Description
        title={result?.ok ? "Result" : "Diagnostic"}
        text={
          result?.ok
            ? (result.formatted ?? "")
            : result?.diagnostics.map((d) => d.message).join("\n") ||
              "Enter a calculation."
        }
      />
      <Form.Description title="Context" text={context} />
      {Boolean(basisDescription(result?.basis)) && (
        <Form.Description
          title="Explanation"
          text={basisDescription(result?.basis)}
        />
      )}
      {rates && <Form.Description title="Exchange Rates" text={rates} />}
    </Form>
  );
}
