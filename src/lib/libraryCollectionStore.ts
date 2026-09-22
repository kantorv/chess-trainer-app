import { numberedRows, type IndexedRow } from "./collectionIndex";
import type { CollectionRow, CollectionSummary } from "./libraryCollections";
import { committed, done, idbDatabase } from "./idb";
import { newRecordId } from "./recordId";

/**
 * **The reader's own Library collections** (CTA-75) — kept in **IndexedDB**,
 * opened through `lib/idb.ts` (the app's storage: `.claude/rules/database.md`).
 *
 * ### Why IndexedDB
 *
 * A collection is a tournament or a player's career: 5,000–10,000 games is
 * 5–10 million characters of PGN. `localStorage` holds about five million
 * characters for the whole origin, shared with every other store, so it
 * cannot hold one such collection, let alone several. IndexedDB's quota is a
 * share of the disk (hundreds of megabytes and up), and it stores a record per
 * collection, so editing one game never rewrites the others.
 *
 * What it costs is that **every read is a promise**. The screens already wait
 * for a shipped collection's chunks, so an upload goes through the same
 * loading state; and what has been read is kept here and handed out
 * synchronously ({@link uploadedCollectionsSnapshot}, {@link peekUploadedRows},
 * {@link peekUploadedGames}), so `useSyncExternalStore` still renders a second
 * visit on its first frame.
 *
 * ### Three object stores, one record each per collection
 *
 * | Store | Holds | Read when |
 * | --- | --- | --- |
 * | `collections` | its summary: id, name, when added, how many games | the Library lists them — small |
 * | `indexes` | its index rows (`lib/collectionIndex.ts`) | its table opens |
 * | `games` | its games, one PGN chunk each | a game opens, or it is downloaded |
 *
 * The index is built **before** a collection is added (a worker's pass over
 * every game, `views/library/indexCollection.ts`) and kept in step by every
 * write here: an Update replaces one game and its row, a Save as copy inserts
 * one of each, Add games appends, a delete removes — so the table never
 * re-reads a game. A collection may be empty (made from a name alone).
 *
 * ### Nothing here throws
 *
 * A browser with IndexedDB disabled, a quota refused, a record gone: reads
 * answer empty or `null`, writes answer a {@link LibraryCollectionProblem}.
 * Another tab's write reaches this one through a `BroadcastChannel`.
 *
 * (Before this, uploads lived under the `localStorage` key
 * `chessapp.libraryCollections.v1`. That store never shipped — it was replaced
 * inside CTA-75 — so there is nothing to migrate.)
 */

export const LIBRARY_DB_NAME = "chessapp.library";
const DB_VERSION = 1;
const COLLECTIONS = "collections";
const INDEXES = "indexes";
const GAMES = "games";
const CHANNEL = "chessapp.library";

/** What went wrong with a write. */
export type LibraryCollectionProblem = "storage" | "missing";

type StoredSummary = { id: string; name: string; addedAt: string; count: number };
type StoredIndex = { id: string; rows: IndexedRow[] };
type StoredGames = { id: string; games: string[] };

/* --- the connection ----------------------------------------------- */

const libraryDb = idbDatabase(LIBRARY_DB_NAME, DB_VERSION, [COLLECTIONS, INDEXES, GAMES]);
const openDb = libraryDb.open;

/* --- what has been read, kept ------------------------------------- */

/** Newest first; `undefined` until the first read lands. */
let summaries: readonly CollectionSummary[] | undefined;
/** By id — `null` is "not there". */
const rowsCache = new Map<string, readonly CollectionRow[] | null>();
const gamesCache = new Map<string, readonly string[] | null>();
const listeners = new Set<() => void>();
let channel: BroadcastChannel | undefined;

const emit = () => {
  for (const listener of listeners) listener();
};

const summaryOf = (row: StoredSummary): CollectionSummary => ({
  id: row.id,
  name: row.name,
  source: "uploaded",
  count: row.count,
  addedAt: row.addedAt,
});

const isStoredSummary = (value: unknown): value is StoredSummary => {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.name === "string" &&
    typeof row.addedAt === "string" &&
    typeof row.count === "number"
  );
};

let reading: Promise<void> | undefined;

/** Re-read the summaries — after a write here, or another tab's. */
const refresh = (): Promise<void> =>
  (reading ??= (async () => {
    try {
      const db = await openDb();
      const rows = await done(db.transaction(COLLECTIONS).objectStore(COLLECTIONS).getAll());
      summaries = rows
        .filter(isStoredSummary)
        .sort((a, b) => b.addedAt.localeCompare(a.addedAt) || b.id.localeCompare(a.id))
        .map(summaryOf);
    } catch {
      summaries = [];
    } finally {
      reading = undefined;
    }
    emit();
  })());

/** Another tab changed `id` (or everything, `null`): forget it and re-read. */
const onChannelMessage = (event: MessageEvent<{ id: string | null }>) => {
  const id = event.data?.id ?? null;
  if (id === null) {
    rowsCache.clear();
    gamesCache.clear();
  } else {
    rowsCache.delete(id);
    gamesCache.delete(id);
  }
  void refresh();
};

const announce = (id: string) => channel?.postMessage({ id });

/* --- reading ------------------------------------------------------- */

/** The uploaded collections, newest first — `undefined` while the first read is out. Stable between changes. */
export const uploadedCollectionsSnapshot = (): readonly CollectionSummary[] | undefined => summaries;

/** Subscribe to changes. The first subscriber starts the first read. */
export const subscribeUploadedCollections = (listener: () => void): (() => void) => {
  listeners.add(listener);
  if (channel === undefined && typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = onChannelMessage;
    // Node's channel would hold a test run open; a browser's has no `unref`.
    (channel as unknown as { unref?: () => void }).unref?.();
  }
  if (summaries === undefined) void refresh();
  return () => {
    listeners.delete(listener);
  };
};

/** Read the summaries now (they are otherwise read on the first subscribe). */
export const loadUploadedCollections = async (): Promise<readonly CollectionSummary[]> => {
  if (summaries === undefined) await refresh();
  return summaries ?? [];
};

/** An upload's table rows if read: `undefined` not yet, `null` not there. */
export const peekUploadedRows = (id: string): readonly CollectionRow[] | null | undefined =>
  rowsCache.get(id);

/** An upload's games if read: `undefined` not yet, `null` not there. */
export const peekUploadedGames = (id: string): readonly string[] | null | undefined =>
  gamesCache.get(id);

const readRecord = async <T extends { id: string }>(store: string, id: string): Promise<T | undefined> => {
  try {
    const db = await openDb();
    return (await done(db.transaction(store).objectStore(store).get(id))) as T | undefined;
  } catch {
    return undefined;
  }
};

/** An upload's table rows, numbered — read once, then kept. `null` when it is not there. */
export const loadUploadedRows = async (id: string): Promise<readonly CollectionRow[] | null> => {
  const known = rowsCache.get(id);
  if (known !== undefined) return known;
  const record = await readRecord<StoredIndex>(INDEXES, id);
  const rows = Array.isArray(record?.rows) ? numberedRows(record.rows) : null;
  rowsCache.set(id, rows);
  emit();
  return rows;
};

/** An upload's games — read once, then kept. `null` when it is not there. */
export const loadUploadedGames = async (id: string): Promise<readonly string[] | null> => {
  const known = gamesCache.get(id);
  if (known !== undefined) return known;
  const record = await readRecord<StoredGames>(GAMES, id);
  const games = Array.isArray(record?.games) ? record.games : null;
  gamesCache.set(id, games);
  emit();
  return games;
};

/* --- writing ------------------------------------------------------- */

/** A fresh id — `u` and the saved games' minter, so it cannot be a shipped file's slug. */
export const newCollectionId = (): string => `u${newRecordId()}`;

/** After a write: the caches take what was written, the summaries are re-read, other tabs told. */
const settle = async (
  id: string,
  rows: readonly IndexedRow[] | null,
  games: readonly string[] | null,
): Promise<void> => {
  rowsCache.set(id, rows === null ? null : numberedRows(rows));
  gamesCache.set(id, games);
  await refresh();
  announce(id);
};

/**
 * Keep a new collection: its games and their index rows (one per game, in
 * order — `buildCollectionIndex`'s). Newest first in the list.
 */
export const addCollection = async (
  name: string,
  games: readonly string[],
  rows: readonly IndexedRow[],
  now: Date = new Date(),
  id: string = newCollectionId(),
): Promise<{ collection: CollectionSummary } | { problem: LibraryCollectionProblem }> => {
  if (rows.length !== games.length) throw new Error("addCollection: one index row per game");
  const summary: StoredSummary = { id, name: name.trim() || id, addedAt: now.toISOString(), count: games.length };
  try {
    const db = await openDb();
    const tx = db.transaction([COLLECTIONS, INDEXES, GAMES], "readwrite");
    tx.objectStore(COLLECTIONS).put(summary);
    tx.objectStore(INDEXES).put({ id, rows: [...rows] } satisfies StoredIndex);
    tx.objectStore(GAMES).put({ id, games: [...games] } satisfies StoredGames);
    await committed(tx);
  } catch {
    return { problem: "storage" };
  }
  await settle(id, rows, games);
  return { collection: summaryOf(summary) };
};

/** Forget one, games and index with it. An unknown id is a no-op, not an error. */
export const removeCollection = async (id: string): Promise<LibraryCollectionProblem | undefined> => {
  try {
    const db = await openDb();
    const tx = db.transaction([COLLECTIONS, INDEXES, GAMES], "readwrite");
    for (const store of [COLLECTIONS, INDEXES, GAMES]) tx.objectStore(store).delete(id);
    await committed(tx);
  } catch {
    return "storage";
  }
  await settle(id, null, null);
  return undefined;
};

/**
 * Rewrite one collection's games and rows together, in one transaction —
 * `change` gets both lists (copies) and edits them in place, or answers
 * `false` for a game number that is not there.
 */
const editGames = async (
  id: string,
  change: (games: string[], rows: IndexedRow[]) => boolean,
): Promise<LibraryCollectionProblem | undefined> => {
  let written: { games: string[]; rows: IndexedRow[] };
  try {
    const db = await openDb();
    const tx = db.transaction([COLLECTIONS, INDEXES, GAMES], "readwrite");
    const outcome = committed(tx);
    const [summary, index, stored] = await Promise.all([
      done(tx.objectStore(COLLECTIONS).get(id)) as Promise<StoredSummary | undefined>,
      done(tx.objectStore(INDEXES).get(id)) as Promise<StoredIndex | undefined>,
      done(tx.objectStore(GAMES).get(id)) as Promise<StoredGames | undefined>,
    ]);
    if (summary === undefined || index === undefined || stored === undefined) {
      tx.abort();
      await outcome.catch(() => undefined);
      return "missing";
    }
    const games = [...stored.games];
    const rows = [...index.rows];
    if (!change(games, rows)) {
      tx.abort();
      await outcome.catch(() => undefined);
      return "missing";
    }
    tx.objectStore(GAMES).put({ id, games } satisfies StoredGames);
    tx.objectStore(INDEXES).put({ id, rows } satisfies StoredIndex);
    tx.objectStore(COLLECTIONS).put({ ...summary, count: games.length } satisfies StoredSummary);
    await outcome;
    written = { games, rows };
  } catch {
    return "storage";
  }
  await settle(id, written.rows, written.games);
  return undefined;
};

/** **Update**: game `number` (1-based) becomes `pgn`, its row `row` (`indexedRowOf(pgn)`). */
export const replaceCollectionGame = (
  id: string,
  number: number,
  pgn: string,
  row: IndexedRow,
): Promise<LibraryCollectionProblem | undefined> =>
  editGames(id, (games, rows) => {
    if (number < 1 || number > games.length) return false;
    games[number - 1] = pgn;
    rows[number - 1] = row;
    return true;
  });

/**
 * **Save as copy**: `pgn` becomes game `number` (1-based), the games from
 * there on moving one down — a copy lands right after its original.
 */
export const insertCollectionGame = (
  id: string,
  number: number,
  pgn: string,
  row: IndexedRow,
): Promise<LibraryCollectionProblem | undefined> =>
  editGames(id, (games, rows) => {
    if (number < 1 || number > games.length + 1) return false;
    games.splice(number - 1, 0, pgn);
    rows.splice(number - 1, 0, row);
    return true;
  });

/**
 * **Add games** to a collection — at its end, in order, each with its index
 * row (`buildCollectionIndex`'s, one per game): how an empty collection fills.
 */
export const appendCollectionGames = (
  id: string,
  added: readonly string[],
  addedRows: readonly IndexedRow[],
): Promise<LibraryCollectionProblem | undefined> => {
  if (addedRows.length !== added.length) throw new Error("appendCollectionGames: one index row per game");
  return editGames(id, (games, rows) => {
    // A loop, not a spread: an upload can be tens of thousands of games.
    for (let index = 0; index < added.length; index += 1) {
      games.push(added[index]);
      rows.push(addedRows[index]);
    }
    return true;
  });
};

/**
 * **Delete games** (the table's picks): games `numbers` (1-based) and their
 * rows go, the games after them moving up. A number that is not there
 * refuses the whole delete (`"missing"`), so nothing goes half-way.
 */
export const removeCollectionGames = (
  id: string,
  numbers: readonly number[],
): Promise<LibraryCollectionProblem | undefined> =>
  editGames(id, (games, rows) => {
    const gone = new Set(numbers);
    if ([...gone].some((number) => !Number.isInteger(number) || number < 1 || number > games.length)) {
      return false;
    }
    // In place, without a spread: a collection can be tens of thousands of games.
    let kept = 0;
    for (let index = 0; index < games.length; index += 1) {
      if (gone.has(index + 1)) continue;
      games[kept] = games[index];
      rows[kept] = rows[index];
      kept += 1;
    }
    games.length = kept;
    rows.length = kept;
    return true;
  });

/**
 * **For tests**: close the connection, forget everything read, and delete the
 * database — the IndexedDB counterpart of `localStorage.clear()`.
 */
export const resetLibraryCollectionStore = async (): Promise<void> => {
  summaries = undefined;
  rowsCache.clear();
  gamesCache.clear();
  await libraryDb.remove();
};
