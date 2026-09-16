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

/** The colour of every continuation's arrow — a move on offer. */
export const NEXT_MOVE_ARROW_COLOR = "#4caf50";

/**
 * The colour a continuation's arrow takes while its token in the bar is
 * hovered, so the reader sees exactly which move a click will play.
 */
export const HOVERED_NEXT_MOVE_ARROW_COLOR = "#f44336";
