import { expect, test } from "bun:test";
import { headingLevel, markdownMarks } from "./markdown";
test("styles source Markdown without changing markers or treating arithmetic as emphasis", () => {
  const source =
    "# Budget\n- **Rent** and *notes*\namount = 2 * 3 * 4\ninline `code`";
  const marks = markdownMarks(source);
  expect(marks.map((m) => m.className)).toEqual([
    "md-heading md-h1",
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
    "md-heading md-h1",
  ]);
  expect(
    markdownMarks("~~~\nx = 1\n~~~").every((m) => m.className === "md-code"),
  ).toBe(true);
});

test("all six ATX levels retain exact visible ranges regardless of worksheet format", () => {
  const lines = Array.from(
    { length: 6 },
    (_, i) => "#".repeat(i + 1) + " Heading " + (i + 1),
  );
  const source = lines.join("\n");
  const marks = markdownMarks(source);
  expect(marks.map((m) => m.className)).toEqual(
    lines.map((_, i) => "md-heading md-h" + (i + 1)),
  );
  expect(marks.map((m) => source.slice(m.from, m.to))).toEqual(lines);
  expect(headingLevel("   ### Stocks")).toBe(3);
  expect(headingLevel("######")).toBe(6);
  for (const text of [
    "####### Not heading",
    "#hashtag",
    "    # Indented",
    "value # comment",
  ])
    expect(headingLevel(text)).toBeNull();
  expect(
    markdownMarks("~~~\n# Hidden heading\n~~~").some((m) =>
      m.className.includes("md-heading"),
    ),
  ).toBe(false);
});
