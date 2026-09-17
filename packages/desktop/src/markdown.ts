export type MarkdownMark = { from: number; to: number; className: string };
/** Source-only styling: no replacement, HTML rendering or document mutation. */
export function markdownMarks(source: string): MarkdownMark[] {
  const marks: MarkdownMark[] = [];
  let offset = 0;
  let fence: { char: string; length: number } | undefined;
  for (const text of source.split("\n")) {
    const marker = text.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fence) {
      if (text.length)
        marks.push({
          from: offset,
          to: offset + text.length,
          className: "md-code",
        });
      if (
        marker &&
        marker[1]![0] === fence.char &&
        marker[1]!.length >= fence.length &&
        !text.slice(marker[0].length).trim()
      )
        fence = undefined;
    } else if (marker) {
      fence = { char: marker[1]![0]!, length: marker[1]!.length };
      marks.push({
        from: offset,
        to: offset + text.length,
        className: "md-code",
      });
    } else {
      if (/^ {0,3}#{1,6}\s+/.test(text))
        marks.push({
          from: offset,
          to: offset + text.length,
          className: "md-heading",
        });
      const list = text.match(/^\s*(?:[-+*]|\d+[.)])\s+/);
      if (list)
        marks.push({
          from: offset,
          to: offset + list[0].length,
          className: "md-list",
        });
      const code: Array<[number, number]> = [];
      for (const match of text.matchAll(/(`+)([^`]|(?!\1)`)*?\1/g)) {
        const from = match.index!,
          to = from + match[0].length;
        code.push([from, to]);
        marks.push({
          from: offset + from,
          to: offset + to,
          className: "md-code",
        });
      }
      for (const match of text.matchAll(
        /(^|\s)(\*\*|__|\*|_)(?=\S)(.+?\S|\S)\2(?=$|[\s.,!?;:])/g,
      )) {
        const from = match.index! + match[1]!.length,
          to = match.index! + match[0].length;
        if (!code.some(([a, b]) => from < b && to > a))
          marks.push({
            from: offset + from,
            to: offset + to,
            className: match[2]!.length === 2 ? "md-strong" : "md-emphasis",
          });
      }
    }
    offset += text.length + 1;
  }
  return marks;
}
