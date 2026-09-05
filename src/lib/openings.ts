import { Chess } from "chess.js";

/**
 * Opening lookup over the vendored eco.json database
 * (`src/data/openings/eco{A..E}.json`, ~16,000 positions — see
 * `scripts/vendorOpenings.mjs` for provenance and licensing).
 *
 * Pure, no React, and non-throwing: an unrecognised position is `undefined`,
 * never an error, because most of the positions a game reaches are not in any
 * opening book and that is a fact about chess, not a failure.
 *
 * The published `@chess-openings/eco.json` package downloads this data from
 * GitHub at runtime (and drops it from the npm tarball entirely — its
 * `.npmignore` excludes every `*.json`). CTA-30 rules that out: this screen
 * has to work offline and on GitHub Pages, so the data is vendored into the
 * repo and loaded through Vite's own code splitting instead of a `fetch`.
 */

/** One opening, trimmed to what the app shows. */
export type OpeningEntry = {
  /** ECO code, e.g. `"B90"`. Many positions share one — it names a family, not a single line. */
  eco: string;
  /** The opening's name, in eco.json's own `"Opening: Variation, SubVariation"` convention. */
  name: string;
  /** The SAN line eco.json recorded this entry under, e.g. `"1. e4 c5 2. Nf3 d6"`. */
  moves: string;
};

/** The whole book, keyed by full FEN (board + turn + castling + en passant). */
export type OpeningBook = Readonly<Record<string, OpeningEntry>>;

/**
 * Board-only FEN (piece placement alone — see {@link positionOf}) mapped to
 * every full FEN the book has for it. Built once per book with
 * {@link getPositionBook} and reused across lookups — a screen calls it once
 * and passes the result to every {@link findOpening} / {@link nextMoveOpenings}
 * call, rather than rebuilding it per lookup.
 */
export type PositionBook = Readonly<Record<string, readonly string[]>>;

/**
 * The board half of a FEN — piece placement alone, dropping turn, castling, en
 * passant and the clocks. The same convention eco.json's own position book
 * uses (`methods/findOpening.ts`), kept for compatibility with how the source
 * data transposes: two positions that differ only in castling rights (a rook
 * that moved and came back) or the side to move still count as "the same
 * position" for fallback purposes.
 */
const positionOf = (fen: string): string => fen.split(" ")[0];

let bookPromise: Promise<OpeningBook> | null = null;

/**
 * Loads and merges the five vendored shards, once, and caches the promise —
 * later calls (a step back through the game, a re-mount of the screen) get the
 * same object rather than re-triggering five chunk fetches.
 *
 * Dynamic `import()` rather than a static one at the top of this module: a
 * static import would pull ~3MB of JSON into every screen that imports
 * anything from this file, whether or not it ever opens the Openings screen.
 * With a dynamic import, Vite gives each shard its own chunk and nothing
 * downloads it until this function is actually called.
 *
 * Non-throwing even here: a chunk failing to load (an offline reader hitting a
 * stale cached `index.html` after a deploy, say) is reported as an empty book
 * rather than an unhandled rejection — every position then reads as
 * unrecognised, which is the same honest answer this module gives for any
 * other position it does not have.
 */
export const loadOpeningBook = (): Promise<OpeningBook> => {
  bookPromise ??= Promise.all([
    import("../data/openings/ecoA.json"),
    import("../data/openings/ecoB.json"),
    import("../data/openings/ecoC.json"),
    import("../data/openings/ecoD.json"),
    import("../data/openings/ecoE.json"),
  ])
    .then((modules) => Object.assign({}, ...modules.map((m) => m.default)) as OpeningBook)
    .catch(() => ({}) as OpeningBook);
  return bookPromise;
};

/**
 * Builds the position-only index over a book — the fallback that lets a
 * position reached with a different move-order, or a different castling/en
 * passant state than the one eco.json recorded, still resolve to the same
 * opening.
 */
export const getPositionBook = (book: OpeningBook): PositionBook => {
  const positions: Record<string, string[]> = {};
  for (const fen in book) {
    (positions[positionOf(fen)] ??= []).push(fen);
  }
  return positions;
};

/**
 * The opening at a FEN, or `undefined` when this book does not have one.
 * Tries an exact match first, then falls back to the position-only index when
 * one is given — see {@link getPositionBook}.
 */
export const findOpening = (
  book: OpeningBook,
  fen: string,
  positionBook?: PositionBook,
): OpeningEntry | undefined => {
  const exact = book[fen];
  if (exact) return exact;

  const candidates = positionBook?.[positionOf(fen)];
  return candidates && candidates.length > 0 ? book[candidates[0]] : undefined;
};

/** One legal move out of a position, and the opening it leads to (if any). */
export type NextMoveOpening = {
  /** SAN, e.g. `"Nf3"`. */
  san: string;
  /** The position after this move. */
  fen: string;
  opening: OpeningEntry | undefined;
};

/**
 * Every legal move from a position, each paired with the opening it leads to
 * — the explorer-style list the Openings screen shows beside the board.
 *
 * A malformed FEN (nothing on screen ever produces one, but this is a public,
 * pure function) yields no moves rather than throwing.
 */
export const nextMoveOpenings = (
  fen: string,
  book: OpeningBook,
  positionBook?: PositionBook,
): NextMoveOpening[] => {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return [];
  }

  return chess.moves({ verbose: true }).map((move) => ({
    san: move.san,
    fen: move.after,
    opening: findOpening(book, move.after, positionBook),
  }));
};
