import { type Chess, DEFAULT_POSITION, type Square } from "chess.js";

/**
 * The shared game model: what a "game" is to everything that displays one.
 *
 * Two screens produce games from opposite directions — Load PGN parses an
 * immutable game out of text, Play with Engine grows one move by move out of a
 * live `chess.js` instance — and both feed the same move list, the same ply
 * navigation and the same board controls. That is only true because they hand
 * those pieces the *same* type, so the model lives here rather than inside
 * either producer.
 *
 * It is plain data: no React, no live `chess.js` instance handed out. A
 * {@link Game} is a snapshot, and every move carries the position it produced,
 * so a viewer jumps to a ply by reading a FEN rather than by re-simulating.
 *
 * | Producer | How |
 * | --- | --- |
 * | PGN text | `parsePgnGames` (`lib/pgn.ts`) |
 * | a live `chess.js` game | {@link gameFromChess} |
 */

/** Game metadata, keyed by PGN tag name — e.g. `{ White: "Alice", Result: "1-0" }`. */
export type GameHeaders = Record<string, string>;

/** One half-move. */
export type GameMove = {
  /** Standard algebraic notation, as it is printed — `"Nf3"`, `"O-O"`, `"e8=Q"`. */
  san: string;
  from: Square;
  to: Square;
  /** The position *after* this move, so a viewer can jump straight to it. */
  fen: string;
  /** 1-based half-move number: White's first move is 1, Black's reply 2. */
  ply: number;
};

/** A single game: its tag pairs, and its moves in order. */
export type Game = {
  headers: GameHeaders;
  moves: GameMove[];
};

/**
 * The placeholder values the PGN spec uses for "unknown". They are not worth
 * showing in a game picker, so {@link gameTag} reports them as absent.
 */
const PLACEHOLDER_TAGS = new Set(["", "?", "??", "???", "-", "????.??.??", "*"]);

/**
 * A tag's value, or `undefined` when it is missing or a spec placeholder.
 * `chess.js` fills the seven-tag roster with those placeholders even for a PGN
 * that carried no tags at all, so reading `headers.White` directly would put a
 * literal "?" in the UI.
 */
export const gameTag = (
  headers: GameHeaders,
  key: string,
): string | undefined => {
  const value = headers[key]?.trim();
  return value === undefined || PLACEHOLDER_TAGS.has(value) ? undefined : value;
};

/**
 * The position the game starts from — the standard opening position unless a
 * `FEN` tag set one up. Both producers write that tag the same way, so the move
 * numbering and ply 0 come out right for a game that does not start at move 1.
 */
export const initialFenOf = (game: Game): string =>
  gameTag(game.headers, "FEN") ?? DEFAULT_POSITION;

/** The position after the last move, or the starting one for a moveless game. */
export const finalFenOf = (game: Game): string =>
  game.moves.at(-1)?.fen ?? initialFenOf(game);

/**
 * Snapshot a live `chess.js` game into the model.
 *
 * A **copy**, taken at the moment of the call: the returned object shares
 * nothing with the instance, so handing it to a component is safe even though
 * the instance behind it keeps being mutated. Producing a fresh snapshot after
 * every move is also what makes the new game a new object — the move list and
 * the panel both key their "did the game change?" checks on identity.
 *
 * The starting position is read off the first move's `before` FEN (or, for a
 * game with no moves yet, off the instance itself) and recorded as a `FEN`
 * header when it is not the standard one — which is what lets a game set up
 * from a custom position number its moves correctly.
 */
export const gameFromChess = (
  chess: Chess,
  headers: GameHeaders = {},
): Game => {
  const history = chess.history({ verbose: true });
  const startFen = history[0]?.before ?? chess.fen();

  return {
    headers:
      startFen === DEFAULT_POSITION
        ? { ...headers }
        : { FEN: startFen, ...headers },
    moves: history.map((move, index) => ({
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
