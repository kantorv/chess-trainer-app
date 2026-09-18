import type { Arrow } from "react-chessboard";
import type { VariationNode } from "../../../lib/gameTree";

/**
 * The colours of the arrows the pinned next-moves bar puts on the board
 * (CTA-54) — pure data in a file of its own, beside the components that use
 * it, because a component file must export only components for Vite's fast
 * refresh to work (`moveTokenSx.ts` has the same story).
 *
 * The same green→red pair the Openings screen's book-continuation arrows
 * speak (`lib/openings.ts`), deliberately: both bars are "the moves you can
 * play from here, drawn on the board", so a reader who has learned the
 * language on one screen reads it on the other. Parallel constants rather
 * than shared ones, because the names are each screen's own — a known book
 * move and a tree's continuation are different ideas that happen to want
 * the same colours.
 */

/**
 * The colour of a continuation's arrow — a move on offer. On a board that
 * draws through {@link nextMoveArrowsOf} it is the **mainline's** colour, and
 * the side lines take {@link SIDELINE_NEXT_MOVE_ARROW_COLOR}.
 */
export const NEXT_MOVE_ARROW_COLOR = "#4caf50";

/**
 * The colour of a side line's arrow — every continuation after `children[0]`,
 * so the reader tells the main move from the alternatives at a glance.
 */
export const SIDELINE_NEXT_MOVE_ARROW_COLOR = "#2196f3";

/**
 * The colour a continuation's arrow takes while its token in the bar is
 * hovered, so the reader sees exactly which move a click will play.
 */
export const HOVERED_NEXT_MOVE_ARROW_COLOR = "#f44336";

/**
 * The arrows for the continuations of the position on screen — the whole
 * external set, since the board never clears `options.arrows` itself
 * (`chessboard.md` §3.4). `nodes[0]` is the mainline and gets
 * {@link NEXT_MOVE_ARROW_COLOR}; the rest are side lines. A hovered
 * continuation takes {@link HOVERED_NEXT_MOVE_ARROW_COLOR} whichever it is.
 *
 * The one place the v2 boards build their next-move arrows (CTA-63). The
 * shipped Analysis Board keeps its own copy — the shipped board screens are
 * not touched by v2 work (`chessboard-v2.md` §6).
 */
export const nextMoveArrowsOf = (
  nodes: readonly VariationNode[],
  hoveredId: string | null = null,
): Arrow[] =>
  nodes.map((node, index) => ({
    startSquare: node.from,
    endSquare: node.to,
    color:
      node.id === hoveredId
        ? HOVERED_NEXT_MOVE_ARROW_COLOR
        : index === 0
          ? NEXT_MOVE_ARROW_COLOR
          : SIDELINE_NEXT_MOVE_ARROW_COLOR,
  }));
