import { sameAnalysisSettings } from "./analysisSettings";
import type { LibraryCatalog } from "./libraryCatalog";
import {
  savedAnalysisCatalogOf,
  savedAnalysisFrom,
  type SavedAnalysis,
} from "./savedAnalyses";

/**
 * Where the reader's analysis boards are kept: one `localStorage` key, holding a
 * JSON array of {@link SavedAnalysis}, newest first.
 *
 * The store half of [`savedAnalyses.ts`](./savedAnalyses.ts), and
 * [`savedGameStore.ts`](./savedGameStore.ts) again — a versioned key, a revision
 * stamp so a snapshot is cheap, non-throwing reads and writes, an idempotent
 * write because the writer is an effect, and a cap so a store written on every
 * move cannot fill the origin's quota. That module carries the reasoning for all
 * of it and it is not repeated here; the two are separate stores rather than one
 * because a saved game and a saved analysis are different records, resumed on
 * different screens, and neither should push the other off the end of a list.
 */

/** The `localStorage` key. Versioned, so a future shape change is a new key. */
export const SAVED_ANALYSES_STORAGE_KEY = "chessapp.savedAnalyses.v1";

/** Where the revision is stamped — a few bytes, read on every snapshot. */
export const SAVED_ANALYSES_REVISION_KEY = `${SAVED_ANALYSES_STORAGE_KEY}.rev`;

/**
 * How many analyses are kept.
 *
 * The same budget the saved games get, for the same reason — a record is
 * rewritten on every move, and an unbounded list would fill a shared few
 * megabytes over a few evenings. A tree with side lines is a little larger than
 * one line of play, which is why this is the smaller of the two numbers.
 */
export const MAX_SAVED_ANALYSES = 30;

/** What went wrong with a write. One case, but named rather than boolean. */
export type SavedAnalysisProblem = "storage";

const EMPTY: readonly SavedAnalysis[] = [];

const listeners = new Set<() => void>();

/** Cached parse, and the revision it was read at. `undefined` = never read. */
let lastRevision: string | null | undefined;
let cached: readonly SavedAnalysis[] = EMPTY;

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const parse = (raw: string | null): readonly SavedAnalysis[] => {
  if (raw === null || raw.trim() === "") return EMPTY;
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return EMPTY;
    const rows = value
      .map(savedAnalysisFrom)
      .filter((row): row is SavedAnalysis => row !== undefined);
    return rows.length === 0 ? EMPTY : rows;
  } catch {
    return EMPTY;
  }
};

/** The saved analyses, newest first. Stable between changes. */
export const savedAnalysesSnapshot = (): readonly SavedAnalysis[] => {
  const revision = read(SAVED_ANALYSES_REVISION_KEY);
  if (revision !== lastRevision) {
    lastRevision = revision;
    cached = parse(read(SAVED_ANALYSES_STORAGE_KEY));
  }
  return cached;
};

const emit = () => {
  for (const listener of listeners) listener();
};

const onStorageEvent = (event: StorageEvent) => {
  // `key === null` is a `clear()` from another tab, which affects us too.
  if (
    event.key === null ||
    event.key === SAVED_ANALYSES_STORAGE_KEY ||
    event.key === SAVED_ANALYSES_REVISION_KEY
  ) {
    emit();
  }
};

/** Subscribe to changes — this tab's writes, and other tabs' through `storage`. */
export const subscribeSavedAnalyses = (onChange: () => void): (() => void) => {
  listeners.add(onChange);

  if (listeners.size === 1 && typeof window !== "undefined") {
    window.addEventListener("storage", onStorageEvent);
  }

  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && typeof window !== "undefined") {
      window.removeEventListener("storage", onStorageEvent);
    }
  };
};

/** Bumped on every write, so a snapshot can tell "changed" from "unchanged". */
let writes = 0;

/** Write the list, or say why it could not be written. Never throws. */
const write = (
  analyses: readonly SavedAnalysis[],
): SavedAnalysisProblem | undefined => {
  try {
    localStorage.setItem(SAVED_ANALYSES_STORAGE_KEY, JSON.stringify(analyses));
    // After the data, so a revision never claims a write that did not land.
    writes += 1;
    localStorage.setItem(SAVED_ANALYSES_REVISION_KEY, `${Date.now()}-${writes}`);
  } catch {
    return "storage";
  }
  emit();
  return undefined;
};

/** Whether two records would restore the same screen. */
const unchanged = (a: SavedAnalysis, b: SavedAnalysis): boolean =>
  a.pgn === b.pgn &&
  a.orientation === b.orientation &&
  a.path.length === b.path.length &&
  a.path.every((san, index) => san === b.path[index]) &&
  sameAnalysisSettings(a.settings, b.settings);

/**
 * Keep one analysis, newest first.
 *
 * Replaced in place and moved to the top when the id is already there, which is
 * what makes "save on every move" one growing record rather than forty of them;
 * a record identical to the one stored is a **no-op**, which is what keeps the
 * effect that calls this from re-ordering the list every time the screen mounts.
 */
export const saveAnalysis = (
  analysis: SavedAnalysis,
): SavedAnalysisProblem | undefined => {
  const current = savedAnalysesSnapshot();
  const existing = current.find((row) => row.id === analysis.id);

  if (existing !== undefined && unchanged(existing, analysis)) return undefined;

  return write(
    [
      // The date the analysis was begun is the stored one, not this write's.
      { ...analysis, savedAt: existing?.savedAt ?? analysis.savedAt },
      ...current.filter((row) => row.id !== analysis.id),
    ].slice(0, MAX_SAVED_ANALYSES),
  );
};

/** One saved analysis by id, or `undefined` — what reopening one starts from. */
export const findSavedAnalysis = (
  id: string | null | undefined,
): SavedAnalysis | undefined =>
  id === null || id === undefined
    ? undefined
    : savedAnalysesSnapshot().find((row) => row.id === id);

/** Forget one. Unknown ids are a no-op, not an error. */
export const removeSavedAnalysis = (
  id: string,
): SavedAnalysisProblem | undefined =>
  write(savedAnalysesSnapshot().filter((row) => row.id !== id));

/** Forget all of them. */
export const clearSavedAnalyses = (): SavedAnalysisProblem | undefined =>
  write([]);

/*
  The saved analyses as a catalog, memoised on the identity of the snapshot —
  `savedAnalysesCatalog()` is called from `resolveGameReference`, on every
  `?game=` arrival, and re-parsing thirty PGNs for the same data is not
  something to do twice. The same arrangement `savedGamesCatalog()` uses.
*/
let live:
  | { analyses: readonly SavedAnalysis[]; catalog: LibraryCatalog }
  | undefined;

/**
 * **The saved analyses as a library catalog**, so
 * `?game=analysis/saved/<id>` resolves through the ordinary hand-off
 * (`lib/gameReference.ts`) rather than through a transport of its own.
 */
export const savedAnalysesCatalog = (): LibraryCatalog => {
  const analyses = savedAnalysesSnapshot();
  if (live === undefined || live.analyses !== analyses) {
    live = { analyses, catalog: savedAnalysisCatalogOf(analyses) };
  }
  return live.catalog;
};
