import { idbDatabase } from "./idb";

/**
 * **The database the reader's repertoires live in** — IndexedDB,
 * `chessapp.repertoires`, with two object stores: `repertoires` (one record
 * per repertoire, `lib/savedRepertoireStore.ts`) and `folders` (one per
 * folder, `lib/savedRepertoireFolderStore.ts`). The analyses' shape
 * (`lib/savedAnalysisDb.ts`) again: one database for a list and its folders,
 * because the same screens read both. Opened through `lib/idb.ts`; the app's
 * storage as a whole is `.claude/rules/database.md`.
 *
 * Why IndexedDB rather than `localStorage`, where they lived until they
 * moved: a repertoire is a whole file — a Chessable-style course runs to most
 * of a megabyte — and `localStorage` holds about five million characters for
 * the whole origin, so a handful of courses filled it.
 */

const REPERTOIRE_DB_NAME = "chessapp.repertoires";
const DB_VERSION = 1;
export const REPERTOIRES_STORE = "repertoires";
export const REPERTOIRE_FOLDERS_STORE = "folders";
/** The `BroadcastChannel` both stores announce their writes on. */
export const REPERTOIRE_CHANNEL = "chessapp.repertoires";

const repertoireDb = idbDatabase(REPERTOIRE_DB_NAME, DB_VERSION, [
  REPERTOIRES_STORE,
  REPERTOIRE_FOLDERS_STORE,
]);

/** The connection, opened once (and again after a failure or a newer version elsewhere). */
export const openRepertoireDb = repertoireDb.open;

/** **For tests**: close the connection and delete the database. */
export const deleteRepertoireDb = repertoireDb.remove;
