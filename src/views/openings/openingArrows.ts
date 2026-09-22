import type { Arrow } from "react-chessboard";

import {
  HOVERED_MOVE_ARROW_COLOR,
  KNOWN_MOVE_ARROW_COLOR,
  type KnownMoveOpening,
} from "../../lib/openings";

/**
 * **The Openings explorer's arrows** (CTA-78) — two sets on one board: the
 * tree's continuations (the variations explorer's, `nextMoveArrowsOf` — the
 * mainline green, side lines blue) and the **book's** (`useOpeningBookModule`
 * — every continuation eco.json names, green). `options.arrows` is the whole
 * external set (`chessboard.md` §3.4), so they are joined here, once:
 *
 * - the tree's arrows first, as the explorer made them;
 * - a book move the tree already has is **not drawn twice** — its tree arrow
 *   stands for it;
 * - every other book move in the book's green;
 * - the book row under the pointer recolours its move's arrow, whichever set
 *   drew it, so the reader sees what a click will play.
 *
 * Pure data in a file of its own, beside the screen, for Vite's fast refresh
 * (a component file exports only components).
 */
export const openingArrowsOf = (
  treeArrows: readonly Arrow[],
  book: readonly Pick<KnownMoveOpening, "san" | "from" | "to">[],
  hoveredSan: string | null,
): Arrow[] => {
  const key = (from: string, to: string) => `${from}-${to}`;
  const hoveredKey = (() => {
    const hovered = book.find((move) => move.san === hoveredSan);
    return hovered === undefined ? null : key(hovered.from, hovered.to);
  })();
  const recoloured = (arrow: Arrow): Arrow =>
    key(arrow.startSquare, arrow.endSquare) === hoveredKey
      ? { ...arrow, color: HOVERED_MOVE_ARROW_COLOR }
      : arrow;

  const arrows = treeArrows.map(recoloured);
  const drawn = new Set(arrows.map((arrow) => key(arrow.startSquare, arrow.endSquare)));
  for (const move of book) {
    if (drawn.has(key(move.from, move.to))) continue;
    drawn.add(key(move.from, move.to));
    arrows.push(
      recoloured({ startSquare: move.from, endSquare: move.to, color: KNOWN_MOVE_ARROW_COLOR }),
    );
  }
  return arrows;
};
