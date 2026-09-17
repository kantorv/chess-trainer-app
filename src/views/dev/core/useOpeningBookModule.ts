import { useEffect, useMemo, useState } from "react";
import type { Arrow } from "react-chessboard";
import {
  HOVERED_MOVE_ARROW_COLOR,
  KNOWN_MOVE_ARROW_COLOR,
  findOpening,
  getPositionBook,
  knownMoveOpenings,
  loadOpeningBook,
  type KnownMoveOpening,
  type OpeningBook,
  type OpeningEntry,
  type PositionBook,
} from "../../../lib/openings";

/**
 * **The opening-book capability** — §2.2 of
 * [`.claude/rules/chessboard-v2.md`](../../../../.claude/rules/chessboard-v2.md).
 *
 * The eco.json lookup for the position on screen, its known continuations, and
 * their arrows. A board composes this when it lists book continuations;
 * Openings v2 is the one that does.
 *
 * Two things worth knowing:
 *
 * - **Disabled, it loads nothing.** The book is ~3MB across five shards, and a
 *   board that does not list continuations must not pull it in. (The *name* of
 *   the position is a different job, and the shared `CurrentOpening` does it
 *   with its own cached load — so a board that only wants the name does not
 *   need this module at all.)
 * - **The arrows are the whole external set.** Arrows passed through
 *   `options.arrows` are controlled: the board never clears or adds to them
 *   itself (`.claude/rules/chessboard.md` §3.4), so this recomputes the
 *   complete set on every position and every hover.
 */

export type OpeningBookModule = {
  /** The known continuations from the position on screen. Empty while loading. */
  nextMoves: readonly KnownMoveOpening[];
  /** One arrow per continuation — the hovered one recoloured. The whole set. */
  arrows: Arrow[];
  /** The continuation the pointer is over, or `null`. */
  hoveredMove: KnownMoveOpening | null;
  setHoveredMove: (move: KnownMoveOpening | null) => void;
  /** What the book calls the position on screen, if it knows it. */
  opening: OpeningEntry | undefined;
  /** The loaded book, or `null` while it is still loading / disabled. */
  book: OpeningBook | null;
  positionBook: PositionBook | undefined;
};

export const useOpeningBookModule = ({
  enabled,
  fen,
}: {
  enabled: boolean;
  fen: string;
}): OpeningBookModule => {
  const [book, setBook] = useState<OpeningBook | null>(null);
  const [positionBook, setPositionBook] = useState<PositionBook | undefined>(
    undefined,
  );
  const [hoveredMove, setHoveredMove] = useState<KnownMoveOpening | null>(null);

  // Loaded once per mount while enabled; `loadOpeningBook` caches the promise
  // across mounts, so a second visit resolves immediately rather than
  // re-fetching.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loadOpeningBook().then((loaded) => {
      if (cancelled) return;
      setBook(loaded);
      setPositionBook(getPositionBook(loaded));
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  /*
    Only the moves that resolve to an opening. Off-book moves stay playable —
    drag one and the tree keeps it; they simply are not book continuations, so
    the explorer does not list them.
  */
  const nextMoves = useMemo(
    () => (book === null ? [] : knownMoveOpenings(fen, book, positionBook)),
    [book, fen, positionBook],
  );

  const arrows: Arrow[] = useMemo(
    () =>
      nextMoves.map((move) => ({
        startSquare: move.from,
        endSquare: move.to,
        color:
          hoveredMove && hoveredMove.san === move.san
            ? HOVERED_MOVE_ARROW_COLOR
            : KNOWN_MOVE_ARROW_COLOR,
      })),
    [nextMoves, hoveredMove],
  );

  const opening = useMemo(
    () => (book === null ? undefined : findOpening(book, fen, positionBook)),
    [book, fen, positionBook],
  );

  return {
    nextMoves,
    arrows,
    hoveredMove,
    setHoveredMove,
    opening,
    book,
    positionBook,
  };
};
