import { loadLibraryCatalog, type LibraryCatalog } from "./libraryCatalog";
import rawCatalog from "../data/positions.json";

/**
 * The endgame Positions library — the second binding over the shared library
 * layer in [`libraryCatalog.ts`](./libraryCatalog.ts), and the one the layer
 * was generalised for.
 *
 * **Adding a category, at any depth, is an entry in
 * [`src/data/positions.json`](../data/positions.json) and nothing else.** No
 * TypeScript, no locale key, no component edit, no route: the sidebar subtree
 * is generated from this catalog (`views/main/navFromLibrary.ts`) and
 * `/positions/*` is one splat route resolved through it, so a new category
 * appears in the sidebar and at its own URL the moment the JSON has it. Adding
 * a position is the same single edit.
 *
 * Category names live in the data as `{ en, he }` rather than in `src/locales`.
 * That is the whole difference from Mates, whose category labels shipped as
 * catalog keys before the library layer existed and are kept as `labelKey`s:
 * `he` is typed `typeof en`, so a locale key is a two-file edit and a compile
 * error until both are done — right for chrome the app ships, wrong for content
 * it lists.
 *
 * Unlike the mates catalog, **the side to move here is whichever side the
 * theory needs.** Philidor's rook defense, Vancura, the short-side defense and
 * the trebuchet are defensive or mutual-zugzwang positions in which the
 * defender is to move; the board simply faces that side, which is also what
 * `/engine/play` does with the same FEN a click later.
 */

/** The shipped catalog, loaded once. */
export const positionsCatalog: LibraryCatalog = loadLibraryCatalog(rawCatalog);
