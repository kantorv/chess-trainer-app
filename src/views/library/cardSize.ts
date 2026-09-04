/**
 * How big a library card is — the two settings behind the list screen's
 * card-size toggle, and the grid track each one produces.
 *
 * Its own module rather than a pair of constants in `LibraryList.tsx` because
 * the tests assert the grid template against these numbers, and a component
 * file that also exports values loses fast refresh
 * (`react-refresh/only-export-components`).
 */

/**
 * The grid's track *minimum*, per setting: the width a card is never allowed to
 * shrink below, which is the whole of what the toggle does. `compact` is the
 * width the screen shipped with, so the default leaves a reader exactly what
 * they already had and the toggle is purely something offered.
 */
export const CARD_MIN_PX = { compact: 160, comfortable: 260 } as const;

/** Which of the two the reader has picked. */
export type CardSize = keyof typeof CARD_MIN_PX;

/** The setting a list screen opens on. */
export const DEFAULT_CARD_SIZE: CardSize = "compact";

/**
 * That setting as a `grid-template-columns` value.
 *
 * `min(…, 100%)` rather than the bare pixel value: a track wider than the board
 * square would overflow it sideways, and a board screen must never give the
 * page a horizontal scrollbar. In any square wider than one card — every real
 * one — it is the pixel value, so the "never shrinks below" rule holds where it
 * can be held.
 */
export const cardSizeTrack = (size: CardSize): string =>
  `repeat(auto-fill, minmax(min(${CARD_MIN_PX[size]}px, 100%), 1fr))`;
