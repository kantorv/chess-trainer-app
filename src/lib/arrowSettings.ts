/**
 * **How a board draws its next-move arrows** (CTA-98) — the two choices the
 * Analysis Board's Arrows tab offers and a saved analysis keeps, as ids and
 * their readers. Pure data: what a source *weighs* is `nextMoveWeights.ts`,
 * what a palette's colours *are* is `views/tools/analysis/nextMoveArrows.ts`.
 *
 * - **The width source** — what sizes each continuation's arrow. `none` is
 *   the arrows every board draws (colour only); `eval`, `games` and `prc` are
 *   read off a tag in each move's comment; `lines` needs no tag.
 * - **The palette** — the mainline / side-line / hovered colours.
 */

/** Every width source, in the order the Arrows tab lists them. */
export const ARROW_WIDTH_SOURCES = ["none", "eval", "games", "prc", "lines"] as const;

export type ArrowWidthSource = (typeof ARROW_WIDTH_SOURCES)[number];

export const DEFAULT_ARROW_WIDTH_SOURCE: ArrowWidthSource = "none";

/** Every palette, in the order the Arrows tab lists them. */
export const ARROW_PALETTES = ["classic", "lichess", "colorblind"] as const;

export type ArrowPaletteId = (typeof ARROW_PALETTES)[number];

export const DEFAULT_ARROW_PALETTE: ArrowPaletteId = "classic";

/** A stored width source, or the default for anything else — a record from before it. */
export const arrowWidthSourceFrom = (value: unknown): ArrowWidthSource =>
  (ARROW_WIDTH_SOURCES as readonly unknown[]).includes(value)
    ? (value as ArrowWidthSource)
    : DEFAULT_ARROW_WIDTH_SOURCE;

/** A stored palette, or the default for anything else. */
export const arrowPaletteFrom = (value: unknown): ArrowPaletteId =>
  (ARROW_PALETTES as readonly unknown[]).includes(value)
    ? (value as ArrowPaletteId)
    : DEFAULT_ARROW_PALETTE;
