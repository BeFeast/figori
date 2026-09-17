import { expect, test } from "bun:test";
import { columnLimits, resultWidth, savedColumnRatio } from "./splitter";
test("result column expands beyond the old cap while retaining editable source space", () => {
  expect(resultWidth(960, 700)).toBe(700);
  expect(resultWidth(960, 2000)).toBe(740);
  expect(resultWidth(960, 40)).toBe(160);
  expect(columnLimits(640)).toEqual({ minimum: 160, maximum: 420 });
});
test("saved ratio survives window resize with clamping instead of changing preference", () => {
  const ratio = savedColumnRatio("0.7");
  expect(resultWidth(960, 960 * ratio)).toBe(672);
  expect(resultWidth(640, 640 * ratio)).toBe(420);
  expect(resultWidth(1200, 1200 * ratio)).toBe(840);
  expect(savedColumnRatio("broken")).toBe(0.34);
  expect(savedColumnRatio(null)).toBe(0.34);
  expect(savedColumnRatio("2")).toBe(0.34);
  expect(resultWidth(100, 1000)).toBe(40);
});
