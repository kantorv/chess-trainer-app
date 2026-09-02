import { Chess } from "chess.js";
import { gameFromChess, type Game } from "./gameModel";

/**
 * PGN ingestion: text in, {@link Game} out.
 *
 * The *model* those games are expressed in lives in `lib/gameModel.ts` and is
 * shared with the live game the engine screen grows — this module is only one
 * of its two producers, and owns nothing but the parsing. Everything here is
 * pure, so the Load PGN screen and its tests can use it freely.
 *
 * The split between the two parsing steps is deliberate: cutting a file into
 * games is a *text* concern (games are separated by a blank line before the
 * next `[Event ...]` tag pair), while `chess.js` `loadPgn` only ever takes one
 * game at a time.
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
