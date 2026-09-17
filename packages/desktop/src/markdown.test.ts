import { expect, test } from "bun:test";
import { markdownMarks } from "./markdown";
test("styles source Markdown without changing markers or treating arithmetic as emphasis", () => {
  const source =
    "# Budget\n- **Rent** and *notes*\namount = 2 * 3 * 4\ninline `code`";
  const marks = markdownMarks(source);
  expect(marks.map((m) => m.className)).toEqual([
    "md-heading",
    "md-list",
    "md-strong",
    "md-emphasis",
    "md-code",
  ]);
  expect(marks.some((m) => source.slice(m.from, m.to) === "**Rent**")).toBe(
    true,
  );
  expect(marks.some((m) => source.slice(m.from, m.to).includes("amount"))).toBe(
    false,
  );
  expect(
    marks.every((m) => m.from >= 0 && m.to <= source.length && m.to > m.from),
  ).toBe(true);
});
test("fence contents remain visible code and longer fences require matching close", () => {
  const source =
    "````text\n# not a heading\n```\n**not emphasis**\n````\n# Actual heading";
  const marks = markdownMarks(source);
  expect(marks.map((m) => m.className)).toEqual([
    "md-code",
    "md-code",
    "md-code",
    "md-code",
    "md-code",
    "md-heading",
  ]);
  expect(
    markdownMarks("~~~\nx = 1\n~~~").every((m) => m.className === "md-code"),
  ).toBe(true);
});
