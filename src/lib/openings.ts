import { Chess, type Square } from "chess.js";

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

/**
 * The opening's top-level name: the part of eco.json's
 * `"Opening: Variation, SubVariation"` convention before its first `":"` — the
 * family, which is what the save dialog's default rule files a position under.
 * A name with no `":"` is its own top level, and one that trims to nothing
 * stays empty for the caller's normaliser to refuse.
 */
export const topLevelOpeningName = (name: string): string =>
  name.split(":")[0].trim();

/**
 * The opening's variation name: the part of eco.json's
 * `"Opening: Variation, SubVariation"` convention after its first `":"`, or
 * `""` for a name without one — the piece a saved opening's default note
 * names, with the top level as the fallback when there is no variation.
 */
export const openingVariationName = (name: string): string => {
  const index = name.indexOf(":");
  return index === -1 ? "" : name.slice(index + 1).trim();
};

/**
 * The opening a whole **line of play** ended up in: the deepest position along
 * it that the book names, or `undefined` for a line it never recognised.
 *
 * The same rule `stickyOpening` applies as a reader steps through a game, but
 * answered in one call for a game nobody is stepping through — a saved game on
 * a card, where there is no "position on screen" to be sticky about. Walking
 * *backwards* is what makes it the deepest rather than the first: every game
 * that starts 1. e4 passes through "King's Pawn Game", and naming it that would
 * tell the reader nothing about which of their games this is.
 *
 * `fens` is the positions in order, as `GameMove.fen` already records them, so
 * nothing here re-simulates a game and this module still knows nothing about
 * the game model.
 */
export const openingOfLine = (
  book: OpeningBook,
  positionBook: PositionBook,
  fens: readonly string[],
): OpeningEntry | undefined => {
  for (let index = fens.length - 1; index >= 0; index -= 1) {
    const found = findOpening(book, fens[index], positionBook);
    if (found !== undefined) return found;
  }
  return undefined;
};

/** One legal move out of a position, and the opening it leads to (if any). */
export type NextMoveOpening = {
  /** SAN, e.g. `"Nf3"`. */
  san: string;
  /** The squares it runs between — what a board arrow for it needs. */
  from: Square;
  to: Square;
  /** The position after this move. */
  fen: string;
  opening: OpeningEntry | undefined;
};

/** A {@link NextMoveOpening} that is known to resolve to an opening. */
export type KnownMoveOpening = NextMoveOpening & { opening: OpeningEntry };

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
    from: move.from,
    to: move.to,
    fen: move.after,
    opening: findOpening(book, move.after, positionBook),
  }));
};

/**
 * The known half of {@link nextMoveOpenings}: only the moves that resolve to an
 * opening in this book. That is what the Openings screen's explorer lists and
 * what its board arrows are drawn for — a move eco.json has no name for is
 * still legal and still playable, but it is not a *book* continuation, so it
 * has no place in either.
 */
export const knownMoveOpenings = (
  fen: string,
  book: OpeningBook,
  positionBook?: PositionBook,
): KnownMoveOpening[] =>
  nextMoveOpenings(fen, book, positionBook).filter(
    (move): move is KnownMoveOpening => move.opening !== undefined,
  );

/**
 * The colour of a known-next-move arrow — green, where the last-move arrow is
 * `MOVE_ARROW_COLOR`'s amber, so the two read as *what can follow* versus *what
 * was played* when both are on the board.
 */
export const KNOWN_MOVE_ARROW_COLOR = "#4caf50";

/**
 * The colour a known-next-move arrow takes while its list row is hovered — a
 * third distinct hue, neither the amber last-move arrow nor the green of the
 * other known moves, so the reader sees exactly which move a click will play.
 */
export const HOVERED_MOVE_ARROW_COLOR = "#f44336";

/**
 * The most recent opening a stream of positions resolved to, and the half-move
 * count of the position it was found at — the memory {@link stickyOpening}
 * carries between one FEN and the next.
 */
export type LastKnownOpening = {
  /** Half-moves played to reach the position this opening was found at. */
  ply: number;
  opening: OpeningEntry;
};

/**
 * Half-moves played to reach a FEN, from its own counters: `(fullmove - 1) * 2`
 * plus one when Black is to move. A FEN whose counters will not read is 0, the
 * start of the game — which is also the answer a real move-1 FEN gives.
 */
const plyOfFen = (fen: string): number => {
  const parts = fen.split(/\s+/);
  const fullmove = Number.parseInt(parts[5] ?? "", 10);
  if (!Number.isFinite(fullmove) || fullmove < 1) return 0;
  return (fullmove - 1) * 2 + (parts[1] === "b" ? 1 : 0);
};

/**
 * The opening to show for a position, with memory: the position's own opening
 * when the book has one, otherwise the last one it had — the sticky rule that
 * keeps the "current opening" label from going blank the moment a game steps
 * off the book, which is where most interesting positions live.
 *
 * `previous` is the last value this function returned (`null` at first), and
 * the return is the whole of what a caller shows *and* carries forward: a
 * direct hit replaces the memory, an off-book position at or past it keeps it,
 * and a position *before* it — stepping back to the start, a reset, a fresh
 * game — clears it, because a name earned later in the game was never this
 * position's. Whenever nothing changed — the same hit again, or a position the
 * memory still covers — the return **is** `previous`, by reference, so a caller
 * adjusting state during render settles instead of looping.
 */
export const stickyOpening = (
  book: OpeningBook,
  positionBook: PositionBook | undefined,
  fen: string,
  previous: LastKnownOpening | null,
): LastKnownOpening | null => {
  const opening = findOpening(book, fen, positionBook);
  const ply = plyOfFen(fen);
  if (opening !== undefined) {
    // A hit the memory already holds comes back *as* the memory — same object,
    // no change — so a caller adjusting state during render settles immediately.
    if (previous !== null && previous.ply === ply && previous.opening === opening) {
      return previous;
    }
    return { ply, opening };
  }
  if (previous !== null && ply >= previous.ply) return previous;
  return null;
};
