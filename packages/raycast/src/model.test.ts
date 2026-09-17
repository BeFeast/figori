import { describe, expect, test } from "bun:test";
import { contextFor, defaults, resolvedAnchor, validateSettings } from "./model";
describe("visible evaluation context", () => {
  test("today follows the selected timezone around midnight", () => {
    expect(resolvedAnchor(defaults, "2026-01-01T22:30:00Z")).toBe("2026-01-02");
    expect(resolvedAnchor({ ...defaults, timezone: "America/New_York" }, "2026-01-01T22:30:00Z")).toBe("2026-01-01");
  });
  test("pinned anchors remain pinned and reject normalized invalid dates", () => {
    const fixed = { ...defaults, anchorMode: "fixed" as const, anchorDate: "2024-02-29" };
    expect(validateSettings(fixed)).toBeUndefined();
    expect(resolvedAnchor(fixed, "2030-01-01T00:00:00Z")).toBe("2024-02-29");
    expect(validateSettings({ ...fixed, anchorDate: "2023-02-29" })).toContain("not a valid");
    expect(validateSettings({ ...fixed, timezone: "Invalid/Timezone" })).toContain("IANA");
  });
  test("billing choice and shared clock reach the evaluator unchanged", () => {
    const now = "2026-01-01T00:00:00Z";
    expect(contextFor({ ...defaults, includePartial: true }, now)).toMatchObject({ now, billing: "include-partial", anchor: { mode: "today" } });
    expect(contextFor(defaults, now).billing).toBe("completed");
  });
});
