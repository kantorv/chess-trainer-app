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
 *
 * The one thing these cannot carry is a **size**: `options.arrows` varies an
 * arrow's colour alone and `arrowOptions` sizes every arrow at once, so the
 * play-chance arrows — whose whole point is that the likelier move is the
 * wider — are drawn by the player itself, over the board
 * (`chanceArrows.ts`, CTA-71).
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
 * The colour of a **required** move's arrow — Backtracking's "this is the move
 * to play here" (CTA-63): the other repertoire moves from this position lead
 * only to lines already covered. Apart from the green/blue pair on purpose,
 * since it is an instruction rather than an option.
 */
export const REQUIRED_MOVE_ARROW_COLOR = "#9c27b0";

/**
 * The arrows for the continuations of the position on screen — the whole
 * external set, since the board never clears `options.arrows` itself
 * (`chessboard.md` §3.4). `nodes[0]` is the mainline and gets
 * {@link NEXT_MOVE_ARROW_COLOR}; the rest are side lines. A hovered
 * continuation takes {@link HOVERED_NEXT_MOVE_ARROW_COLOR} whichever it is.
 *
 * Only a node's `id`, `from` and `to` are read, so a list that is not a
 * tree's — the Library's opening-moves filter (CTA-76) — draws through it too.
 *
 * The one place every board builds its next-move arrows, so a change of
 * colour reaches them all.
 */
export const nextMoveArrowsOf = (
  nodes: readonly Pick<VariationNode, "id" | "from" | "to">[],
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
