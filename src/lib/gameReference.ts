import {
  resolveLibraryPath,
  type LibraryCatalog,
  type LibraryGame,
} from "./libraryCatalog";
import { userPgnsLibrary } from "./pgnCatalog";

/**
 * How a **whole game** crosses between screens: `?game=pgn/<category path>/<id>`.
 *
 * The Board Editor's hand-off carries a position, and a FEN is short enough to
 * put in a URL. A game is not: a chess.com export runs to a couple of kilobytes
 * and a study chapter carries its comments with it, so what travels is a
 * *reference into the catalog* — the section key, the category path and the item
 * id — and the destination looks the game up for itself.
 *
 * Everything the `?fen=` hand-off is good for, this keeps:
 *
 * - it is a **query parameter**, so the link survives being bookmarked, shared
 *   and reloaded, where router state would not;
 * - the destination **validates** it (an unknown reference resolves to
 *   `undefined` and is ignored, exactly as an unparsable FEN is) and takes the
 *   result as *initial* state, because arriving at the URL mounts the screen;
 * - it is **additive**. `?fen=` is untouched and still works from a game's
 *   detail page, which hands over the position at the ply on screen.
 *
 * A reference names a *game*, so it resolves only against a section that has
 * some. There is one — User PGNs — and the registry below is the single place
 * that mapping lives; a second such section is one more entry in it.
 */

/** The section key the User PGNs library's references carry. */
export const PGN_REFERENCE_KEY = "pgn";

/**
 * Which catalog a reference's first segment names. Read at call time rather
 * than passed in, so a destination screen needs no more than the string out of
 * the URL — and *called* rather than held, because the User PGNs library grows
 * a folder when the reader uploads a file, and a game they just uploaded has to
 * be as referenceable as one that shipped.
 */
const catalogsByKey: Record<string, () => LibraryCatalog> = {
  [PGN_REFERENCE_KEY]: userPgnsLibrary,
};

/** The reference for one game — what a detail page puts in the link. */
export const gameReferenceOf = (
  sectionKey: string,
  item: LibraryGame,
): string => `${sectionKey}/${item.category}/${item.id}`;

/**
 * The game a reference names, or `undefined` for anything that does not resolve
 * — an unknown section, a category the data no longer has, an id that is a
 * position rather than a game.
 *
 * The category path is not split by counting segments: the leftover is handed to
 * `resolveLibraryPath`, the same longest-prefix match the splat route uses, so a
 * reference into a library nested three deep needs no more work here than a flat
 * one.
 */
export const resolveGameReference = (
  reference: string | null | undefined,
): LibraryGame | undefined => {
  if (reference === null || reference === undefined) return undefined;

  const [sectionKey, ...rest] = reference.split("/").filter(Boolean);
  if (sectionKey === undefined || rest.length === 0) return undefined;

  const catalogOf = catalogsByKey[sectionKey];
  if (catalogOf === undefined) return undefined;

  const location = resolveLibraryPath(rest, catalogOf());
  return location.kind === "item" && location.item.kind === "game"
    ? location.item
    : undefined;
};
