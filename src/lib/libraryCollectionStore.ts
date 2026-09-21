import type { LibraryCollection } from "./libraryCollections";
import { MAX_UPLOAD_CHARS } from "./pgnText";
import { recordStore } from "./recordStore";
import { newSavedGameId } from "./savedGames";

/**
 * **The reader's own Library collections** (CTA-75) — one `localStorage` key
 * holding a JSON array of them, newest first, over the shared
 * [`recordStore.ts`](./recordStore.ts) machinery (the non-throwing read, the
 * revision-stamped snapshot, the `storage`-event subscription).
 *
 * ### Why `localStorage`, and what it costs
 *
 * Every other store the app has is `localStorage` read synchronously through
 * `useSyncExternalStore`, and a collection's screens want the same: a table
 * and a board that render on the first frame, a write that is done when it
 * returns. IndexedDB would lift the ceiling but make every read a promise, for
 * a store whose largest realistic entry — a tournament export — is well under
 * it. The ceiling is the origin's few megabytes (about five million UTF-16
 * characters in the browsers this targets), shared with every other store, so:
 *
 * - one text is refused past `MAX_UPLOAD_CHARS` (3,000,000) — the 674-game
 *   World Cup 2023 file is ~640,000, so a collection that size fits four times
 *   over on its own but not beside much else;
 * - a write the quota refuses is reported (`"storage"`), never thrown, and
 *   leaves the stored list as it was.
 *
 * A collection is kept as **one PGN chunk per game**, so Update rewrites one
 * element of `games` and Save as copy inserts one — the text of every other
 * game is written back exactly as it stood.
 */

/** The `localStorage` key. Versioned, so a future shape change is a new key. */
export const LIBRARY_COLLECTIONS_STORAGE_KEY = "chessapp.libraryCollections.v1";

/** What went wrong with a write. */
export type LibraryCollectionProblem = "storage" | "too-large" | "missing";

type StoredCollection = {
  id: string;
  name: string;
  addedAt: string;
  games: string[];
};

const storedCollectionFrom = (value: unknown): StoredCollection | undefined => {
  if (typeof value !== "object" || value === null) return undefined;
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    row.id === "" ||
    typeof row.name !== "string" ||
    typeof row.addedAt !== "string" ||
    !Array.isArray(row.games) ||
    !row.games.every((game) => typeof game === "string")
  ) {
    return undefined;
  }
  return { id: row.id, name: row.name, addedAt: row.addedAt, games: row.games as string[] };
};

const store = recordStore<StoredCollection>(
  LIBRARY_COLLECTIONS_STORAGE_KEY,
  storedCollectionFrom,
);

const asCollection = (row: StoredCollection): LibraryCollection => ({
  id: row.id,
  name: row.name,
  source: "uploaded",
  games: row.games,
  addedAt: row.addedAt,
});

/*
  The snapshot as `LibraryCollection`s, memoised on the stored rows' identity
  — `useSyncExternalStore` wants the same value back while nothing changed.
*/
let live: { rows: readonly StoredCollection[]; collections: readonly LibraryCollection[] } | undefined;

/** The uploaded collections, newest first. Stable between changes. */
export const uploadedCollectionsSnapshot = (): readonly LibraryCollection[] => {
  const rows = store.snapshot();
  if (live === undefined || live.rows !== rows) {
    live = { rows, collections: rows.map(asCollection) };
  }
  return live.collections;
};

/** Subscribe to changes — this tab's writes, and other tabs' through `storage`. */
export const subscribeUploadedCollections = store.subscribe;

/** One uploaded collection, or `undefined`. */
export const findUploadedCollection = (
  id: string | null | undefined,
): LibraryCollection | undefined =>
  id === null || id === undefined
    ? undefined
    : uploadedCollectionsSnapshot().find((collection) => collection.id === id);

/** A fresh id — `u` and the saved games' minter, so it cannot be a shipped file's slug. */
export const newCollectionId = (): string => `u${newSavedGameId()}`;

const sizeOf = (games: readonly string[]): number =>
  games.reduce((total, game) => total + game.length + 2, 0);

/**
 * Keep a new collection at the top of the list. Refused past
 * `MAX_UPLOAD_CHARS`, or when the browser's storage is full.
 */
export const addCollection = (
  name: string,
  games: readonly string[],
  now: Date = new Date(),
  id: string = newCollectionId(),
): { collection: LibraryCollection } | { problem: LibraryCollectionProblem } => {
  if (sizeOf(games) > MAX_UPLOAD_CHARS) return { problem: "too-large" };
  const row: StoredCollection = {
    id,
    name: name.trim() || id,
    addedAt: now.toISOString(),
    games: [...games],
  };
  const problem = store.write([row, ...store.snapshot()]);
  return problem === undefined ? { collection: asCollection(row) } : { problem };
};

/** Forget one. Unknown ids are a no-op, not an error. */
export const removeCollection = (id: string): LibraryCollectionProblem | undefined =>
  store.write(store.snapshot().filter((row) => row.id !== id));

/** Write a new `games` list into one collection, in place (its place in the list kept). */
const withGames = (
  id: string,
  change: (games: string[]) => string[] | undefined,
): LibraryCollectionProblem | undefined => {
  const rows = store.snapshot();
  const at = rows.findIndex((row) => row.id === id);
  if (at === -1) return "missing";
  const games = change([...rows[at].games]);
  if (games === undefined) return "missing";
  if (sizeOf(games) > MAX_UPLOAD_CHARS) return "too-large";
  const next = [...rows];
  next[at] = { ...rows[at], games };
  return store.write(next);
};

/** **Update**: game `number` (1-based) becomes `pgn`. */
export const replaceCollectionGame = (
  id: string,
  number: number,
  pgn: string,
): LibraryCollectionProblem | undefined =>
  withGames(id, (games) => {
    if (number < 1 || number > games.length) return undefined;
    games[number - 1] = pgn;
    return games;
  });

/**
 * **Save as copy**: `pgn` becomes game `number` (1-based), the games from
 * there on moving one down — a copy lands right after its original.
 */
export const insertCollectionGame = (
  id: string,
  number: number,
  pgn: string,
): LibraryCollectionProblem | undefined =>
  withGames(id, (games) => {
    if (number < 1 || number > games.length + 1) return undefined;
    games.splice(number - 1, 0, pgn);
    return games;
  });
