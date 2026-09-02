import { Chess, DEFAULT_POSITION, type Square } from "chess.js";

/**
 * PGN ingestion and the parsed-game model.
 *
 * The Load PGN screen owns this module; the move list / navigation consumes it.
 * Everything here is plain data and pure functions — no React, no live
 * `chess.js` instance handed out — so both sides and their tests can use it
 * freely and neither has to reach into the other's components.
 *
 * The split between the two parsing steps is deliberate: cutting a file into
 * games is a *text* concern (games are separated by a blank line before the
 * next `[Event ...]` tag pair), while `chess.js` `loadPgn` only ever takes one
 * game at a time.
 */

/** PGN tag pairs, e.g. `{ White: "Alice", Result: "1-0" }`. */
export type PgnHeaders = Record<string, string>;

/** One half-move of a parsed game. */
export type ParsedMove = {
  /** Standard algebraic notation, as written in the PGN — `"Nf3"`, `"O-O"`. */
  san: string;
  from: Square;
  to: Square;
  /** The position *after* this move, so a viewer can jump straight to it. */
  fen: string;
  /** 1-based half-move number: White's first move is 1, Black's reply 2. */
  ply: number;
};

/** A single game: its tag pairs, and its moves in order. */
export type ParsedGame = {
  headers: PgnHeaders;
  moves: ParsedMove[];
};

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
 * The placeholder values the PGN spec uses for "unknown". They are not worth
 * showing in a game picker, so `pgnTag` reports them as absent.
 */
const PLACEHOLDER_TAGS = new Set(["", "?", "??", "???", "-", "????.??.??", "*"]);

/**
 * A tag's value, or `undefined` when it is missing or a spec placeholder.
 * `chess.js` fills the seven-tag roster with those placeholders even for a PGN
 * that carried no tags at all, so reading `headers.White` directly would put a
 * literal "?" in the UI.
 */
export const pgnTag = (
  headers: PgnHeaders,
  key: string,
): string | undefined => {
  const value = headers[key]?.trim();
  return value === undefined || PLACEHOLDER_TAGS.has(value) ? undefined : value;
};

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
export const parsePgnGame = (pgn: string, gameNumber?: number): ParsedGame => {
  const chess = new Chess();

  try {
    chess.loadPgn(pgn);
  } catch (cause) {
    throw new PgnParseError(
      cause instanceof Error ? cause.message : String(cause),
      gameNumber,
    );
  }

  return {
    headers: chess.getHeaders(),
    moves: chess.history({ verbose: true }).map((move, index) => ({
      san: move.san,
      from: move.from,
      to: move.to,
      // `Move.after` is the FEN once the move has been made — exactly the
      // position a move list wants to show when this ply is selected.
      fen: move.after,
      ply: index + 1,
    })),
  };
};

/**
 * Parse a whole PGN file: split it, then parse each game. Throws
 * {@link PgnParseError} on the first game that fails (with its 1-based number),
 * and {@link EmptyPgnError} on input that holds no game at all.
 */
export const parsePgnGames = (pgn: string): ParsedGame[] => {
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

/**
 * The position the game starts from — the standard opening position unless the
 * PGN set one up with a `FEN` tag.
 */
export const initialFenOf = (game: ParsedGame): string =>
  pgnTag(game.headers, "FEN") ?? DEFAULT_POSITION;

/** The position after the last move, or the starting one for a moveless game. */
export const finalFenOf = (game: ParsedGame): string =>
  game.moves.at(-1)?.fen ?? initialFenOf(game);
