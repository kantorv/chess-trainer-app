import { idbDatabase } from "./idb";

/**
 * **The Library's database**, `chessapp.library` — opened once here and
 * shared by its two stores: the reader's collections
 * (`lib/libraryCollectionStore.ts`, the `collections` / `indexes` / `games`
 * object stores) and the folders they are filed in
 * (`lib/libraryFolderStore.ts`, the `folders` object store, CTA-88).
 *
 * Version 2 added `folders`; the upgrade only creates what is missing
 * (`lib/idb.ts`), so a version-1 database keeps every collection it holds.
 */

export const LIBRARY_DB_NAME = "chessapp.library";
const DB_VERSION = 2;

export const LIBRARY_COLLECTIONS_STORE = "collections";
export const LIBRARY_INDEXES_STORE = "indexes";
export const LIBRARY_GAMES_STORE = "games";
export const LIBRARY_FOLDERS_STORE = "folders";

/** The `BroadcastChannel` both stores announce their writes on. */
export const LIBRARY_CHANNEL = "chessapp.library";

const libraryDb = idbDatabase(LIBRARY_DB_NAME, DB_VERSION, [
  LIBRARY_COLLECTIONS_STORE,
  LIBRARY_INDEXES_STORE,
  LIBRARY_GAMES_STORE,
  LIBRARY_FOLDERS_STORE,
]);

export const openLibraryDb = libraryDb.open;

/** **For tests**: close the connection and delete the database. */
export const deleteLibraryDb = libraryDb.remove;
