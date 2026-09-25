import {
  HOVERED_NEXT_MOVE_ARROW_COLOR,
  UNTAGGED_NEXT_MOVE_ARROW_COLOR,
  type NextMoveArrowColors,
} from "../tools/analysis/nextMoveArrows";

/**
 * **The play-chance arrows' geometry** (CTA-71) — pure data in a file of its
 * own, beside the component that renders it, because a component file must
 * export only components for Vite's fast refresh to work
 * (`nextMoveArrows.ts` has the same story).
 *
 * ## Why the player draws these itself
 *
 * The library's `options.arrows` can vary an arrow's **colour** alone, and
 * `arrowOptions` sizes every arrow at once — there is no per-arrow width, so
 * there is no way to draw the likelier move fatter. These arrows put the
 * magnitude in **size** instead, which is exactly what the eye can rank and
 * hue could not: the feature's first cut was a green→yellow gradient and every
 * yellow looked the same; its second was three colour tiers and the grays
 * still could not be told apart at 0.5% and 15%. Lichess's own arrows — white
 * with a magenta border — are the reference a reader already knows, and this
 * is their encoding: **the bigger the probability, the wider and sharper the
 * arrow**. 58% is fat, 35% solid, 4% thin, 0.5% a hairline — and no cut-off is
 * needed anywhere, because the width itself says how unlikely a move is.
 *
 * Every length here is in **square units**: the overlay's `viewBox` is
 * `0 0 8 8`, one unit being one square, so it scales with the responsive
 * board and nothing ever measures a pixel. The square arithmetic is
 * deliberately our own — the vendored `getRelativeCoords`' doc example does
 * not agree with itself, and eight lines are cheaper than a workaround
 * (`lib/treeMap.ts` keeps its own for the same reason).
 */

/** A point in the overlay's own units — square fractions, `0..8`. */
export type ChanceArrowPoint = { x: number; y: number };

/** The border of every play-chance arrow — lichess's own magenta. */
export const CHANCE_ARROW_BORDER_COLOR = "#d500f9";

/** The fill of every play-chance arrow — white, as lichess draws them. */
export const CHANCE_ARROW_FILL_COLOR = "#ffffff";

/** The hairline — a move the trainer almost never plays. Square units. */
export const CHANCE_ARROW_MIN_WIDTH = 0.05;

/** The fat arrow — the certain move. Square units. */
export const CHANCE_ARROW_MAX_WIDTH = 0.28;

const clamp01 = (chance: number) => Math.min(1, Math.max(0, chance));

/**
 * An arrow's width by its move's chance. **Absolute, never normalized to the
 * fork's max**: the same 40% is mid-fat at a two-way fork and thin against a
 * 90%, because the width answers "how likely is this move?", not "how does it
 * rank here?" — and a 0.5% move is a hairline everywhere, which is what
 * dissolves the cut-off question: nothing is too small to draw, only too
 * unlikely to be fat.
 */
export const chanceArrowWidth = (chance: number): number =>
  CHANCE_ARROW_MIN_WIDTH +
  (CHANCE_ARROW_MAX_WIDTH - CHANCE_ARROW_MIN_WIDTH) * clamp01(chance);

/**
 * The centre of a square in the overlay's units. Facing White, files run a–h
 * left to right and ranks 1–8 bottom to top, so x grows with the file and y
 * shrinks with the rank; facing Black mirrors both.
 */
export const squareCenterOf = (
  square: string,
  orientation: "white" | "black",
): ChanceArrowPoint => {
  const file = square.charCodeAt(0) - 97; // "a" = 0
  const rank = Number(square[1]) - 1; // "1" = 0
  return orientation === "white"
    ? { x: file + 0.5, y: 7.5 - rank }
    : { x: 7.5 - file, y: rank + 0.5 };
};

/**
 * One play-chance arrow, ready to draw: a closed seven-point silhouette (tail
 * flank, head-base flank, head flare, tip, and back), the border that outlines
 * it, and its opacity. `points[3]` is always the target square's centre.
 */
export type ChanceArrowSpec = {
  points: readonly ChanceArrowPoint[];
  /**
   * The border's thickness on a side. The path is drawn with `strokeWidth`
   * twice this, so the band straddles the silhouette's edge evenly.
   */
  borderWidth: number;
  borderColor: string;
  opacity: number;
};

/**
 * The geometry of one arrow — `chance` 0–1, `hovered` the next-moves bar's
 * hover. The widths, opacities and head proportions inside are taste; the
 * encoding they serve (wider and sharper the likelier) is the contract, and
 * every clamp keeps even a one-square move an arrow: the tail never starts
 * past 30% of the move, the head never eats more than 45% of it, and a head
 * flares past its shaft or it is not one.
 */
export const chanceArrowSpec = (
  from: string,
  to: string,
  orientation: "white" | "black",
  chance: number,
  hovered = false,
): ChanceArrowSpec => {
  const a = squareCenterOf(from, orientation);
  const b = squareCenterOf(to, orientation);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  // A move never starts where it ends; the guard is only for a square that is
  // not one, so the unit vectors below are never NaN.
  const length = Math.hypot(dx, dy) || 1;
  const along = { x: dx / length, y: dy / length };
  const across = { x: -along.y, y: along.x };

  const c = clamp01(chance);
  const half = chanceArrowWidth(c) / 2;
  // The border grows with the chance too — "the wider and sharper the border".
  const borderWidth = 0.01 + 0.02 * c;
  const tailOffset = Math.min(0.35, length * 0.3);
  const headLength = Math.min(0.13 + 0.22 * c, length * 0.45);
  const headHalf = half * 1.55 + 0.012;

  const tail = { x: a.x + along.x * tailOffset, y: a.y + along.y * tailOffset };
  const headBase = { x: b.x - along.x * headLength, y: b.y - along.y * headLength };
  const at = (center: ChanceArrowPoint, side: number): ChanceArrowPoint => ({
    x: center.x + across.x * side,
    y: center.y + across.y * side,
  });

  return {
    points: [
      at(tail, -half),
      at(headBase, -half),
      at(headBase, -headHalf),
      b,
      at(headBase, headHalf),
      at(headBase, half),
      at(tail, half),
    ],
    borderWidth,
    borderColor: hovered
      ? HOVERED_NEXT_MOVE_ARROW_COLOR
      : CHANCE_ARROW_BORDER_COLOR,
    // The sharper the likelier: the certain arrow is opaque, a rare one fades.
    // A hovered one is the move a click is about to play — full sharpness.
    opacity: hovered ? 1 : 0.6 + 0.4 * c,
  };
};

/**
 * One arrow's own colours, in place of the white fill and magenta border
 * (CTA-98) — and its opacity, in place of the spec's, when given.
 */
export type ChanceArrowColors = { fill: string; border: string; opacity?: number };

/**
 * The width an **untagged** continuation is drawn at, as a chance — a fixed,
 * modest width beside the moves its branch sizes by their tag (CTA-98).
 */
export const UNTAGGED_ARROW_CHANCE = 0.3;

/**
 * The colours of a width-sized next-move arrow (CTA-98, the Analysis Board's
 * width sources): the palette's mainline or side-line colour, fill and
 * border, the sharper the wider (the spec's opacity); a move with no tag
 * (`weight` `null`) gray and half-transparent; the hovered one the palette's
 * hover colour, fully opaque, whichever it is.
 */
export const weightedArrowColors = (
  weight: number | null,
  index: number,
  hovered: boolean,
  palette: NextMoveArrowColors,
): ChanceArrowColors => {
  if (hovered) return { fill: palette.hovered, border: palette.hovered, opacity: 1 };
  if (weight === null) return { fill: UNTAGGED_NEXT_MOVE_ARROW_COLOR, border: "none", opacity: 1 };
  const color = index === 0 ? palette.mainline : palette.sideline;
  return { fill: color, border: color };
};

/** The silhouette as one closed SVG path, its numbers rounded to keep it short. */
export const chanceArrowPath = (
  points: readonly ChanceArrowPoint[],
): string =>
  `${points
    .map(
      ({ x, y }, index) =>
        `${index === 0 ? "M" : "L"}${Math.round(x * 1000) / 1000},${Math.round(y * 1000) / 1000}`,
    )
    .join(" ")} Z`;
