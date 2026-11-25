import { Action, ActionPanel, Color, Icon, List } from "@raycast/api";
import { useMemo, useState } from "react";
import { evaluateExpression } from "@my-numi/core";
import { rateDescription, useRates } from "./rates";
import {
  compactContext,
  compactResult,
  contextFor,
  validateSettings,
} from "./model";
import {
  ContextEditor,
  CalculationInfo,
  useClock,
  useQuickSettings,
} from "./ui";
export default function QuickCalculate() {
  const [source, setSource] = useState("");
  const { settings, setSettings, loaded } = useQuickSettings();
  const { now, refresh } = useClock();
  const { state: rates, loading: loadingRates, refreshRates } = useRates();
  const error = validateSettings(settings);
  const result = useMemo(() => {
    if (error || !source.trim()) return undefined;
    try {
      if (source.length > 16_384) throw new Error("Expression exceeds 16 KiB.");
      return evaluateExpression(source, {
        ...contextFor(settings, now),
        rates: rates.snapshot,
      });
    } catch (e) {
      return {
        ok: false,
        formatted: undefined,
        diagnostics: [{ code: "evaluation_error", message: String(e) }],
        basis: undefined,
      };
    }
  }, [source, settings, now, error, rates.snapshot]);
  const output = result?.formatted ?? "";
  const actions = (
    <ActionPanel>
      {result?.ok && (
        <Action.CopyToClipboard title="Copy Result" content={output} />
      )}
      <Action.Push
        title="Calculation Details"
        icon={Icon.Info}
        target={
          <CalculationInfo
            source={source}
            result={result}
            context={compactContext(settings, now)}
            rates={rateDescription(rates)}
          />
        }
      />
      <Action.Push
        title="Change Date and Timezone"
        icon={Icon.Calendar}
        target={
          <ContextEditor settings={settings} onSave={setSettings} now={now} />
        }
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
    </ActionPanel>
  );
  return (
    <List
      navigationTitle="Figori · Quick Calculate"
      searchBarPlaceholder="Type a calculation…"
      searchText={source}
      onSearchTextChange={setSource}
      filtering={false}
      isLoading={!loaded || loadingRates}
    >
      <List.Section title={compactContext(settings, now)}>
        {!source.trim() ? (
          <List.Item
            title="Type a calculation above"
            subtitle="For example: 13 may + 9 months"
            icon={Icon.Calculator}
            actions={actions}
          />
        ) : (
          <List.Item
            title={source}
            subtitle={
              error ||
              (!result?.ok
                ? result?.diagnostics.map((d) => d.message).join("; ")
                : undefined)
            }
            accessories={
              result?.ok
                ? [
                    {
                      text: {
                        value: compactResult(output),
                        color: Color.Green,
                      },
                      tooltip: output,
                    },
                  ]
                : []
            }
            icon={result?.ok ? Icon.Calculator : Icon.Warning}
            actions={actions}
          />
        )}
      </List.Section>
    </List>
  );
}
