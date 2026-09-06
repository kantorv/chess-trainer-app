/**
 * The annotation text a PGN carries, pulled out of the raw game chunk and
 * re-flowed for reading.
 *
 * ## Why this is not on the game model
 *
 * `chess.js` v1 `loadPgn` collapses every run of whitespace inside a
 * `{ ... }` comment to a single space *before* `getComments()` can be read, so
 * a game model filled from a live `chess.js` instance has already lost the
 * paragraph structure — the numbered list in the rosettes preamble, the
 * blank-line breaks in a study's opening notes. This module reads the PGN text
 * itself (`LibraryGame.pgn`), where those breaks survive, and leaves
 * `gameModel.ts` / `pgn.ts` — and therefore every existing producer and
 * consumer of `Game` — untouched.
 *
 * It is pure: text in, a {@link PgnComments} out.
 *
 * ## What it captures
 *
 * - The **preamble** — a comment before the first move, attached to the
 *   starting position (`ply` 0).
 * - Every **mainline move comment**, keyed by the 1-based half-move it follows.
 *   Comments inside `( ... )` variations are skipped: the replay screen walks
 *   the mainline only, so a variation comment has no ply to land on.
 *
 * Each comment is re-flowed: PGN hard-wraps comment text at ~column 80, so the
 * raw lines are joined back into paragraphs, with a blank line — or a line that
 * opens a numbered / bulleted list item — starting a new one.
 */

/** One move's annotation: the ply it follows, and its re-flowed paragraphs. */
export type PgnCommentEntry = {
  /** 1-based half-move index — the same ply the move list and `goToPly` use. */
  ply: number;
  /** The comment text, hard wraps collapsed, real breaks kept. Never empty. */
  paragraphs: string[];
};

/** Everything a game's annotation text amounts to. */
export type PgnComments = {
  /** The comment on the starting position, re-flowed. Empty when there is none. */
  preamble: string[];
  /** The mainline move comments, by ascending ply. */
  moves: PgnCommentEntry[];
};

/** The movetext terminators — not moves, and they must not advance the ply. */
const RESULTS = new Set(["1-0", "0-1", "1/2-1/2", "*"]);

/**
 * Drop the tag-pair header. The quoted-value clause spans newlines, so a study
 * export that wrapped a long `[Event "..."]` across two lines is still removed
 * whole rather than leaking its second line into the movetext.
 */
const stripTags = (pgn: string): string =>
  pgn.replace(/\[\s*[A-Za-z0-9_]+\s+"(?:[^"\\]|\\.)*"\s*\]/g, " ");

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

/** A raw comment and the ply it was attached to, before re-flow / merge. */
type RawComment = { ply: number; text: string };

/**
 * Walk the movetext, collecting depth-0 comments and counting depth-0 moves.
 *
 * `{ ... }` and `; ...` comments outside any `( ... )` are captured against the
 * current ply; NAGs (`$12`), reserved `< ... >` sections and move numbers are
 * discarded; a bare token that is not a result advances the ply.
 */
const collectRawComments = (movetext: string): RawComment[] => {
  const out: RawComment[] = [];
  let depth = 0;
  let ply = 0;

  // `(` and `)` get their own alternatives, so the move/result alternative must
  // not be allowed to swallow a trailing paren from a run-together `Nf6)`.
  const token =
    /\{([^}]*)\}|;([^\n]*)|<[^>]*>|\$\d+|\(|\)|(\d+\.+)|(\.{2,3})|([^\s()]+)/g;

  let match: RegExpExecArray | null;
  while ((match = token.exec(movetext)) !== null) {
    const [whole, brace, semi, , , other] = match;

    if (brace !== undefined) {
      if (depth === 0) out.push({ ply, text: brace });
    } else if (semi !== undefined) {
      if (depth === 0) out.push({ ply, text: semi });
    } else if (whole === "(") {
      depth += 1;
    } else if (whole === ")") {
      depth = Math.max(0, depth - 1);
    } else if (other !== undefined) {
      // A run-together "1.e4" still counts as one move once the number is off.
      const move = other.replace(/^\d+\.+/, "");
      if (depth === 0 && move !== "" && !RESULTS.has(move)) ply += 1;
    }
    // move-number, stray "..", NAG and `< >` sections: nothing to do.
  }

  return out;
};

/**
 * Extract and re-flow the annotation text of a single-game PGN chunk — the
 * `pgn` field a {@link import("./libraryCatalog").LibraryGame} already carries.
 *
 * Multiple comments on the same ply (a study occasionally splits one) are
 * concatenated in reading order.
 */
export const extractPgnComments = (pgn: string): PgnComments => {
  const raw = collectRawComments(stripTags(pgn.replace(/\r\n?/g, "\n")));

  const byPly = new Map<number, string[]>();
  for (const { ply, text } of raw) {
    const paragraphs = reflowComment(text);
    if (paragraphs.length === 0) continue;
    const existing = byPly.get(ply);
    if (existing === undefined) byPly.set(ply, paragraphs);
    else existing.push(...paragraphs);
  }

  return {
    preamble: byPly.get(0) ?? [],
    moves: [...byPly.entries()]
      .filter(([ply]) => ply > 0)
      .sort((a, b) => a[0] - b[0])
      .map(([ply, paragraphs]) => ({ ply, paragraphs })),
  };
};

/** Whether a game has any annotation text at all — drives the empty state. */
export const hasPgnComments = (comments: PgnComments): boolean =>
  comments.preamble.length > 0 || comments.moves.length > 0;
