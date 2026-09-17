export type Typography = {
  font: "nerd" | "system";
  size: number;
  spacing: number;
};
export const defaultTypography: Typography = {
  font: "nerd",
  size: 16,
  spacing: 1.9,
};
export function normalizeTypography(value: unknown): Typography {
  const v =
    value && typeof value === "object" ? (value as Partial<Typography>) : {};
  const clamp = (n: unknown, fallback: number, min: number, max: number) =>
    typeof n === "number" && Number.isFinite(n)
      ? Math.min(max, Math.max(min, n))
      : fallback;
  return {
    font: v.font === "system" ? "system" : "nerd",
    size: clamp(v.size, 16, 12, 24),
    spacing: clamp(v.spacing, 1.9, 1.4, 2.2),
  };
}
export function readTypography(raw: string | null): Typography {
  try {
    return normalizeTypography(JSON.parse(raw ?? "null"));
  } catch {
    return { ...defaultTypography };
  }
}
export function typographyFont(font: Typography["font"]): string {
  return (
    (font === "nerd" ? '"Figori Nerd Mono", ' : "") +
    "ui-monospace, SFMono-Regular, monospace, Heebo, sans-serif"
  );
}
