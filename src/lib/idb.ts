/**
 * **The one IndexedDB connection helper** — what every database in the app is
 * opened through, so the open / upgrade / step-aside / delete code is written
 * once rather than once per database. The full reference for the app's
 * storage — every database, its object stores, who writes them, and when a
 * wrapper library would be worth adding — is `.claude/rules/database.md`.
 *
 * A database here is a name, a version and the object stores it holds, each
 * keyed by its rows' `id` (`keyPath: "id"`) with no indexes: every store is
 * read whole and kept in memory by its owner (`lib/idbRecordStore.ts`,
 * `lib/libraryCollectionStore.ts`), so there is nothing to query by.
 *
 * - **Opened once**, lazily, on the first call — and again after a failure,
 *   or after a newer version opening in another tab asked this one to step
 *   aside (`onversionchange`: the connection closes, and the next call
 *   reconnects).
 * - **The upgrade only ever adds.** A store that is missing is created; none
 *   is dropped or reshaped. A new store is a new name in `stores` and a
 *   version bump; the row shapes are the normalisers' business, read back
 *   leniently, so a shape change never needs a version.
 * - **No IndexedDB** (a browser with it disabled): `open` rejects, and every
 *   caller turns that into its own non-throwing answer.
 */

/** A database: its connection, and the tests' reset. */
export interface IdbDatabase {
  /** The database's name — `chessapp.<module>`. */
  readonly name: string;
  /** The connection, opened once (and again after a failure or a newer version elsewhere). */
  open: () => Promise<IDBDatabase>;
  /** **For tests**: close the connection and delete the database. */
  remove: () => Promise<void>;
}

export const idbDatabase = (
  name: string,
  version: number,
  stores: readonly string[],
): IdbDatabase => {
  let connection: Promise<IDBDatabase> | undefined;

  const open = (): Promise<IDBDatabase> =>
    (connection ??= new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("IndexedDB is not available"));
        return;
      }
      const request = indexedDB.open(name, version);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const store of stores) {
          if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: "id" });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        // A newer version opening elsewhere: step aside, and reconnect on the next call.
        db.onversionchange = () => {
          db.close();
          connection = undefined;
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
    }).catch((error: unknown) => {
      connection = undefined;
      throw error;
    }));

  const remove = async (): Promise<void> => {
    const pending = connection;
    connection = undefined;
    (await pending?.catch(() => undefined))?.close();
    if (typeof indexedDB === "undefined") return;
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
  };

  return { name, open, remove };
};

/** A request's result, as a promise. */
export const done = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

/** A transaction's commit, as a promise — rejected on an error or an abort. */
export const committed = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("aborted"));
  });
