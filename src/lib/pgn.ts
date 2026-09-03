import { Chess, DEFAULT_POSITION } from "chess.js";
import { gameFromChess, type Game, type GameHeaders } from "./gameModel";
import { addMove, emptyTree, type GameTree } from "./gameTree";

/**
 * PGN ingestion: text in, a {@link Game} or a {@link GameTree} out.
 *
 * The *models* those games are expressed in live in `lib/gameModel.ts` and
 * `lib/gameTree.ts`; this module owns nothing but the parsing, and is one
 * producer of each. Everything here is pure, so the screens and their tests can
 * use it freely.
 *
 * The split between the two parsing steps is deliberate: cutting a file into
 * games is a *text* concern (games are separated by a blank line before the
 * next `[Event ...]` tag pair), while a parser only ever takes one game at a
 * time.
 *
 * ## Two parsers, because they answer different questions
 *
 * {@link parsePgnGames} hands the work to `chess.js` `loadPgn`, which reads the
 * **mainline and discards every `( ... )` side line** — the right answer for a
 * screen that replays one game. {@link parsePgnTrees} keeps them, because an
 * analysis board's whole point is the side lines, so it walks the movetext
 * itself and uses `chess.js` only to decide what each move means in the position
 * it is played from.
 */

/**
 * Raised instead of letting a `chess.js` parse error escape into the UI.
 *
 * `detail` is the underlying library message and `gameNumber` (1-based) is set
 * when the failure came from one game inside a multi-game file. The `message`
 * itself is English and meant for logs — the screen renders a *translated*
 * string built from those two fields.
 */
export class PgnParseError extends Error {
  readonly detail: string;
  readonly gameNumber?: number;

  constructor(detail: string, gameNumber?: number) {
    super(
      gameNumber === undefined ? detail : `Game ${gameNumber}: ${detail}`,
    );
    this.name = "PgnParseError";
    this.detail = detail;
    this.gameNumber = gameNumber;
  }
}

/**
 * Raised when there is no game in the input at all — an empty paste, a file of
 * blank lines. Its own type because the UI answers it with "nothing to load"
 * rather than with a parse failure, and matching on a message string would be
 * a trap for the next edit.
 */
export class EmptyPgnError extends PgnParseError {
  constructor() {
    super("No PGN text found.");
    this.name = "EmptyPgnError";
  }
}

/**
 * Cut PGN text into one chunk per game.
 *
 * Purely textual: a new game starts at an `[Event ...]` tag that follows a
 * blank line, which is how the PGN export format separates them. Blank chunks
 * are dropped, so trailing newlines and an empty input both yield `[]`.
 */
export const splitPgnGames = (pgn: string): string[] =>
  pgn
    // Normalise CRLF / CR first — the split below anchors on "\n", and a file
    // saved on Windows would otherwise never match it.
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n(?=[ \t]*\[Event\b)/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);

/**
 * Parse exactly one game. Throws {@link PgnParseError} — never a raw `chess.js`
 * error — so every caller has one thing to catch. `gameNumber` is threaded
 * through only so a multi-game failure can name which game went wrong.
 */
export const parsePgnGame = (pgn: string, gameNumber?: number): Game => {
  const chess = new Chess();

  try {
    chess.loadPgn(pgn);
  } catch (cause) {
    throw new PgnParseError(
      cause instanceof Error ? cause.message : String(cause),
      gameNumber,
    );
  }

  // The parsed tag pairs win over the snapshot's own `FEN` reconstruction:
  // a PGN that set up a position states it in its headers already.
  return gameFromChess(chess, chess.getHeaders());
};

/**
 * Parse a whole PGN file: split it, then parse each game. Throws
 * {@link PgnParseError} on the first game that fails (with its 1-based number),
 * and {@link EmptyPgnError} on input that holds no game at all.
 */
export const parsePgnGames = (pgn: string): Game[] => {
  const chunks = splitPgnGames(pgn);
  if (chunks.length === 0) {
    throw new EmptyPgnError();
  }

  return chunks.map((chunk, index) =>
    // Single-game input keeps `gameNumber` undefined: "Game 1: ..." would be
    // noise when there is only one.
    parsePgnGame(chunk, chunks.length > 1 ? index + 1 : undefined),
  );
};

/* ------------------------------------------------------------------ *
 * Variation-aware parsing
 * ------------------------------------------------------------------ */

/** The game terminators, which end the movetext and are not moves. */
const RESULTS = new Set(["1-0", "0-1", "1/2-1/2", "*"]);

/**
 * Split a game's text into its tag pairs and its movetext.
 *
 * The tag values are read with an explicit escape rule (`\"` inside a value),
 * because a PGN `[Event "The \"Open\""]` is legal and a lazier regex would cut
 * the value in half.
 */
const splitTags = (pgn: string): { headers: GameHeaders; movetext: string } => {
  const TAG = /^[ \t]*\[[ \t]*([A-Za-z0-9_]+)[ \t]+"((?:[^"\\]|\\.)*)"[ \t]*\][ \t]*$/;
  const headers: GameHeaders = {};
  const body: string[] = [];

  for (const line of pgn.replace(/\r\n?/g, "\n").split("\n")) {
    const tag = TAG.exec(line);
    // Only the *leading* run of lines is tags; once movetext has started, a
    // bracketed line is movetext (it can only be a malformed one, and letting
    // the move parser fail on it says so far better than silently eating it).
    if (tag !== null && body.length === 0) {
      headers[tag[1]] = tag[2].replace(/\\(.)/g, "$1");
    } else if (line.trim() !== "" || body.length > 0) {
      body.push(line);
    }
  }

  return { headers, movetext: body.join("\n") };
};

/**
 * Cut movetext into the tokens the walk below cares about: moves, `(`, `)` and
 * results. Everything PGN allows between them is dropped first —
 * `{ ... }` and `; ...` comments, `< ... >` reserved sections, `$12` NAGs, the
 * `!?`-style suffixes, and the move numbers themselves, which carry no
 * information a ply counter does not already have.
 */
const tokenizeMovetext = (movetext: string): string[] =>
  movetext
    .replace(/\{[^}]*\}/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/;[^\n]*/g, " ")
    .replace(/\$\d+/g, " ")
    // Move numbers: "12.", "12...", and the spaced "12. .." a few writers emit.
    .replace(/\b\d+\s*\.(\s*\.\.)?/g, " ")
    .replace(/[()]/g, (bracket) => ` ${bracket} `)
    .split(/\s+/)
    .filter((token) => token !== "");

/**
 * Parse one game *with its variations* into a {@link GameTree}.
 *
 * The walk is a stack over `(` and `)`. A variation is an alternative to the
 * move that came **before** it, so opening one rewinds to the position that move
 * was played from and re-parents to that move's parent; closing one restores
 * where the outer line had got to — including *which* move it was last at, so a
 * second `( ... )` in a row is another alternative to the same move rather than
 * to the first alternative.
 *
 * Throws {@link PgnParseError} on the first move that will not play, naming it,
 * because "illegal move in a variation" is otherwise indistinguishable from a
 * screen that silently dropped half the file.
 */
export const parsePgnTree = (pgn: string, gameNumber?: number): GameTree => {
  const { headers, movetext } = splitTags(pgn);
  const startFen = headers.FEN?.trim() || DEFAULT_POSITION;

  let tree: GameTree;
  try {
    // The start position is validated here rather than on the first move, so a
    // broken `FEN` tag reads as a broken FEN tag.
    new Chess(startFen);
    tree = emptyTree(startFen, headers);
  } catch (cause) {
    throw new PgnParseError(
      cause instanceof Error ? cause.message : String(cause),
      gameNumber,
    );
  }

  /** Where the next move goes: under `parentId`, played from `fen`. */
  type Cursor = { parentId: string | null; fen: string };

  let cursor: Cursor = { parentId: null, fen: startFen };
  /** The cursor as it stood *before* the last move — what `(` rewinds to. */
  let previous: Cursor | null = null;
  const stack: { cursor: Cursor; previous: Cursor | null }[] = [];

  for (const token of tokenizeMovetext(movetext)) {
    if (token === "(") {
      if (previous === null) {
        throw new PgnParseError(
          "A variation opened before any move was played.",
          gameNumber,
        );
      }
      stack.push({ cursor, previous });
      cursor = previous;
      previous = null;
      continue;
    }

    if (token === ")") {
      const outer = stack.pop();
      if (outer === undefined) {
        throw new PgnParseError("Unbalanced ')' in the movetext.", gameNumber);
      }
      cursor = outer.cursor;
      previous = outer.previous;
      continue;
    }

    if (RESULTS.has(token)) continue;

    const chess = new Chess(cursor.fen);
    let move;
    try {
      move = chess.move(token);
    } catch {
      throw new PgnParseError(`Illegal move "${token}".`, gameNumber);
    }

    const added = addMove(tree, cursor.parentId, {
      san: move.san,
      from: move.from,
      to: move.to,
      fen: move.after,
    });
    tree = added.tree;

    previous = cursor;
    cursor = { parentId: added.nodeId, fen: move.after };
  }

  if (stack.length > 0) {
    throw new PgnParseError("Unclosed '(' in the movetext.", gameNumber);
  }

  return tree;
};

/**
 * Parse a whole PGN file into variation trees — the same file handling
 * {@link parsePgnGames} does, and the same errors, over the parser that keeps
 * side lines.
 */
export const parsePgnTrees = (pgn: string): GameTree[] => {
  const chunks = splitPgnGames(pgn);
  if (chunks.length === 0) {
    throw new EmptyPgnError();
  }

  return chunks.map((chunk, index) =>
    parsePgnTree(chunk, chunks.length > 1 ? index + 1 : undefined),
  );
};
