import { useEffect, useSyncExternalStore } from "react";

import {
  loadUploadedGames,
  loadUploadedRows,
  peekUploadedGames,
  peekUploadedRows,
  subscribeUploadedCollections,
  uploadedCollectionsSnapshot,
} from "../../lib/libraryCollectionStore";
import type { CollectionRow, CollectionSummary } from "../../lib/libraryCollections";
import {
  findShippedCollection,
  peekShippedGames,
  peekShippedRows,
  subscribeShipped,
} from "../../lib/shippedCollections";

/**
 * The Library's React bindings (CTA-75), so `src/lib/` stays free of React. A
 * collection comes in **three parts, each read only when a screen needs it**:
 *
 * - its **summary** — the Library's list (a shipped one's is the manifest's,
 *   read with no fetch; an upload's is its IndexedDB record);
 * - its **rows** — the table, off its index;
 * - its **games** — a board, or the download.
 *
 * Each part is `useSyncExternalStore` over what the stores have already read
 * (a second visit renders on its first frame), and an effect that asks for it
 * when nothing has been — so an Update made on a board is in the table on
 * the way back.
 */

/** The reader's uploaded collections, newest first — `undefined` while the first read is out. */
export const useUploadedCollections = (): readonly CollectionSummary[] | undefined =>
  useSyncExternalStore(
    subscribeUploadedCollections,
    uploadedCollectionsSnapshot,
    uploadedCollectionsSnapshot,
  );

export type CollectionPart<T> =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "ready"; summary: CollectionSummary; value: T };

/** One collection's summary: a shipped file's, or an upload's once the list is read. */
export const useCollectionSummary = (
  id: string | undefined,
): { status: "loading" } | { status: "missing" } | { status: "ready"; summary: CollectionSummary } => {
  const uploaded = useUploadedCollections();
  const shipped = findShippedCollection(id);
  if (shipped !== undefined) return { status: "ready", summary: shipped };
  if (uploaded === undefined) return { status: "loading" };
  const summary = uploaded.find((candidate) => candidate.id === id);
  return summary === undefined ? { status: "missing" } : { status: "ready", summary };
};

const subscribeAll = (listener: () => void) => {
  const shipped = subscribeShipped(listener);
  const uploaded = subscribeUploadedCollections(listener);
  return () => {
    shipped();
    uploaded();
  };
};

type Part = "rows" | "games";

const peek = (summary: CollectionSummary | undefined, part: Part) => {
  if (summary === undefined) return undefined;
  if (summary.source === "shipped") {
    return part === "rows" ? peekShippedRows(summary.id) : peekShippedGames(summary.id);
  }
  return part === "rows" ? peekUploadedRows(summary.id) : peekUploadedGames(summary.id);
};

/** Ask for one part — fetched once, whatever asks. `null` when it is not there. */
const load = (summary: CollectionSummary, part: Part): Promise<unknown> => {
  if (summary.source === "shipped") {
    const entry = findShippedCollection(summary.id);
    if (entry === undefined) return Promise.resolve(null);
    // A failure is kept by the store as `null`, which reads as "missing".
    return (part === "rows" ? entry.loadRows() : entry.loadGames()).catch(() => null);
  }
  return part === "rows" ? loadUploadedRows(summary.id) : loadUploadedGames(summary.id);
};

function useCollectionPart<T>(id: string | undefined, part: Part): CollectionPart<T> {
  const state = useCollectionSummary(id);
  const summary = state.status === "ready" ? state.summary : undefined;
  const value = useSyncExternalStore(subscribeAll, () => peek(summary, part)) as T | null | undefined;

  useEffect(() => {
    if (summary !== undefined && value === undefined) void load(summary, part);
  }, [summary, value, part]);

  if (state.status !== "ready") return state;
  if (value === null) return { status: "missing" };
  return value === undefined ? { status: "loading" } : { status: "ready", summary: state.summary, value };
}

/** A collection's table rows, off its index. */
export const useCollectionRows = (id: string | undefined) =>
  useCollectionPart<readonly CollectionRow[]>(id, "rows");

/** A collection's games — the whole PGN of a shipped file, or an upload's record. */
export const useCollectionGames = (id: string | undefined) =>
  useCollectionPart<readonly string[]>(id, "games");

/** A collection's games, for a one-off (the table's download). `null` when they are not there. */
export const loadCollectionGames = async (
  summary: CollectionSummary,
): Promise<readonly string[] | null> => (await load(summary, "games")) as readonly string[] | null;
