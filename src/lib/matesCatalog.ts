import {
  findLibraryCategory,
  findLibraryPosition,
  loadLibraryCatalog,
  positionsInLibraryCategory,
  type LibraryCatalog,
  type LibraryCategory,
  type LibraryCategoryId,
  type LibraryPosition,
} from "./libraryCatalog";
import rawCatalog from "../data/mates.json";

/**
 * The mates library — a **binding** over the shared library layer in
 * [`libraryCatalog.ts`](./libraryCatalog.ts), not a catalog of its own.
 *
 * `src/data/mates.json` is still the only file an extension touches, and it did
 * not change when the Positions section arrived: a flat list of categories is
 * the shared shape with every path a single segment, so `"category": "basic"`
 * goes on meaning what it meant. What this module adds is the section's own
 * vocabulary — `findMateCategory`, `positionsInCategory`, `findMatePosition` —
 * so the two Mates screens and their tests read the catalog in the terms of
 * their section and nothing has to pass a catalog around by hand.
 *
 * The rules the shape rests on — a category id is data rather than a type, a
 * malformed entry is reported rather than thrown, and names live in the data
 * while chrome lives in `src/locales` — are documented once, in the shared
 * module. **One rule is this section's alone**: the mating side is to move in
 * every shipped mate, asserted in `matesCatalog.test.ts` because `/engine/play`
 * derives `playAs` and the board orientation from the FEN it is handed. It is
 * deliberately not in the shared layer, where a defensive endgame position with
 * the defender to move is ordinary and correct.
 */

/** A category id — `"basic"`, `"advanced"`, `"complex"`, and whatever is next. */
export type MateCategoryId = LibraryCategoryId;
export type MateCategory = LibraryCategory;
export type MatePosition = LibraryPosition;
export type MatesCatalog = LibraryCatalog;

export type { LocalizedText } from "./libraryCatalog";
export { localizedText, sideToMoveOf } from "./libraryCatalog";

/** Validate raw JSON into a mates catalog. Never throws; see the shared module. */
export const loadMatesCatalog = loadLibraryCatalog;

/** The shipped catalog, loaded once. */
export const matesCatalog: MatesCatalog = loadMatesCatalog(rawCatalog);

/** The category with this id, or `undefined` — an unknown id from a URL. */
export const findMateCategory = (
  id: string | undefined,
  catalog: MatesCatalog = matesCatalog,
): MateCategory | undefined => findLibraryCategory(id, catalog);

/** That category's positions, in the order the data lists them. */
export const positionsInCategory = (
  category: string | undefined,
  catalog: MatesCatalog = matesCatalog,
): readonly MatePosition[] => positionsInLibraryCategory(category, catalog);

/**
 * One position, addressed the way the URL addresses it. Both parts have to
 * match: `/mates/basic/queen-vs-rook` names a position that exists, in a
 * category it is not in, and that is a miss rather than a redirect.
 */
export const findMatePosition = (
  category: string | undefined,
  id: string | undefined,
  catalog: MatesCatalog = matesCatalog,
): MatePosition | undefined => findLibraryPosition(category, id, catalog);
