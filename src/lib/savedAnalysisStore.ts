import { sameAnalysisSettings } from "./analysisSettings";
import type { CatalogGame } from "./gameCatalog";
import { idbRecordStore } from "./idbRecordStore";
import {
  MAX_ANALYSIS_DESCRIPTION_CHARS,
  SAVED_ANALYSES_PATH,
  savedAnalysisCatalogOf,
  savedAnalysisFrom,
  type SavedAnalysis,
  type SavedAnalysisSettingsEdit,
} from "./savedAnalyses";
import { ANALYSES_STORE, ANALYSIS_CHANNEL, openAnalysisDb } from "./savedAnalysisDb";

/**
 * Where the reader's analysis boards are kept: **IndexedDB** since CTA-77
 * (`chessapp.analyses`, the `analyses` object store — `lib/savedAnalysisDb.ts`),
 * one record per analysis, listed newest first.
 *
 * The store half of [`savedAnalyses.ts`](./savedAnalyses.ts), built over the
 * shared [`idbRecordStore.ts`](./idbRecordStore.ts) — which owns the kept
 * snapshot, the queued writes that answer once committed, the other tabs'
 * `BroadcastChannel`, and carries the reasoning for all of it. What is this file's own: the cap, the
 * idempotency comparison, and the operations.
 *
 * Every read of the list is the kept snapshot — `undefined` until the first
 * read lands ({@link loadSavedAnalyses}, or the first subscriber) — and every
 * write a promise of `undefined` or a {@link SavedAnalysisProblem}. Nothing
 * here throws.
 */

/**
 * How many analyses are kept.
 *
 * It was 30 while the board wrote itself on every move, and 500 while the
 * analyses lived in `localStorage` (about five million characters for the
 * whole origin). In IndexedDB the bound is the Library's sizing: its Analyse
 * hand-off saves a collection's picked games as analyses, and a collection is
 * sized for 5,000–10,000 games — so two whole collections fit. Measured at
 * that size (CTA-77, `src/test/fixtures/pgn/Carlsen.pgn`'s games, under the
 * tests' fake-indexeddb and jsdom): 7,818 records are ~8 MB, written in one
 * batch in ~80 ms and read back in ~60 ms; 20,000 are ~20 MB, ~0.6 s and
 * ~0.1 s; and the Saved analyses screen's first page takes ~0.9 s either
 * way, because it parses only the page on screen. `saveAnalysis` still drops
 * the oldest past it; `addAnalyses` refuses rather than drop anything.
 */
export const MAX_SAVED_ANALYSES = 20_000;

/**
 * What went wrong with a write: storage refused it, or a batch
 * ({@link addAnalyses}) would pass {@link MAX_SAVED_ANALYSES}.
 */
export type SavedAnalysisProblem = "storage" | "too-many";

const analyses = idbRecordStore<SavedAnalysis>({
  db: openAnalysisDb,
  store: ANALYSES_STORE,
  normalise: savedAnalysisFrom,
  order: "newest-first",
  channel: ANALYSIS_CHANNEL,
});

/** The saved analyses, newest first — `undefined` until the first read lands. Stable between changes. */
export const savedAnalysesSnapshot = analyses.snapshot;

/** Subscribe to changes — this tab's writes, and other tabs'. The first subscriber starts the read. */
export const subscribeSavedAnalyses = analyses.subscribe;

/** The saved analyses, read now if they have not been. */
export const loadSavedAnalyses = analyses.load;

/** The store's write — every operation below funnels through it. */
const write = analyses.write;

/** Resolves once every write issued so far has landed — what a test waits on before it resets. */
export const settledSavedAnalyses = analyses.settled;

/** **For tests**: forget what was read (the database is `deleteAnalysisDb`'s). */
export const resetSavedAnalysisStore = analyses.reset;

/** Whether two records would restore the same screen. */
const unchanged = (a: SavedAnalysis, b: SavedAnalysis): boolean =>
  a.pgn === b.pgn &&
  a.name === b.name &&
  a.folderId === b.folderId &&
  a.description === b.description &&
  a.showArrows === b.showArrows &&
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
export const saveAnalysis = async (
  analysis: SavedAnalysis,
): Promise<SavedAnalysisProblem | undefined> =>
  write((current) => {
    const existing = current.find((row) => row.id === analysis.id);
    if (existing !== undefined && unchanged(existing, analysis)) return current;
    return [
      // The date the analysis was begun is the stored one, not this write's.
      { ...analysis, savedAt: existing?.savedAt ?? analysis.savedAt },
      ...current.filter((row) => row.id !== analysis.id),
    ].slice(0, MAX_SAVED_ANALYSES);
  });

/**
 * Keep several at once, all or nothing — a split's records (CTA-73), the
 * Library's picked games (CTA-77). Refused with `"too-many"`, nothing
 * written, when they would pass the cap: a batch is the reader's whole pick,
 * and dropping the oldest analyses to fit it in would lose work nobody asked
 * to lose.
 */
export const addAnalyses = async (
  records: readonly SavedAnalysis[],
): Promise<SavedAnalysisProblem | undefined> => {
  if (records.length === 0) return undefined;
  let tooMany = false;
  const problem = await write((current) => {
    const ids = new Set(records.map((record) => record.id));
    const rest = current.filter((row) => !ids.has(row.id));
    if (rest.length + records.length > MAX_SAVED_ANALYSES) {
      tooMany = true;
      return current;
    }
    return [...records, ...rest];
  });
  return tooMany ? "too-many" : problem;
};

/** Change one record in place — its place in the list kept, `updatedAt` too. */
const editInPlace = (
  id: string,
  edit: (row: SavedAnalysis) => SavedAnalysis,
): Promise<SavedAnalysisProblem | undefined> =>
  write((current) => {
    const index = current.findIndex((row) => row.id === id);
    if (index < 0) return current;
    const next = edit(current[index]);
    if (next === current[index]) return current;
    return current.map((row, at) => (at === index ? next : row));
  });

/**
 * File one analysis under a folder, or Unfiled with `null` — in place, since
 * filing is organising, not working on it. The same folder is a no-op.
 */
export const fileSavedAnalysis = (
  id: string,
  folderId: string | null,
): Promise<SavedAnalysisProblem | undefined> =>
  editInPlace(id, (row) => (row.folderId === folderId ? row : { ...row, folderId }));

/** Rename one analysis in place. A name that has not changed is a no-op. */
export const renameSavedAnalysis = (
  id: string,
  name: string,
): Promise<SavedAnalysisProblem | undefined> => {
  const trimmed = name.trim();
  return editInPlace(id, (row) => (row.name === trimmed ? row : { ...row, name: trimmed }));
};

/**
 * **The settings screen's Save** (CTA-73): the name, description, side,
 * arrows and folder, written at once and in place — editing settings is not
 * working on the analysis, so it keeps its place in the list. The texts are
 * trimmed and the description bounded; nothing changed is a no-op.
 */
export const updateSavedAnalysisSettings = (
  id: string,
  edit: SavedAnalysisSettingsEdit,
): Promise<SavedAnalysisProblem | undefined> =>
  editInPlace(id, (row) => {
    const next = {
      ...row,
      name: edit.name.trim(),
      description: edit.description.trim().slice(0, MAX_ANALYSIS_DESCRIPTION_CHARS),
      orientation: edit.orientation,
      showArrows: edit.showArrows,
      folderId: edit.folderId,
    };
    return unchanged(row, next) ? row : next;
  });

/**
 * Every analysis filed directly under `folderId` back to Unfiled — the
 * analyses' half of deleting a folder (`removeAnalysisFolder`).
 */
export const unfileAnalysesIn = (
  folderId: string,
): Promise<SavedAnalysisProblem | undefined> =>
  write((current) =>
    current.some((row) => row.folderId === folderId)
      ? current.map((row) => (row.folderId === folderId ? { ...row, folderId: null } : row))
      : current,
  );

/**
 * One saved analysis by id, out of what has been read — `undefined` for an
 * unknown id, and also before the first read has landed (a screen arriving
 * by URL waits for {@link loadSavedAnalyses} first).
 */
export const findSavedAnalysis = (
  id: string | null | undefined,
): SavedAnalysis | undefined =>
  id === null || id === undefined
    ? undefined
    : savedAnalysesSnapshot()?.find((row) => row.id === id);

/** Forget one. Unknown ids are a no-op, not an error. */
export const removeSavedAnalysis = (
  id: string,
): Promise<SavedAnalysisProblem | undefined> => removeSavedAnalyses([id]);

/** Forget several — one write for the lot. */
export const removeSavedAnalyses = (
  ids: readonly string[],
): Promise<SavedAnalysisProblem | undefined> => {
  const gone = new Set(ids);
  return write((current) =>
    current.some((row) => gone.has(row.id)) ? current.filter((row) => !gone.has(row.id)) : current,
  );
};

/** Forget all of them. */
export const clearSavedAnalyses = (): Promise<SavedAnalysisProblem | undefined> =>
  write((current) => (current.length === 0 ? current : []));

/*
  The catalog entries already built, keyed on the record they were built from
  — a record is replaced, never mutated, so an entry is good for as long as
  its record is the stored one.
*/
const catalogEntries = new WeakMap<SavedAnalysis, CatalogGame | null>();

/**
 * **A `?game=analysis/saved/<id>` reference, resolved** — the saved
 * analyses' entry in `lib/gameReference.ts`'s registry. Only the one record
 * named is parsed (`savedAnalysisCatalogOf` over it), not the whole store: a
 * store of thousands would otherwise be parsed on every `?game=` arrival. Out
 * of what has been read, so a screen arriving by URL waits for
 * {@link loadSavedAnalyses} first.
 */
export const findSavedAnalysisGame = (
  segments: readonly string[],
): CatalogGame | undefined => {
  if (segments.length !== 2 || segments[0] !== SAVED_ANALYSES_PATH) return undefined;
  const saved = findSavedAnalysis(segments[1]);
  if (saved === undefined) return undefined;
  let entry = catalogEntries.get(saved);
  if (entry === undefined) {
    entry = savedAnalysisCatalogOf([saved]).games[0] ?? null;
    catalogEntries.set(saved, entry);
  }
  return entry ?? undefined;
};
