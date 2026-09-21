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
 * It was 30 while the board wrote itself on every move (an autosave slot per
 * board opened adds up fast). Since CTA-73 a record is written only when the
 * reader saves one — and a split of a many-game text makes a record per game —
 * so the bound is the repertoires' generous one. `saveAnalysis` still drops
 * the oldest past it; `addAnalyses` refuses rather than drop anything.
 */
export const MAX_SAVED_ANALYSES = 500;

/**
 * What went wrong with a write: storage refused it, or a batch
 * ({@link addAnalyses}) would pass {@link MAX_SAVED_ANALYSES}.
 */
export type SavedAnalysisProblem = "storage" | "too-many";

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
  a.name === b.name &&
  a.folderId === b.folderId &&
  a.orientation === b.orientation &&
  a.path.length === b.path.length &&
  a.path.every((san, index) => san === b.path[index]) &&
  sameAnalysisSettings(a.settings, b.settings);

/**
 * Keep one analysis, newest first — a new board saved, or one updated.
 *
 * Replaced and moved to the top when the id is already there, which is what
 * keeps an analysis one record however often it is updated; a record
 * identical to the one stored is a **no-op**, so saving twice re-orders
 * nothing.
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

/**
 * Keep several at once, all or nothing — a split's records (CTA-73). Refused
 * with `"too-many"`, nothing written, when they would pass the cap: a split is
 * the reader's whole file, and dropping the oldest analyses to fit it in would
 * lose work nobody asked to lose.
 */
export const addAnalyses = (
  records: readonly SavedAnalysis[],
): SavedAnalysisProblem | undefined => {
  if (records.length === 0) return undefined;
  const ids = new Set(records.map((record) => record.id));
  const rest = savedAnalysesSnapshot().filter((row) => !ids.has(row.id));
  if (rest.length + records.length > MAX_SAVED_ANALYSES) return "too-many";
  return write([...records, ...rest]);
};

/** Change one record in place — its place in the list kept, `updatedAt` too. */
const editInPlace = (
  id: string,
  edit: (row: SavedAnalysis) => SavedAnalysis,
): SavedAnalysisProblem | undefined => {
  const current = savedAnalysesSnapshot();
  const existing = current.find((row) => row.id === id);
  if (existing === undefined) return undefined;
  const next = edit(existing);
  if (next === existing) return undefined;
  return write(current.map((row) => (row.id === id ? next : row)));
};

/**
 * File one analysis under a folder, or Unfiled with `null` — in place, since
 * filing is organising, not working on it. The same folder is a no-op.
 */
export const fileSavedAnalysis = (
  id: string,
  folderId: string | null,
): SavedAnalysisProblem | undefined =>
  editInPlace(id, (row) => (row.folderId === folderId ? row : { ...row, folderId }));

/** Rename one analysis in place. A name that has not changed is a no-op. */
export const renameSavedAnalysis = (
  id: string,
  name: string,
): SavedAnalysisProblem | undefined => {
  const trimmed = name.trim();
  return editInPlace(id, (row) => (row.name === trimmed ? row : { ...row, name: trimmed }));
};

/**
 * Every analysis filed directly under `folderId` back to Unfiled — the
 * analyses' half of deleting a folder (`removeAnalysisFolder`).
 */
export const unfileAnalysesIn = (
  folderId: string,
): SavedAnalysisProblem | undefined => {
  const current = savedAnalysesSnapshot();
  if (!current.some((row) => row.folderId === folderId)) return undefined;
  return write(
    current.map((row) => (row.folderId === folderId ? { ...row, folderId: null } : row)),
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

/** Forget several. */
export const removeSavedAnalyses = (
  ids: readonly string[],
): SavedAnalysisProblem | undefined => {
  const gone = new Set(ids);
  return write(savedAnalysesSnapshot().filter((row) => !gone.has(row.id)));
};

/** Forget all of them. */
export const clearSavedAnalyses = (): SavedAnalysisProblem | undefined =>
  write([]);

/*
  The saved analyses as a catalog, memoised on the identity of the snapshot —
  `savedAnalysesCatalog()` is called from `resolveGameReference`, on every
  `?game=` arrival, and re-parsing every record's PGN for the same data is not
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
