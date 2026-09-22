import { idbDatabase } from "./idb";

/**
 * **The database the reader's analyses live in** (CTA-77) — IndexedDB,
 * `chessapp.analyses`, with two object stores: `analyses` (one record per
 * saved analysis, `lib/savedAnalysisStore.ts`) and `folders` (one per folder,
 * `lib/savedAnalysisFolderStore.ts`). One database for both, because a folder
 * and the analyses filed in it are read by the same screens, and one
 * connection is opened for the two. Opened through `lib/idb.ts`; the app's
 * storage as a whole is `.claude/rules/database.md`.
 *
 * Why IndexedDB rather than `localStorage`, where they lived until CTA-77: the
 * Library's Analyse hand-off saves a collection's picked games as analyses —
 * thousands of them — and `localStorage` holds about five million characters
 * for the whole origin.
 */

const ANALYSIS_DB_NAME = "chessapp.analyses";
const DB_VERSION = 1;
export const ANALYSES_STORE = "analyses";
export const ANALYSIS_FOLDERS_STORE = "folders";
/** The `BroadcastChannel` both stores announce their writes on. */
export const ANALYSIS_CHANNEL = "chessapp.analyses";

const analysisDb = idbDatabase(ANALYSIS_DB_NAME, DB_VERSION, [ANALYSES_STORE, ANALYSIS_FOLDERS_STORE]);

/** The connection, opened once (and again after a failure or a newer version elsewhere). */
export const openAnalysisDb = analysisDb.open;

/** **For tests**: close the connection and delete the database. */
export const deleteAnalysisDb = analysisDb.remove;
