import {
  collectionIdOfStem,
  collectionNameOfStem,
  type LibraryCollection,
} from "./libraryCollections";
import { splitPgnGames } from "./pgn";

/**
 * **The Library's shipped collections** (CTA-75): every `.pgn` file under
 * `src/data/library/` is one top-level collection, named from its file name
 * (`WorldCup2023.pgn` → "World Cup 2023", `collectionNameOfStem`) and
 * addressed by its slug (`/library/worldcup2023`). **Dropping a file in is the
 * whole of adding one** — no TypeScript, no manifest, no locale key, no route.
 *
 * The glob is **lazy**: each file is its own chunk, fetched the first time
 * its collection is asked for, so the ~800 KB of the three demos is not in the
 * bundle every screen loads. What is known without fetching — the id and the
 * name — comes from the path. A file's games are cut once and kept, so a
 * second visit is synchronous (`loadedShippedCollection`).
 */

const files = import.meta.glob<string>("../data/library/*.pgn", {
  query: "?raw",
  import: "default",
});

export type ShippedCollectionEntry = {
  id: string;
  name: string;
  /** Fetch and cut the file — once; later calls get the same promise. */
  load: () => Promise<LibraryCollection>;
};

const loaded = new Map<string, LibraryCollection>();

/** `../data/library/WorldCup2023.pgn` → `WorldCup2023`. */
const stemOf = (path: string): string =>
  (path.split("/").pop() ?? path).replace(/\.pgn$/i, "");

/**
 * The entries for a set of glob loaders — a parameter so a test can hand it
 * files of its own. Sorted by name; a second file slugging to an id already
 * taken is left out rather than shadowing the first.
 */
export const shippedCollectionsOf = (
  loaders: Record<string, () => Promise<string>>,
): ShippedCollectionEntry[] => {
  const entries: ShippedCollectionEntry[] = [];
  const seen = new Set<string>();
  for (const path of Object.keys(loaders).sort()) {
    const stem = stemOf(path);
    const id = collectionIdOfStem(stem);
    if (seen.has(id)) continue;
    seen.add(id);
    const name = collectionNameOfStem(stem);
    let pending: Promise<LibraryCollection> | undefined;
    entries.push({
      id,
      name,
      load: () =>
        (pending ??= loaders[path]().then((text) => {
          const collection: LibraryCollection = {
            id,
            name,
            source: "shipped",
            games: splitPgnGames(text),
          };
          loaded.set(id, collection);
          return collection;
        })),
    });
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name));
};

/** The shipped collections — one per file under `src/data/library/`. */
export const shippedCollections: readonly ShippedCollectionEntry[] =
  shippedCollectionsOf(files);

/** One shipped collection's entry, or `undefined`. */
export const findShippedCollection = (
  id: string | undefined,
): ShippedCollectionEntry | undefined =>
  shippedCollections.find((entry) => entry.id === id);

/** A shipped collection already fetched, or `undefined` — what a remount reads synchronously. */
export const loadedShippedCollection = (id: string | undefined): LibraryCollection | undefined =>
  id === undefined ? undefined : loaded.get(id);
