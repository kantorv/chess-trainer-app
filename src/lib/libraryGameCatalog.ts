import type { CatalogGame } from "./gameCatalog";
import { gameTag, type Game } from "./gameModel";
import { loadUploadedGames, peekUploadedGames } from "./libraryCollectionStore";
import { parsePgnGame } from "./pgn";
import { findShippedCollection, peekShippedGames } from "./shippedCollections";

/**
 * **A Library game as a `?game=` reference** — `library/<collection>/<number>`
 * (`lib/gameReference.ts`), so a game of a collection opens on the Analysis
 * Board: the Export tab's hand-off on a Library game's board.
 *
 * The collection's games are read lazily (a shipped file's PGN chunk, an
 * upload's IndexedDB record), so the resolver answers from what has been read
 * and the Analysis Board waits for {@link loadLibraryReferenceGames} first —
 * as it waits for the saved analyses' first read.
 */

const referenceParts = (segments: readonly string[]): { id: string; number: number } | undefined => {
  if (segments.length !== 2 || !/^\d+$/.test(segments[1])) return undefined;
  const number = Number(segments[1]);
  return number >= 1 ? { id: segments[0], number } : undefined;
};

/** A collection's games if read: `undefined` not yet, `null` not there. */
const peekGames = (id: string): readonly string[] | null | undefined =>
  findShippedCollection(id) !== undefined ? peekShippedGames(id) : peekUploadedGames(id);

/** The reference's path after its key: `<collection>/<number>`. */
export const libraryReferencePathOf = (collectionId: string, number: number): string =>
  `${collectionId}/${number}`;

/** The game `segments` (`[collection, number]`) name, out of what has been read. */
export const findLibraryGame = (segments: readonly string[]): CatalogGame | undefined => {
  const parts = referenceParts(segments);
  if (parts === undefined) return undefined;
  const pgn = peekGames(parts.id)?.[parts.number - 1];
  if (pgn === undefined) return undefined;
  let game: Game;
  try {
    game = parsePgnGame(pgn);
  } catch {
    return undefined;
  }
  return {
    id: String(parts.number),
    name: `${gameTag(game.headers, "White") ?? "White"} – ${gameTag(game.headers, "Black") ?? "Black"}`,
    pgn,
    game,
  };
};

/** Whether the games `segments` name have been read (or are known not to be there). */
export const libraryReferenceRead = (segments: readonly string[]): boolean => {
  const parts = referenceParts(segments);
  return parts === undefined || peekGames(parts.id) !== undefined;
};

/** Read the games `segments` name. Never rejects. */
export const loadLibraryReferenceGames = async (segments: readonly string[]): Promise<void> => {
  const parts = referenceParts(segments);
  if (parts === undefined) return;
  const shipped = findShippedCollection(parts.id);
  if (shipped !== undefined) await shipped.loadGames().catch(() => null);
  else await loadUploadedGames(parts.id);
};
