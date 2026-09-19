import type { PgnUpload, UploadProblem } from "./pgnUploads";
import { recordStore } from "./recordStore";

/**
 * Where the reader's uploaded PGNs are kept: one `localStorage` key, holding a
 * JSON array of {@link PgnUpload}.
 *
 * The store half of [`pgnUploads.ts`](./pgnUploads.ts), built over the shared
 * [`recordStore.ts`](./recordStore.ts) scaffolding — no React, so the pure
 * catalog code can use it and `views/pgn/useUploads.ts` can wrap it in a
 * `useSyncExternalStore` without either knowing about the other. That module
 * owns the non-throwing read, the revision-stamped snapshot and the
 * `storage`-event subscription, and carries the reasoning for all of it. What
 * is this store's own:
 *
 * ### The snapshot is read once per keystroke, so it must be cheap to check
 *
 * The uploads themselves can run to megabytes of PGN, and this store's
 * snapshot is read from the section descriptor's `catalog` getter — which
 * means once per keystroke in a search box. The revision stamp is what makes
 * that check a few bytes; the expensive half of the work, turning the PGN into
 * a catalog, is memoised one layer up on the identity of what
 * {@link uploadsSnapshot} returns (`userPgnsLibrary()`).
 *
 * ### A write reports the upload problem, not a store problem
 *
 * The write itself has the one failure mode, but the type it reports is
 * {@link UploadProblem} — the wider union a *picked file* is checked against —
 * because every caller of {@link addUpload} handles both halves of the
 * operation, and one shape keeps the two halves honest together.
 */

/** The `localStorage` key. Versioned, so a future shape change is a new key. */
export const UPLOADS_STORAGE_KEY = "chessapp.pgnUploads.v1";

const isUpload = (value: unknown): value is PgnUpload => {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.name === "string" &&
    row.name !== "" &&
    typeof row.text === "string" &&
    typeof row.addedAt === "string"
  );
};

const uploads = recordStore<PgnUpload>(UPLOADS_STORAGE_KEY, (value) =>
  isUpload(value) ? value : undefined,
);

/** The uploads, newest first. Stable between changes — see `recordStore.ts`. */
export const uploadsSnapshot = uploads.snapshot;

/** Subscribe to changes — this tab's writes, and other tabs' through `storage`. */
export const subscribeUploads = uploads.subscribe;

/** The store's write — every operation below funnels through it. */
const write = uploads.write;

/**
 * Keep one file, newest first.
 *
 * Uploading a file whose name is already there **replaces** it and moves it to
 * the top: picking the same export again is how a reader updates a study, and
 * two folders with one name would be worse than either outcome.
 */
export const addUpload = (
  name: string,
  text: string,
  now: Date = new Date(),
): UploadProblem | undefined =>
  write([
    { name, text, addedAt: now.toISOString() },
    ...uploadsSnapshot().filter((upload) => upload.name !== name),
  ]);

/** Forget one file. Unknown names are a no-op, not an error. */
export const removeUpload = (name: string): UploadProblem | undefined =>
  write(uploadsSnapshot().filter((upload) => upload.name !== name));

/** Forget all of them. */
export const clearUploads = (): UploadProblem | undefined => write([]);
