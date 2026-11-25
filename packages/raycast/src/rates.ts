import { environment, showToast, Toast } from "@raycast/api";
import { loadRates, refreshRates } from "@my-numi/rates";
import { join } from "node:path";
import { useCallback, useEffect, useRef, useState } from "react";
type RateState = Awaited<ReturnType<typeof loadRates>>;
const options = { directory: join(environment.supportPath, "rates") };
export function rateDescription(state: RateState): string {
  return `Rates: ${state.status}${state.snapshot ? ` · ${state.snapshot.source} · as of ${state.snapshot.asOf}` : " · conversion unavailable"}${state.error ? `\n${state.error}` : ""}`;
}
export function useRates() {
  const [state, setState] = useState<RateState>({ status: "unavailable" });
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const read = useCallback(async (network: boolean) => {
    const current = ++generation.current;
    setLoading(true);
    try {
      const value = await (network
        ? refreshRates(options)
        : loadRates(options));
      if (current !== generation.current) return;
      setState(value);
      if (network)
        await showToast(
          value.status === "fresh" && !value.error
            ? Toast.Style.Success
            : Toast.Style.Failure,
          value.status === "fresh" && !value.error
            ? "Rates Updated"
            : "Rates Not Refreshed",
          value.error ?? rateDescription(value),
        );
    } catch (error) {
      if (current === generation.current)
        setState((old) => ({ ...old, error: String(error) }));
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void read(false);
    const timer = setInterval(() => {
      void read(false);
    }, 60_000);
    return () => {
      generation.current++;
      clearInterval(timer);
    };
  }, [read]);
  return { state, loading, refreshRates: () => read(true) };
}
