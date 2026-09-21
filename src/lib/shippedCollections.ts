import manifestFile from "../data/library/manifest.json";
import { decodeCollectionIndex, numberedRows } from "./collectionIndex";
import {
  collectionGamesOf,
  type CollectionRow,
  type CollectionSummary,
} from "./libraryCollections";

/**
 * **The Library's shipped collections** (CTA-75), as `node scripts/wirepgn.js`
 * wired them: every collection is a `.pgn` under `src/data/library/`, its
 * index (`<Stem>.index.json`, `lib/collectionIndex.ts`) beside it, and an
 * entry in `manifest.json` naming both, with the game count and the PGN's
 * hash. `shippedCollections.test.ts` fails when a file, its index and its
 * entry disagree, or a `.pgn` is there unwired.
 *
 * **Three costs, paid only when asked for:**
 *
 * - the **manifest** is imported statically — a few hundred bytes — so the
 *   Library lists every collection with its count and fetches nothing;
 * - the **index** is a lazy chunk, fetched when the collection's table opens
 *   (~90 KB for the 674-game World Cup, ~1.4 MB for 10,000 games);
 * - the **PGN** is a lazy chunk, fetched when a game is opened or the
 *   collection downloaded — the whole file, once (~620 KB for the World Cup).
 *
 * Each is fetched once and kept, and what was fetched can be read
 * synchronously ({@link peekShippedRows} / {@link peekShippedGames}), so a
 * second visit renders on its first frame. {@link subscribeShipped} tells a
 * screen when a fetch lands.
 */

const pgnFiles = import.meta.glob<string>("../data/library/*.pgn", {
  query: "?raw",
  import: "default",
});
const indexFiles = import.meta.glob<string>("../data/library/*.index.json", {
  query: "?raw",
  import: "default",
});

export type ShippedCollectionEntry = CollectionSummary & {
  source: "shipped";
  /** The table's rows — the index, fetched once. Rejects when the index is broken. */
  loadRows: () => Promise<readonly CollectionRow[]>;
  /** The games — the PGN, fetched and cut once. */
  loadGames: () => Promise<readonly string[]>;
};

type ManifestEntry = { id: string; name: string; pgn: string; index: string; games: number };

const manifestEntryOf = (value: unknown): ManifestEntry | undefined => {
  if (typeof value !== "object" || value === null) return undefined;
  const entry = value as Record<string, unknown>;
  return typeof entry.id === "string" &&
    entry.id !== "" &&
    typeof entry.name === "string" &&
    typeof entry.pgn === "string" &&
    typeof entry.index === "string" &&
    typeof entry.games === "number"
    ? { id: entry.id, name: entry.name, pgn: entry.pgn, index: entry.index, games: entry.games }
    : undefined;
};

/** What has been fetched, by collection id — `null` for a fetch that failed. */
const rowsCache = new Map<string, readonly CollectionRow[] | null>();
const gamesCache = new Map<string, readonly string[] | null>();
const listeners = new Set<() => void>();
const emit = () => {
  for (const listener of listeners) listener();
};

/** Told whenever a shipped index or PGN lands (or fails to). */
export const subscribeShipped = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Fetch once through `cache`, remembering a failure as `null`. */
const once = <T>(
  cache: Map<string, T | null>,
  id: string,
  fetch: () => Promise<T>,
): (() => Promise<T>) => {
  let pending: Promise<T> | undefined;
  return () =>
    (pending ??= fetch().then(
      (value) => {
        cache.set(id, value);
        emit();
        return value;
      },
      (error: unknown) => {
        cache.set(id, null);
        emit();
        throw error;
      },
    ));
};

/**
 * The entries for a manifest and its loaders — parameters, so a test can hand
 * in files of its own. Sorted by name. An entry that is malformed, whose files
 * are not there, or whose id is taken already is left out.
 */
export const shippedCollectionsOf = (
  manifest: unknown,
  pgnLoaders: Record<string, () => Promise<string>>,
  indexLoaders: Record<string, () => Promise<string>>,
  folder = "../data/library",
): ShippedCollectionEntry[] => {
  const listed =
    typeof manifest === "object" && manifest !== null && Array.isArray((manifest as { collections?: unknown }).collections)
      ? ((manifest as { collections: unknown[] }).collections)
      : [];
  const entries: ShippedCollectionEntry[] = [];
  const seen = new Set<string>();
  for (const value of listed) {
    const entry = manifestEntryOf(value);
    if (entry === undefined || seen.has(entry.id)) continue;
    const pgn = pgnLoaders[`${folder}/${entry.pgn}`];
    const index = indexLoaders[`${folder}/${entry.index}`];
    if (pgn === undefined || index === undefined) continue;
    seen.add(entry.id);
    entries.push({
      id: entry.id,
      name: entry.name,
      source: "shipped",
      count: entry.games,
      loadRows: once(rowsCache, entry.id, async () => {
        const decoded = decodeCollectionIndex(JSON.parse(await index()));
        if (decoded === undefined || decoded.rows.length !== entry.games) {
          throw new Error(`${entry.index} is not the index of ${entry.pgn}`);
        }
        return numberedRows(decoded.rows);
      }),
      loadGames: once(gamesCache, entry.id, async () => collectionGamesOf(await pgn())),
    });
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name));
};

/** The shipped collections — `manifest.json`'s, in name order. */
export const shippedCollections: readonly ShippedCollectionEntry[] = shippedCollectionsOf(
  manifestFile,
  pgnFiles,
  indexFiles,
);

/** One shipped collection's entry, or `undefined`. */
export const findShippedCollection = (
  id: string | undefined,
): ShippedCollectionEntry | undefined => shippedCollections.find((entry) => entry.id === id);

/** A shipped collection's rows if fetched: `undefined` not yet, `null` failed. */
export const peekShippedRows = (id: string): readonly CollectionRow[] | null | undefined =>
  rowsCache.get(id);

/** A shipped collection's games if fetched: `undefined` not yet, `null` failed. */
export const peekShippedGames = (id: string): readonly string[] | null | undefined =>
  gamesCache.get(id);
