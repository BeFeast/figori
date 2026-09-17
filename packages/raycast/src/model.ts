export type Settings = { timezone: string; anchorMode: "today" | "fixed"; anchorDate: string; includePartial: boolean };
export const defaults: Settings = { timezone: "Asia/Jerusalem", anchorMode: "today", anchorDate: "", includePartial: false };
export function validateSettings(settings: Settings): string | undefined {
  if (typeof settings.timezone !== "string" || !settings.timezone.trim()) return "Enter an IANA timezone.";
  if (!["today", "fixed"].includes(settings.anchorMode) || typeof settings.includePartial !== "boolean") return "Invalid saved date or billing settings.";
  try { new Intl.DateTimeFormat("en", { timeZone: settings.timezone }).format(); } catch { return "Enter a valid IANA timezone, such as Asia/Jerusalem."; }
  if (settings.anchorMode === "fixed") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(settings.anchorDate)) return "Enter the fixed anchor as YYYY-MM-DD.";
    const [y, m, d] = settings.anchorDate.split("-").map(Number);
    const date = new Date(0); date.setUTCFullYear(y, m - 1, d); date.setUTCHours(0, 0, 0, 0);
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return "The fixed anchor is not a valid calendar date.";
  }
}
export function resolvedAnchor(settings: Settings, now: string): string {
  if (settings.anchorMode === "fixed") return settings.anchorDate;
  const parts = new Intl.DateTimeFormat("en", { timeZone: settings.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(now));
  return ["year", "month", "day"].map(type => parts.find(p => p.type === type)?.value).join("-");
}
export function contextFor(settings: Settings, now: string) {
  return { now, timezone: settings.timezone, anchor: settings.anchorMode === "today" ? { mode: "today" as const } : { mode: "fixed" as const, date: settings.anchorDate }, billing: settings.includePartial ? "include-partial" as const : "completed" as const };
}
export function describeContext(settings: Settings, now: string): string {
  const error = validateSettings(settings);
  if (error) return error;
  return `Anchor: ${resolvedAnchor(settings, now)} (${settings.anchorMode === "today" ? "dynamic today" : "pinned"}) · ${settings.timezone}\nBilling: completed monthly periods${settings.includePartial ? " + trailing partial period" : " only"}`;
}
export function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item, 2);
}
export function escapeMarkdown(value: string): string { return value.replace(/[\\`*_{}\[\]<>()#!|]/g, "\\$&"); }
