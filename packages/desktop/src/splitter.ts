export const DEFAULT_RESULT_RATIO = 0.34;
/** Width limits preserve useful space for both columns, including small windows. */
export function columnLimits(available: number) {
  const width = Math.max(0, available);
  const minimum = Math.min(160, width * 0.4);
  const sourceMinimum = Math.min(220, width - minimum);
  return { minimum, maximum: width - sourceMinimum };
}
export function resultWidth(available: number, requested: number) {
  const { minimum, maximum } = columnLimits(available);
  const value = Number.isFinite(requested)
    ? requested
    : available * DEFAULT_RESULT_RATIO;
  return Math.min(maximum, Math.max(minimum, value));
}
export function savedColumnRatio(raw: string | null) {
  const ratio = raw === null ? NaN : Number(raw);
  return Number.isFinite(ratio) && ratio > 0 && ratio < 1
    ? ratio
    : DEFAULT_RESULT_RATIO;
}
