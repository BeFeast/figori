import { expect, test } from "bun:test";
import {
  readTypography,
  normalizeTypography,
  typographyFont,
} from "./typography";
test("stored typography validates corrupt preferences and clamps readable metrics", () => {
  expect(readTypography("bad")).toEqual({
    font: "nerd",
    size: 16,
    spacing: 1.9,
  });
  expect(
    normalizeTypography({ font: "unknown", size: 999, spacing: -1 }),
  ).toEqual({ font: "nerd", size: 24, spacing: 1.4 });
  expect(
    normalizeTypography({ font: "system", size: NaN, spacing: Infinity }),
  ).toEqual({ font: "system", size: 16, spacing: 1.9 });
  expect(
    readTypography(JSON.stringify({ font: "system", size: 20, spacing: 2.1 })),
  ).toEqual({ font: "system", size: 20, spacing: 2.1 });
  expect(typographyFont("nerd")).toContain('"Figori Nerd Mono"');
  expect(typographyFont("system")).not.toContain('"Figori Nerd Mono"');
});

test("both editor font choices prioritize the dedicated currency glyph before platform fallback", () => {
  for (const font of ["nerd", "system"] as const) {
    expect(typographyFont(font).startsWith('"Figori Currency", ')).toBe(true);
  }
});
