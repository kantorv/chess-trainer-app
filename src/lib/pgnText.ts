/**
 * **Small text rules over PGN that no one reader owns** — a slug for a file
 * name, a repertoire chapter's `"N) "` prefix, and the most text one stored
 * PGN may be. Several screens and stores use each of them (the saved lists'
 * downloads, the repertoires' chapter names), so they
 * live here rather than in any one of those. Pure.
 */

/**
 * A URL- and file-name-safe slug out of a human name. Anything that is not a
 * letter or a digit becomes a separator, so `"Chapter 1"` is `"chapter-1"` and
 * `"AlbertSimTL – lalala732"` is `"albertsimtl-lalala732"`.
 *
 * A name with no ASCII alphanumerics at all — a Hebrew title — slugs to the
 * empty string, which every caller answers with a fallback of its own.
 */
export const slugify = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * A repertoire chapter's `"N) "` prefix, taken apart.
 *
 * `"12) 2...d5 3.exd5 Qxd5 4.d4 - ...Bf5 Setups"` → `{ order: 12, label: "2...d5
 * 3.exd5 …" }`. A chapter with no numeric prefix — `"Introduction"`,
 * `"Quickstarter"` — comes back `{ order: undefined, label: <the name> }`.
 */
export const chapterPrefix = (
  raw: string,
): { order?: number; label: string } => {
  const match = /^\s*(\d+)\)\s*(.*)$/s.exec(raw);
  if (match === null) return { label: raw.trim() || raw };
  const rest = match[2].trim();
  return { order: Number(match[1]), label: rest === "" ? raw.trim() : rest };
};

/**
 * The most one stored PGN text may be, in characters — a repertoire. (A
 * Library collection is kept in IndexedDB, not `localStorage`, and has its own
 * limit, `MAX_COLLECTION_CHARS` in `lib/libraryCollections.ts`.)
 *
 * `localStorage` is a few megabytes for the whole origin (browsers count
 * UTF-16 code units, so about five million characters), shared with anything
 * else the app keeps there, and a text refused with a reason is a better
 * outcome than a quota error halfway through a write.
 */
export const MAX_UPLOAD_CHARS = 3_000_000;
