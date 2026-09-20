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
 * The colour of a **required** move's arrow — Backtracking's "this is the move
 * to play here" (CTA-63): the other repertoire moves from this position lead
 * only to lines already covered. Apart from the green/blue pair on purpose,
 * since it is an instruction rather than an option.
 */
export const REQUIRED_MOVE_ARROW_COLOR = "#9c27b0";

/**
 * The **rare** end of the play-chance gradient (CTA-71): the colour of a move
 * the trainer almost never plays. The common end is
 * {@link NEXT_MOVE_ARROW_COLOR} itself, so the gradient runs yellow→green and
 * the "the move to play" colour stays the one a reader already knows.
 */
export const RARE_NEXT_MOVE_ARROW_COLOR = "#ffeb3b";

/** `#rrggbb` apart into its three channels — the gradient's one parser. */
const channelsOf = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/**
 * A move's colour on the play-chance gradient (CTA-71): green at `1`, a move
 * the trainer almost always plays; yellow ({@link RARE_NEXT_MOVE_ARROW_COLOR})
 * at `0`. A straight interpolation per channel between the two ends — a
 * chance is a share of a whole, so the halfway colour is the halfway chance,
 * not some other curve's. `chance` outside 0–1 is clamped rather than trusted.
 */
export const chanceArrowColor = (chance: number): string => {
  const at = Math.min(1, Math.max(0, chance));
  const [r1, g1, b1] = channelsOf(RARE_NEXT_MOVE_ARROW_COLOR);
  const [r2, g2, b2] = channelsOf(NEXT_MOVE_ARROW_COLOR);
  const channel = (from: number, to: number) =>
    Math.round(from + (to - from) * at)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r1, r2)}${channel(g1, g2)}${channel(b1, b2)}`;
};

/**
 * The arrows for the continuations of the position on screen — the whole
 * external set, since the board never clears `options.arrows` itself
 * (`chessboard.md` §3.4). `nodes[0]` is the mainline and gets
 * {@link NEXT_MOVE_ARROW_COLOR}; the rest are side lines. A hovered
 * continuation takes {@link HOVERED_NEXT_MOVE_ARROW_COLOR} whichever it is.
 *
 * The third argument is the **opt-in play-chance gradient** (CTA-71): each
 * continuation's chance, 0–1, in `nodes` order — pass it only where a branch
 * carries an explicit `prc` mark, and every arrow takes
 * {@link chanceArrowColor} of its move's chance. Without the argument, or
 * where an entry is `undefined`, the green/blue pair stands — so every
 * existing caller keeps today's colours until it asks for the gradient.
 *
 * The one place the v2 boards build their next-move arrows (CTA-63). The
 * shipped Analysis Board keeps its own copy — the shipped board screens are
 * not touched by v2 work (`chessboard-v2.md` §6).
 */
export const nextMoveArrowsOf = (
  nodes: readonly VariationNode[],
  hoveredId: string | null = null,
  chances?: readonly number[],
): Arrow[] =>
  nodes.map((node, index) => ({
    startSquare: node.from,
    endSquare: node.to,
    color:
      node.id === hoveredId
        ? HOVERED_NEXT_MOVE_ARROW_COLOR
        : chances?.[index] !== undefined
          ? chanceArrowColor(chances[index])
          : index === 0
            ? NEXT_MOVE_ARROW_COLOR
            : SIDELINE_NEXT_MOVE_ARROW_COLOR,
  }));
