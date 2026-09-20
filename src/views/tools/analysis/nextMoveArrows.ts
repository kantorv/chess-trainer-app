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
 * The colour of a move the trainer **almost never** plays (CTA-71) — the
 * bottom of the three play-chance tiers. Gray, twice over: red is taken — it
 * is the hovered colour above — and red would read as forbidden, which is
 * false; the trainer does play this move, just rarely. Gray reads as inert.
 */
export const RARE_NEXT_MOVE_ARROW_COLOR = "#757575";

/**
 * The colour of a move the trainer plays **sometimes** — a real alternative,
 * one the reader will meet in a session. Amber rather than the pure yellow
 * this replaced: the light squares are cream (`#f0d9b5`), and a pure yellow
 * washes out on them.
 */
export const SOMETIMES_NEXT_MOVE_ARROW_COLOR = "#ffa000";

/**
 * The lowest chance that still counts as "a move the reader will really
 * meet" (CTA-71): at it and above a move is amber, under it gray. A taste
 * dial — one constant, and the tier line moves with it.
 */
export const SOMETIMES_MOVE_MIN_CHANCE = 0.15;

/**
 * The colour of each move's arrow by its play chance (CTA-71) — three named
 * tiers, in `chances` order: **green** ({@link NEXT_MOVE_ARROW_COLOR}) for
 * the move the trainer plays most, **amber**
 * ({@link SOMETIMES_NEXT_MOVE_ARROW_COLOR}) for a real alternative, **gray**
 * ({@link RARE_NEXT_MOVE_ARROW_COLOR}) for one it almost never plays. An
 * `undefined` entry stays `undefined`, so a move with no chance to read
 * keeps its structural colour.
 *
 * Deliberately tiers rather than a gradient, and deliberately rank-based.
 * The question at a fork is categorical — *which* move gets played — and the
 * eye cannot rank the near-identical yellows a green→yellow ramp puts at its
 * low end (the reader's own verdict on the first cut of this feature). So
 * the most likely move is green even at a 60% fork, where a value-scaled
 * colour would be an undecided olive; and a tie gives both moves green,
 * which is the true answer — either of these gets played. The three tiers
 * differ in lightness as much as hue — amber light, green mid, gray dark —
 * so they stay readable in grayscale and under the red-green colour
 * blindness a reader in eight has.
 */
export const chanceArrowColors = (
  chances: readonly (number | undefined)[],
): (string | undefined)[] => {
  const highest = Math.max(
    ...chances.filter((chance): chance is number => chance !== undefined),
  );
  return chances.map((chance) => {
    if (chance === undefined) return undefined;
    if (chance >= highest) return NEXT_MOVE_ARROW_COLOR;
    return chance >= SOMETIMES_MOVE_MIN_CHANCE
      ? SOMETIMES_NEXT_MOVE_ARROW_COLOR
      : RARE_NEXT_MOVE_ARROW_COLOR;
  });
};

/**
 * The arrows for the continuations of the position on screen — the whole
 * external set, since the board never clears `options.arrows` itself
 * (`chessboard.md` §3.4). `nodes[0]` is the mainline and gets
 * {@link NEXT_MOVE_ARROW_COLOR}; the rest are side lines. A hovered
 * continuation takes {@link HOVERED_NEXT_MOVE_ARROW_COLOR} whichever it is.
 *
 * The third argument is the **opt-in play-chance tiers** (CTA-71): each
 * continuation's chance, 0–1, in `nodes` order — pass it only where a branch
 * carries an explicit `prc` mark, and every arrow takes the tier of its
 * move's chance ({@link chanceArrowColors}). Without the argument, or where
 * an entry is `undefined`, the green/blue pair stands — so every existing
 * caller keeps today's colours until it asks for the tiers.
 *
 * The one place the v2 boards build their next-move arrows (CTA-63). The
 * shipped Analysis Board keeps its own copy — the shipped board screens are
 * not touched by v2 work (`chessboard-v2.md` §6).
 */
export const nextMoveArrowsOf = (
  nodes: readonly VariationNode[],
  hoveredId: string | null = null,
  chances?: readonly (number | undefined)[],
): Arrow[] => {
  const colors =
    chances === undefined ? undefined : chanceArrowColors(chances);
  return nodes.map((node, index) => ({
    startSquare: node.from,
    endSquare: node.to,
    color:
      node.id === hoveredId
        ? HOVERED_NEXT_MOVE_ARROW_COLOR
        : colors?.[index] ??
          (index === 0
            ? NEXT_MOVE_ARROW_COLOR
            : SIDELINE_NEXT_MOVE_ARROW_COLOR),
  }));
};
