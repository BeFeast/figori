import { Action, ActionPanel, Form, Icon } from "@raycast/api";
import { useMemo, useState } from "react";
import { evaluateExpression } from "@my-numi/core";
import { rateDescription, useRates } from "./rates";
import { contextFor, textOf, validateSettings } from "./model";
import { ContextFields, useClock, useQuickSettings } from "./ui";
export default function QuickCalculate() {
  const [source, setSource] = useState("");
  const { settings, setSettings, loaded } = useQuickSettings();
  const { now, refresh } = useClock();
  const { state: rates, loading: loadingRates, refreshRates } = useRates();
  const error = validateSettings(settings);
  const result = useMemo(() => {
    if (error || !source.trim()) return undefined;
    if (source.length > 16_384) return { ok: false, formatted: undefined, diagnostics: [{ code: "input_limit", message: "Expression exceeds 16 KiB." }], basis: {} };
    try { return evaluateExpression(source, { ...contextFor(settings, now), rates: rates.snapshot }); }
    catch (error) { return { ok: false, formatted: undefined, diagnostics: [{ code: "evaluation_error", message: String(error) }], basis: {} }; }
  }, [source, settings, now, error, rates.snapshot]);
  const output = result?.ok ? result.formatted ?? "" : result?.diagnostics.map(d => d.message).join("\n") ?? "Enter an expression.";
  return <Form isLoading={!loaded || loadingRates} actions={<ActionPanel>
    {result?.ok && <Action.CopyToClipboard title="Copy Result" content={output} />}
    <Action title="Refresh Exchange Rates" icon={Icon.Coins} onAction={refreshRates} />
    <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={refresh} shortcut={{ modifiers: ["cmd"], key: "r" }} />
  </ActionPanel>}>
    <Form.TextField id="expression" title="Expression" value={source} onChange={setSource} placeholder="13 may 2022 + 9 months" error={error} />
    <Form.Description title={result?.ok ? "Result" : "Calculation"} text={output} />
    {result && <Form.Description title="Basis" text={textOf(result.basis)} />}
    <Form.Description title="Exchange Rates" text={rateDescription(rates)} />
    <ContextFields settings={settings} onChange={setSettings} now={now} />
  </Form>;
}
