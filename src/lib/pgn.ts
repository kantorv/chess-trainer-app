import { Chess, DEFAULT_POSITION } from "chess.js";
import { gameFromChess, type Game, type GameHeaders } from "./gameModel";
import { emptyTree, holdsComment, type GameTree, type VariationNode } from "./gameTree";

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
 * The tag pairs of one game, without reading its moves — what a list of lines
 * is named from, at the cost of a text scan rather than a parse. The same
 * reader {@link parsePgnTree} uses, so a name here is the name the tree carries.
 */
export const readPgnTags = (pgn: string): GameHeaders => splitTags(pgn).headers;

/**
 * One token of movetext, in a single left-to-right pass (CTA-69 — before, the
 * annotations were stripped out ahead of the walk and lost):
 *
 * 1. a `{ ... }` comment, 2. a `; ...` comment to the end of the line,
 * 3. a `$12` NAG, 4. `(` or `)`, 5. a move or a result, its `!?`-style suffix
 * split off in 6, and 7. a suffix written apart from its move (`e4 !?`).
 *
 * What the walk has no use for is matched and skipped: `< ... >` reserved
 * sections and the move numbers — `"12."`, `"12..."`, and the spaced
 * `"12. .."` a few writers emit — which carry nothing a ply counter does not.
 */
const MOVETEXT_TOKEN =
  /\{([^}]*)\}|;([^\n]*)|\$(\d+)|([()])|<[^>]*>|\d+\s*\.(?:\s*\.)*|([^\s{};$()<!?]+)([!?]*)|([!?]+)/g;

/** The move-quality suffixes, as the NAGs PGN numbers them. */
const SUFFIX_NAGS: Readonly<Record<string, number>> = {
  "!": 1,
  "?": 2,
  "!!": 3,
  "??": 4,
  "!?": 5,
  "?!": 6,
};

/** A comment's text as the tree keeps it — trimmed; `undefined` when empty. */
const commentText = (raw: string): string | undefined => {
  const text = raw.trim();
  return text === "" ? undefined : text;
};

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
 * Annotations are kept (CTA-69): a comment, NAG or `!?` mark belongs to the
 * move before it; a comment before a variation's first move is that move's
 * `preComments`, and one before the game's first move the tree's `comments`.
 * The scan is one regex pass, so reading them costs the walk nothing.
 *
 * Throws {@link PgnParseError} on the first move that will not play, naming it,
 * because "illegal move in a variation" is otherwise indistinguishable from a
 * screen that silently dropped half the file.
 */
export const parsePgnTree = (pgn: string, gameNumber?: number): GameTree => {
  const { headers, movetext } = splitTags(pgn);
  const startFen = headers.FEN?.trim() || DEFAULT_POSITION;

  let empty: GameTree;
  try {
    // The start position is validated here rather than on the first move, so a
    // broken `FEN` tag reads as a broken FEN tag.
    new Chess(startFen);
    empty = emptyTree(startFen, headers);
  } catch (cause) {
    throw new PgnParseError(
      cause instanceof Error ? cause.message : String(cause),
      gameNumber,
    );
  }

  /*
    The tree is built **in place**, with an id → node index beside it, rather
    than one `addMove` per move. `addMove` is the right operation for a board —
    it returns a new tree, so React state can hold one — but it finds the
    parent by walking the tree and then copies every node on the way back, so a
    whole file through it is quadratic: a ~9,000-node one-tree repertoire
    took seconds. Every node here is minted by this call and handed out only
    once the walk is over, so there is nothing to protect by copying.

    The result is exactly what the `addMove` loop produced: the same `n<k>` ids
    in the same order, `children[0]` the first continuation written, and a move
    already under its parent followed rather than added twice.
  */
  const moves: VariationNode[] = [];
  const byId = new Map<string, VariationNode>();
  let nextId = empty.nextId;

  const add = (
    parentId: string | null,
    move: Omit<VariationNode, "id" | "ply" | "children">,
  ): VariationNode => {
    const parent = parentId === null ? undefined : byId.get(parentId);
    const siblings = parent === undefined ? moves : parent.children;
    // SAN identifies a move uniquely within one position — `addMove`'s own test.
    const existing = siblings.find((node) => node.san === move.san);
    if (existing !== undefined) return existing;

    const node: VariationNode = {
      id: `n${nextId}`,
      ...move,
      ply: (parent?.ply ?? 0) + 1,
      children: [],
    };
    nextId += 1;
    siblings.push(node);
    byId.set(node.id, node);
    return node;
  };

  /** Where the next move goes: under `parentId`, played from `fen`. */
  type Cursor = { parentId: string | null; fen: string };

  let cursor: Cursor = { parentId: null, fen: startFen };
  const chess = new Chess(startFen);
  /** The position `chess` holds — a failed move leaves it untouched. */
  let loadedFen = startFen;
  /** The cursor as it stood *before* the last move — what `(` rewinds to. */
  let previous: Cursor | null = null;
  /**
   * The move the annotations that follow belong to: the last one played in
   * this variation, `null` before its first. A comment there is not after any
   * move of the variation, so it waits in `pending` for the move it opens —
   * or, before the game's first move, is the game's own.
   */
  let annotated: VariationNode | null = null;
  let pending: string[] = [];
  const gameComments: string[] = [];
  const stack: {
    cursor: Cursor;
    previous: Cursor | null;
    annotated: VariationNode | null;
  }[] = [];

  /*
    A comment already on the same move, whitespace aside, is not added again:
    the file says the same thing twice (`holdsComment` — a merged export
    carries the same sentence wrapped two ways), and a record stored before
    the merge knew that reads clean from here on.
  */
  const addComment = (raw: string) => {
    const text = commentText(raw);
    if (text === undefined) return;
    const list =
      annotated !== null ? (annotated.comments ??= []) : stack.length === 0 ? gameComments : pending;
    if (!holdsComment(list, text)) list.push(text);
  };

  const addNag = (nag: number | undefined) => {
    if (annotated === null || nag === undefined) return;
    const nags = (annotated.nags ??= []);
    if (!nags.includes(nag)) nags.push(nag);
  };

  MOVETEXT_TOKEN.lastIndex = 0;
  for (let match = MOVETEXT_TOKEN.exec(movetext); match !== null; match = MOVETEXT_TOKEN.exec(movetext)) {
    const [, braced, lineComment, nag, bracket, san, suffix, looseSuffix] = match;

    if (braced !== undefined || lineComment !== undefined) {
      addComment(braced ?? lineComment);
      continue;
    }
    if (nag !== undefined) {
      addNag(Number(nag));
      continue;
    }
    if (looseSuffix !== undefined) {
      addNag(SUFFIX_NAGS[looseSuffix]);
      continue;
    }

    if (bracket === "(") {
      if (previous === null) {
        throw new PgnParseError(
          "A variation opened before any move was played.",
          gameNumber,
        );
      }
      stack.push({ cursor, previous, annotated });
      cursor = previous;
      previous = null;
      annotated = null;
      pending = [];
      continue;
    }

    if (bracket === ")") {
      const outer = stack.pop();
      if (outer === undefined) {
        throw new PgnParseError("Unbalanced ')' in the movetext.", gameNumber);
      }
      cursor = outer.cursor;
      previous = outer.previous;
      annotated = outer.annotated;
      // A variation of nothing but a comment: kept on the move it answers.
      if (pending.length > 0 && annotated !== null) {
        const after = (annotated.comments ??= []);
        for (const text of pending) if (!holdsComment(after, text)) after.push(text);
      }
      pending = [];
      continue;
    }

    // A reserved section or a move number: nothing to read.
    if (san === undefined) continue;
    const token = san;

    if (RESULTS.has(token)) continue;

    // One instance, reloaded only when the walk jumps — into or out of a
    // variation. Along a line the position is already the one the last move
    // left, and a FEN parse per move was most of what remained of the cost.
    // (`loadedFen` is set by the move below: a move that fails throws out of
    // the parse, so there is no path that loads and does not move.)
    if (loadedFen !== cursor.fen) chess.load(cursor.fen);
    let move;
    try {
      move = chess.move(token);
      loadedFen = move.after;
    } catch {
      throw new PgnParseError(`Illegal move "${token}".`, gameNumber);
    }

    const node = add(cursor.parentId, {
      san: move.san,
      from: move.from,
      to: move.to,
      fen: move.after,
      captured: move.captured,
    });
    if (pending.length > 0) {
      const before = (node.preComments ??= []);
      for (const text of pending) if (!holdsComment(before, text)) before.push(text);
      pending = [];
    }
    annotated = node;
    if (suffix !== "") addNag(SUFFIX_NAGS[suffix]);

    previous = cursor;
    cursor = { parentId: node.id, fen: move.after };
  }

  if (stack.length > 0) {
    throw new PgnParseError("Unclosed '(' in the movetext.", gameNumber);
  }

  return {
    ...empty,
    moves,
    nextId,
    ...(gameComments.length > 0 ? { comments: gameComments } : {}),
  };
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
