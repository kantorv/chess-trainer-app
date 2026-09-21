/**
 * **A PGN comment re-flowed for reading** — the comment block's prose
 * (`lib/moveAnnotations.ts`'s `readComment`).
 *
 * PGN hard-wraps comment text at ~column 80, so the raw lines are joined back
 * into paragraphs, with a blank line — or a line that opens a numbered /
 * bulleted list item — starting a new one. Pure: text in, paragraphs out.
 */

/**
 * Re-flow one raw comment into paragraphs.
 *
 * A blank line is a hard break. Inside a block, a line that begins a numbered
 * (`1.`, `2)`) or bulleted (`-`, `*`, `•`) list item also starts a new
 * paragraph — which is what keeps the rosettes preamble's four points on four
 * lines even though the source wrote them with single newlines. Everything else
 * on consecutive lines is one paragraph with its wraps collapsed to spaces.
 */
export const reflowComment = (raw: string): string[] => {
  const text = raw.replace(/\r\n?/g, "\n").trim();
  if (text === "") return [];

  const paragraphs: string[] = [];

  for (const block of text.split(/\n[ \t]*\n+/)) {
    let buffer: string[] = [];

    const flush = () => {
      if (buffer.length === 0) return;
      paragraphs.push(buffer.join(" ").replace(/\s+/g, " ").trim());
      buffer = [];
    };

    for (const line of block.split("\n")) {
      const trimmed = line.trim();
      if (trimmed === "") continue;
      if (buffer.length > 0 && /^(?:\d{1,3}[.)]\s|[-*•]\s)/.test(trimmed)) {
        flush();
      }
      buffer.push(trimmed);
    }
    flush();
  }

  return paragraphs.filter((paragraph) => paragraph !== "");
};
