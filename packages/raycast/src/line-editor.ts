import { updateDocument, type Worksheet } from "@my-numi/document";

function validateLine(text: string): void {
  if (!text.trim()) throw new Error("Enter a non-empty worksheet line.");
  if (/[\r\n]/.test(text)) {
    throw new Error(
      "Enter one line; use the full worksheet editor for multiple lines.",
    );
  }
}

/** Append without rewriting existing bytes, blank rows, or newline convention. */
export function appendLine(document: Worksheet, text: string): Worksheet {
  validateLine(text);
  const endings = document.lines.map((line) => line.ending).filter(Boolean);
  const separator = endings.at(-1) ?? "\n";
  const terminated = /[\r\n]$/.test(document.source);
  const source =
    document.source.length === 0
      ? text
      : document.source +
        (terminated ? "" : separator) +
        text +
        (terminated ? separator : "");
  const next = updateDocument(document, source);
  // Content matching alone can steal an existing ID when the appended text is a
  // duplicate. Appending never moves existing rows: preserve their positions.
  if (document.source.length > 0) {
    document.lines.forEach((line, index) => {
      next.lines[index]!.id = line.id;
    });
    next.lines.at(-1)!.id = crypto.randomUUID();
  }
  return next;
}

/** Replace exactly one stable-ID row while preserving every other source byte. */
export function replaceLine(
  document: Worksheet,
  lineId: string,
  text: string,
): Worksheet {
  validateLine(text);
  const index = document.lines.findIndex((line) => line.id === lineId);
  if (index < 0)
    throw new Error(
      "This worksheet line no longer exists. Reopen the worksheet and try again.",
    );
  const replacement =
    index === 0 &&
    document.source.startsWith("\uFEFF") &&
    !text.startsWith("\uFEFF")
      ? "\uFEFF" + text
      : text;
  const source = document.lines
    .map(
      (line, position) =>
        (position === index ? replacement : line.source) + line.ending,
    )
    .join("");
  const next = updateDocument(document, source);
  // Replacement must retain the target ID even when its text becomes identical
  // to another row; updateDocument's general content matching cannot infer that.
  next.lines.forEach((line, position) => {
    line.id = document.lines[position]!.id;
  });
  return next;
}
