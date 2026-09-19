import { sameAnalysisSettings } from "./analysisSettings";
import type { LibraryCatalog } from "./libraryCatalog";
import { recordStore } from "./recordStore";
import {
  savedAnalysisCatalogOf,
  savedAnalysisFrom,
  type SavedAnalysis,
} from "./savedAnalyses";

/**
 * Where the reader's analysis boards are kept: one `localStorage` key, holding
 * a JSON array of {@link SavedAnalysis}, newest first.
 *
 * The store half of [`savedAnalyses.ts`](./savedAnalyses.ts), and
 * [`savedGameStore.ts`](./savedGameStore.ts) again, built over the shared
 * [`recordStore.ts`](./recordStore.ts) scaffolding — which owns the
 * non-throwing read, the revision-stamped snapshot and the `storage`-event
 * subscription, and carries the reasoning for all of it. The two are separate
 * stores rather than one because a saved game and a saved analysis are
 * different records, resumed on different screens, and neither should push the
 * other off the end of a list.
 */

/** The `localStorage` key. Versioned, so a future shape change is a new key. */
export const SAVED_ANALYSES_STORAGE_KEY = "chessapp.savedAnalyses.v1";

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

const analyses = recordStore<SavedAnalysis>(
  SAVED_ANALYSES_STORAGE_KEY,
  savedAnalysisFrom,
);

/** The saved analyses, newest first. Stable between changes. */
export const savedAnalysesSnapshot = analyses.snapshot;

/** Subscribe to changes — this tab's writes, and other tabs' through `storage`. */
export const subscribeSavedAnalyses = analyses.subscribe;

/** The store's write — every operation below funnels through it. */
const write = analyses.write;

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
