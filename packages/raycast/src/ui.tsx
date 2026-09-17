import { Form, LocalStorage, showToast, Toast } from "@raycast/api";
import { useEffect, useState } from "react";
import { defaults, describeContext, Settings, validateSettings } from "./model";
export function useClock() {
  const [now, setNow] = useState(() => new Date().toISOString());
  const refresh = () => setNow(new Date().toISOString());
  useEffect(() => {
    const timer = setInterval(refresh, 1000);
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
