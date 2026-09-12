import {
  savedOpeningFrom,
  type SavedOpening,
} from "./savedOpenings";

/**
 * Where the reader's saved openings are kept: one `localStorage` key, holding a
 * JSON array of {@link SavedOpening}, newest first.
 *
 * The store half of [`savedOpenings.ts`](./savedOpenings.ts), and
 * [`savedAnalysisStore.ts`](./savedAnalysisStore.ts) again — a versioned key, a
 * revision stamp so a snapshot is cheap, non-throwing reads and writes, and a
 * cap. One thing is different, and it is the whole of what a saved opening does
 * that a saved analysis does not:
 *
 * - **The note is edited in place.** A note is changed from the Saved openings
 *   screen *after* the record exists, so there is a write that must keep the
 *   record's place in the list rather than move it to the top — editing a name
 *   is not "working on" the opening, and re-ordering on every keystroke would be
 *   noise. {@link updateSavedOpeningNote} is that write.
 *
 * The writer is **idempotent** for the same reason the other stores' are: the
 * save button is not an effect, but a re-save of an identical record must still
 * be a no-op so a reader cannot stack duplicates by clicking twice.
 */

/** The `localStorage` key. Versioned, so a future shape change is a new key. */
export const SAVED_OPENINGS_STORAGE_KEY = "chessapp.savedOpenings.v1";

/** Where the revision is stamped — a few bytes, read on every snapshot. */
export const SAVED_OPENINGS_REVISION_KEY = `${SAVED_OPENINGS_STORAGE_KEY}.rev`;

/**
 * How many openings are kept.
 *
 * A save is a button click rather than an effect, so this is a generous bound
 * rather than a tight one — but a bound all the same, so a list cannot grow to
 * fill the origin's quota over a few months.
 */
export const MAX_SAVED_OPENINGS = 50;

/** What went wrong with a write. One case, but named rather than boolean. */
export type SavedOpeningProblem = "storage";

const EMPTY: readonly SavedOpening[] = [];

const listeners = new Set<() => void>();

/** Cached parse, and the revision it was read at. `undefined` = never read. */
let lastRevision: string | null | undefined;
let cached: readonly SavedOpening[] = EMPTY;

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const parse = (raw: string | null): readonly SavedOpening[] => {
  if (raw === null || raw.trim() === "") return EMPTY;
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return EMPTY;
    const rows = value
      .map(savedOpeningFrom)
      .filter((row): row is SavedOpening => row !== undefined);
    return rows.length === 0 ? EMPTY : rows;
  } catch {
    return EMPTY;
  }
};

/** The saved openings, newest first. Stable between changes. */
export const savedOpeningsSnapshot = (): readonly SavedOpening[] => {
  const revision = read(SAVED_OPENINGS_REVISION_KEY);
  if (revision !== lastRevision) {
    lastRevision = revision;
    cached = parse(read(SAVED_OPENINGS_STORAGE_KEY));
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
    event.key === SAVED_OPENINGS_STORAGE_KEY ||
    event.key === SAVED_OPENINGS_REVISION_KEY
  ) {
    emit();
  }
};

/** Subscribe to changes — this tab's writes, and other tabs' through `storage`. */
export const subscribeSavedOpenings = (onChange: () => void): (() => void) => {
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
  openings: readonly SavedOpening[],
): SavedOpeningProblem | undefined => {
  try {
    localStorage.setItem(SAVED_OPENINGS_STORAGE_KEY, JSON.stringify(openings));
    // After the data, so a revision never claims a write that did not land.
    writes += 1;
    localStorage.setItem(SAVED_OPENINGS_REVISION_KEY, `${Date.now()}-${writes}`);
  } catch {
    return "storage";
  }
  emit();
  return undefined;
};

/** Whether two records would restore the same screen. */
const unchanged = (a: SavedOpening, b: SavedOpening): boolean =>
  a.pgn === b.pgn &&
  a.orientation === b.orientation &&
  a.note === b.note;

/**
 * Keep one opening, newest first.
 *
 * The write is a button click, so there is no "existing record" to grow in
 * place the way a save-on-every-move does — but a re-save that would be
 * identical is still a no-op, so a double click does not stack a duplicate.
 */
export const saveOpening = (
  opening: SavedOpening,
): SavedOpeningProblem | undefined => {
  const current = savedOpeningsSnapshot();
  const existing = current.find((row) => row.id === opening.id);

  if (existing !== undefined && unchanged(existing, opening)) return undefined;

  return write(
    [
      { ...opening, savedAt: existing?.savedAt ?? opening.savedAt },
      ...current.filter((row) => row.id !== opening.id),
    ].slice(0, MAX_SAVED_OPENINGS),
  );
};

/**
 * Change one opening's note, **in place** — the record keeps its position in the
 * list rather than jumping to the top, because editing a name is not working on
 * the opening. A note that has not actually changed is a no-op.
 */
export const updateSavedOpeningNote = (
  id: string,
  note: string,
): SavedOpeningProblem | undefined => {
  const current = savedOpeningsSnapshot();
  const existing = current.find((row) => row.id === id);
  if (existing === undefined || existing.note === note) return undefined;

  return write(
    current.map((row) =>
      row.id === id ? { ...row, note, updatedAt: new Date().toISOString() } : row,
    ),
  );
};

/** One saved opening by id, or `undefined` — what reopening one starts from. */
export const findSavedOpening = (
  id: string | null | undefined,
): SavedOpening | undefined =>
  id === null || id === undefined
    ? undefined
    : savedOpeningsSnapshot().find((row) => row.id === id);

/** Forget one. Unknown ids are a no-op, not an error. */
export const removeSavedOpening = (
  id: string,
): SavedOpeningProblem | undefined =>
  write(savedOpeningsSnapshot().filter((row) => row.id !== id));

/** Forget all of them. */
export const clearSavedOpenings = (): SavedOpeningProblem | undefined =>
  write([]);