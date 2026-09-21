import type { Game } from "./gameModel";

/**
 * **A store's games, as something a `?game=` reference can name** — the
 * shape `lib/gameReference.ts` resolves against. Two producers present
 * themselves as one: the reader's saved analyses (`analysis/saved/<id>`) and
 * their games against the engine (`play/games/<id>`).
 *
 * A catalog is one `path` (the segment after the reference's key) and its
 * games. A game carries its own PGN text — what the Analysis Board re-reads
 * with `parsePgnTree` for the side lines — and that text's mainline, parsed
 * once when the catalog is built (a record that will not parse is left out,
 * so a reference to it resolves to nothing), which is what `initialPlyOf`
 * reads a `StartPly` off.
 */
export type CatalogGame = {
  id: string;
  /** English, never rendered — the store's own screen writes its rows. */
  name: string;
  /** The game as stored, side lines and all. */
  pgn: string;
  /** Its mainline. */
  game: Game;
};

export type GameCatalog = {
  path: string;
  games: readonly CatalogGame[];
};

/**
 * The game `segments` name in `catalog` — `[path, id]` — or `undefined`: a
 * wrong path, an id the store does not have, anything longer.
 */
export const findCatalogGame = (
  segments: readonly string[],
  catalog: GameCatalog,
): CatalogGame | undefined => {
  if (segments.length !== 2 || segments[0] !== catalog.path) return undefined;
  return catalog.games.find((entry) => entry.id === segments[1]);
};
