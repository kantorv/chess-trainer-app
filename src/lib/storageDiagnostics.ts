import type { CollectionRow } from "./libraryCollections";
import { loadUploadedRows } from "./libraryCollectionStore";

/**
 * **Storage diagnostics** (CTA-94) — how much space the app's data takes,
 * measured where a web application can measure it at all. The research this
 * builds on is `docs/indexed-db.md`; its rules, in short:
 *
 * - The browser reports **estimates** for the whole origin
 *   (`navigator.storage.estimate()`), an optional IndexedDB portion among
 *   them — and nothing per database. A number it does not report is "not
 *   available", never zero.
 * - IndexedDB reports **exact record counts** but no size. A per-category
 *   size can therefore only be this app's own estimate of what its records
 *   hold — the payload, by the declared rules of
 *   {@link estimatedPayloadBytes} — and every place that shows one says so
 *   ("estimated payload", never a disk or IndexedDB size): the browser may
 *   compress, deduplicate and add index overhead, so payloads are estimates
 *   that do not sum to what it reports.
 *
 * The Library is the bulk case (one games record may be a hundred thousand
 * games), and its games are never read here: a collection's games are
 * estimated from its index rows, through the store's own existing read
 * ({@link loadUploadedRows}).
 *
 * Reads only. Nothing here writes, and nothing throws.
 */

/*
  The payload rules — this app's own, declared. A record is measured as what a
  structured clone of it would hold: a string its UTF-16 code units (2 bytes
  each — IndexedDB keeps BMP text that way; `JSON.stringify` is not a size,
  and a record is not JSON), a number 8 bytes, a boolean 4, an ArrayBuffer or
  a typed array its own bytes, a Blob its size, and every array slot or object
  property a little fixed overhead beside its value — an object's property
  name its string bytes. A value reached twice is counted once, which is also
  what a structured clone holds.
*/
const BYTES_PER_STRING_UNIT = 2;
const BYTES_PER_NUMBER = 8;
const BYTES_PER_BOOLEAN = 4;
/** An array element's or an object property's slot, beside the value in it. */
const BYTES_PER_SLOT = 8;

const measure = (value: unknown, seen: Set<object>): number => {
  switch (typeof value) {
    case "string":
      return BYTES_PER_STRING_UNIT * value.length;
    case "number":
    case "bigint":
      return BYTES_PER_NUMBER;
    case "boolean":
      return BYTES_PER_BOOLEAN;
    case "object": {
      if (value === null) return 0;
      // A value reached twice is stored once by a structured clone; the same
      // holds here, and a cycle costs nothing beyond its first visit.
      if (seen.has(value)) return 0;
      seen.add(value);
      if (value instanceof ArrayBuffer) return value.byteLength;
      if (ArrayBuffer.isView(value)) return value.byteLength;
      if (value instanceof Blob) return value.size;
      if (value instanceof Date) return BYTES_PER_NUMBER;
      if (value instanceof Map) {
        let total = 0;
        for (const [key, entry] of value) total += BYTES_PER_SLOT + measure(key, seen) + measure(entry, seen);
        return total;
      }
      if (value instanceof Set) {
        let total = 0;
        for (const entry of value) total += BYTES_PER_SLOT + measure(entry, seen);
        return total;
      }
      if (Array.isArray(value)) {
        let total = 0;
        for (const entry of value) total += BYTES_PER_SLOT + measure(entry, seen);
        return total;
      }
      let total = 0;
      for (const [key, entry] of Object.entries(value)) {
        total += BYTES_PER_STRING_UNIT * key.length + BYTES_PER_SLOT + measure(entry, seen);
      }
      return total;
    }
    default:
      // `undefined`, a symbol, a function: nothing a structured clone holds.
      return 0;
  }
};

/**
 * What a record holds, estimated by the rules above — an application-level
 * payload estimate, **not** disk usage (the browser may compress,
 * deduplicate and add index overhead). Never throws; anything it is handed,
 * it measures.
 */
export const estimatedPayloadBytes = (value: unknown): number => measure(value, new Set());

const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/**
 * A byte count as a person reads it: `512 B`, `23.4 KB`, `234 MB`, `2 GB`.
 * Bytes are integers; past them one decimal is plenty, and a three-digit
 * figure needs none.
 */
export const formatBytes = (bytes: number): string => {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const text = unit === 0 || value >= 100 ? String(Math.round(value)) : value.toFixed(1);
  return `${text} ${UNITS[unit]}`;
};

/** What the browser reports about this origin's storage. Every field is an **estimate**. */
export type BrowserStorageEstimate = {
  /** The whole origin's usage. */
  usage: number | null;
  /** The origin's quota. */
  quota: number | null;
  /**
   * The IndexedDB portion, where the browser reports one
   * (`usageDetails.indexedDB`). `null` reads "not available" — never zero.
   */
  indexedDB: number | null;
};

/**
 * `navigator.storage.estimate()` — the browser's own estimates for this
 * origin, read once. Wherever the browser reports nothing (no Storage API,
 * an insecure context, a refusal), the answer is `null`: a missing number is
 * "not available", never shown as zero. Never rejects.
 */
export const readBrowserStorage = async (): Promise<BrowserStorageEstimate> => {
  const storage = typeof navigator === "undefined" ? undefined : navigator.storage;
  const estimate =
    storage === undefined ? undefined : await storage.estimate().catch(() => undefined);
  // `usageDetails` is the browser's own breakdown, and no part of the
  // TypeScript DOM library; where it is absent the portion is not available.
  const indexedDB = (estimate as { usageDetails?: { indexedDB?: unknown } } | undefined)
    ?.usageDetails?.indexedDB;
  return {
    usage: typeof estimate?.usage === "number" ? estimate.usage : null,
    quota: typeof estimate?.quota === "number" ? estimate.quota : null,
    indexedDB: typeof indexedDB === "number" ? indexedDB : null,
  };
};

/*
  One game's PGN, estimated from its index row — the Library's bulk case,
  sized without reading a game. A row carries the game's whole mainline as
  SAN (`line`, CTA-92) and its move count (`moves`), but not its text, so
  the estimate rebuilds the shape of one: the tag pairs a game of this
  app's collections carries (a dozen pairs, about 400 characters measured
  on the shipped files), the SAN tokens with the space after each, a move
  number before each of White's moves, and the result at the end.
*/
const ESTIMATED_TAG_PAIRS_CHARS = 400;
const CHARS_PER_MOVE_NUMBER = 4;
const CHARS_OF_RESULT = 8;

/**
 * One game's PGN, as the Library's games are estimated: an
 * application-level estimate built from the index row, never from the game
 * itself.
 */
export const estimatedGamePgnBytes = (row: Pick<CollectionRow, "moves" | "line">): number => {
  const line = row.line?.reduce((chars, san) => chars + san.length + 1, 0) ?? 0;
  return (
    BYTES_PER_STRING_UNIT *
    (ESTIMATED_TAG_PAIRS_CHARS + line + CHARS_PER_MOVE_NUMBER * row.moves + CHARS_OF_RESULT)
  );
};

/**
 * The uploaded collections' games, estimated **without reading a games
 * record**: every collection's index rows through the store's own
 * `loadUploadedRows`, each game by {@link estimatedGamePgnBytes}. A
 * collection whose index cannot be read contributes nothing — its count
 * stands beside the estimate all the same. Never rejects.
 */
export const estimatedLibraryGamesPayload = async (
  collections: readonly { id: string }[],
): Promise<number> => {
  const rowsOf = await Promise.all(collections.map((collection) => loadUploadedRows(collection.id)));
  return rowsOf.reduce(
    (total, rows) => total + (rows?.reduce((sum, row) => sum + estimatedGamePgnBytes(row), 0) ?? 0),
    0,
  );
};
