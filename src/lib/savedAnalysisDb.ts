/**
 * **The database the reader's analyses live in** (CTA-77) — IndexedDB,
 * `chessapp.analyses`, with two object stores: `analyses` (one record per
 * saved analysis, `lib/savedAnalysisStore.ts`) and `folders` (one per folder,
 * `lib/savedAnalysisFolderStore.ts`). One database for both, because a folder
 * and the analyses filed in it are read by the same screens, and one
 * connection is opened for the two.
 *
 * Why IndexedDB rather than `localStorage`, where they lived until CTA-77: the
 * Library's Analyse hand-off saves a collection's picked games as analyses —
 * thousands of them — and `localStorage` holds about five million characters
 * for the whole origin. `lib/libraryCollectionStore.ts` is the worked pattern.
 */

export const ANALYSIS_DB_NAME = "chessapp.analyses";
const DB_VERSION = 1;
export const ANALYSES_STORE = "analyses";
export const ANALYSIS_FOLDERS_STORE = "folders";
/** The `BroadcastChannel` both stores announce their writes on. */
export const ANALYSIS_CHANNEL = "chessapp.analyses";

let dbPromise: Promise<IDBDatabase> | undefined;

/** The connection, opened once (and again after a failure or a newer version elsewhere). */
export const openAnalysisDb = (): Promise<IDBDatabase> =>
  (dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available"));
      return;
    }
    const request = indexedDB.open(ANALYSIS_DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of [ANALYSES_STORE, ANALYSIS_FOLDERS_STORE]) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: "id" });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = undefined;
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  }).catch((error: unknown) => {
    dbPromise = undefined;
    throw error;
  }));

/** **For tests**: close the connection and delete the database. */
export const deleteAnalysisDb = async (): Promise<void> => {
  const pending = dbPromise;
  dbPromise = undefined;
  (await pending?.catch(() => undefined))?.close();
  if (typeof indexedDB === "undefined") return;
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(ANALYSIS_DB_NAME);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
};
