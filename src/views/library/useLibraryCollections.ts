import { useEffect, useState, useSyncExternalStore } from "react";

import {
  subscribeUploadedCollections,
  uploadedCollectionsSnapshot,
} from "../../lib/libraryCollectionStore";
import type { LibraryCollection } from "../../lib/libraryCollections";
import {
  findShippedCollection,
  loadedShippedCollection,
  shippedCollections,
} from "../../lib/shippedCollections";

/**
 * The Library's React bindings (CTA-75) — the upload store through
 * `useSyncExternalStore`, and a shipped file fetched on first use — so
 * `src/lib/` stays free of React.
 */

/** The reader's uploaded collections, newest first. */
export const useUploadedCollections = (): readonly LibraryCollection[] =>
  useSyncExternalStore(
    subscribeUploadedCollections,
    uploadedCollectionsSnapshot,
    uploadedCollectionsSnapshot,
  );

export type CollectionState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "ready"; collection: LibraryCollection };

/**
 * One collection by its route segment: a shipped file (fetched the first time,
 * synchronous after that) or an upload (live from the store, so an Update
 * made on its board is in the table on the way back).
 */
export const useCollection = (id: string | undefined): CollectionState => {
  const uploaded = useUploadedCollections();
  const entry = findShippedCollection(id);
  const [fetched, setFetched] = useState<LibraryCollection | null | undefined>(() =>
    loadedShippedCollection(id),
  );
  const current = fetched === null || fetched?.id === id ? fetched : loadedShippedCollection(id);

  useEffect(() => {
    if (entry === undefined || current !== undefined) return;
    let live = true;
    entry.load().then(
      (collection) => live && setFetched(collection),
      // A chunk that will not load is a collection that is not there.
      () => live && setFetched(null),
    );
    return () => {
      live = false;
    };
  }, [entry, current]);

  if (entry !== undefined) {
    if (current === null) return { status: "missing" };
    return current === undefined ? { status: "loading" } : { status: "ready", collection: current };
  }
  const collection = uploaded.find((candidate) => candidate.id === id);
  return collection === undefined ? { status: "missing" } : { status: "ready", collection };
};

/**
 * How many games each shipped collection holds, by id — fetched in the
 * background for the Library's list, filled in as each file arrives.
 */
export const useShippedGameCounts = (): ReadonlyMap<string, number> => {
  const [counts, setCounts] = useState<ReadonlyMap<string, number>>(
    () =>
      new Map(
        shippedCollections.flatMap((entry) => {
          const loaded = loadedShippedCollection(entry.id);
          return loaded === undefined ? [] : [[entry.id, loaded.games.length] as const];
        }),
      ),
  );

  useEffect(() => {
    let live = true;
    for (const entry of shippedCollections) {
      entry.load().then(
        (collection) =>
          live &&
          setCounts((before) =>
            before.get(entry.id) === collection.games.length
              ? before
              : new Map(before).set(entry.id, collection.games.length),
          ),
        () => undefined,
      );
    }
    return () => {
      live = false;
    };
  }, []);

  return counts;
};
