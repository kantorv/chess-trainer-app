import { DEFAULT_POSITION } from "chess.js";

import { mainline } from "./gameTree";
import {
  collectionRowOf,
  type CollectionRow,
} from "./libraryCollections";
import {
  getPositionBook,
  loadOpeningBook,
  openingOfLine,
  type OpeningBook,
} from "./openings";
import { parsePgnTree } from "./pgn";

/**
 * **A collection's index** — what the Library's table is read from: one row
 * per game, made **once**, when the collection comes in, so opening a table
 * of 10,000 games costs a JSON parse rather than a pass over the PGN.
 *
 * - A **shipped** collection's index is a file beside its `.pgn`
 *   (`src/data/library/<Stem>.index.json`), written by
 *   `node scripts/wirepgn.js <file.pgn>` and registered in the manifest with
 *   the game count and the PGN's {@link textHash} — a test fails when a file
 *   and its index disagree.
 * - An **upload**'s index is built in a Web Worker before the collection is
 *   stored (`views/library/indexCollection.ts`), and kept beside its games in
 *   IndexedDB (`lib/libraryCollectionStore.ts`).
 *
 * A row starts as the tags' reading (`collectionRowOf` — no `chess.js`), and
 * the index adds what **only a real parse** can say, through `parsePgnTree` —
 * the very parser the game's board opens it with:
 *
 * - `moves` counted off the parsed mainline rather than the text;
 * - `unreadable` when the game will not parse at all, so the table can say
 *   so before the reader opens it;
 * - `eco` / `opening` filled in from the opening book (eco.json) when the
 *   game's tags leave them out — the deepest named position of its mainline,
 *   `openingOfLine`'s rule. A tag the game carries always wins;
 * - `line`, the first {@link LINE_PLIES} plies of its mainline as SAN
 *   (CTA-76) — what the table's opening-moves board merges into a tree
 *   (`lib/openingTree.ts`). Absent for a game that does not start from the
 *   standard position: its moves cannot join a tree that does.
 *
 * The parse is the cost — about 8 ms a game (`chess.js` matching every SAN),
 * so ~80 s for 10,000 — which is why it is paid once and never on view.
 *
 * Pure; the book arrives as an {@link OpeningLookup}, so the CLI can hand in
 * shards it read off the disk and a test a lookup of its own.
 */

/** A game's row without its number — its place in the collection is its index in `rows`. */
export type IndexedRow = Omit<CollectionRow, "number">;

export type CollectionIndex = {
  /**
   * {@link textHash} of the text the index was built from — a shipped file's
   * PGN, so a stale index is caught. `""` where nothing is checked against it
   * (an upload).
   */
  hash: string;
  rows: IndexedRow[];
};

/**
 * How deep a game's `line` goes — 30 plies, 15 moves: past it the games of
 * even a 10,000-game collection have long since gone their own ways.
 */
export const LINE_PLIES = 30;

/** The opening a mainline (its positions, in order) ended in, or `undefined`. */
export type OpeningLookup = (fens: readonly string[]) => { eco: string; name: string } | undefined;

/**
 * A lookup over a book — `openingOfLine` with the position fallback built once.
 * Exported for `scripts/wirepgn.js`, which imports it dynamically (so knip
 * reports it as unused).
 */
export const openingLookupOf = (book: OpeningBook): OpeningLookup => {
  const positions = getPositionBook(book);
  return (fens) => openingOfLine(book, positions, fens);
};

let lookupPromise: Promise<OpeningLookup> | undefined;

/**
 * The app's own book as a lookup — loaded once (the ~3 MB of eco.json,
 * `loadOpeningBook`'s cached promise) and shared. A book that fails to load is
 * an empty one: nothing is filled in, which is the honest answer.
 */
export const loadOpeningLookup = (): Promise<OpeningLookup> =>
  (lookupPromise ??= loadOpeningBook().then(openingLookupOf));

/** One game's indexed row — its tags, then the `chess.js` pass over it. */
export const indexedRowOf = (pgn: string, lookup?: OpeningLookup): IndexedRow => {
  // `collectionRowOf` wants a number; the index has none to give.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { number, ...row } = collectionRowOf(pgn, 0);
  let fens: string[];
  let line: string[] | undefined;
  try {
    const tree = parsePgnTree(pgn);
    const nodes = mainline(tree);
    fens = [tree.startFen, ...nodes.map((node) => node.fen)];
    if (tree.startFen === DEFAULT_POSITION && nodes.length > 0) {
      line = nodes.slice(0, LINE_PLIES).map((node) => node.san);
    }
  } catch {
    return { ...row, unreadable: true };
  }
  const indexed: IndexedRow = { ...row, moves: Math.ceil((fens.length - 1) / 2) };
  if (line !== undefined) indexed.line = line;
  if (lookup !== undefined && (indexed.eco === undefined || indexed.opening === undefined)) {
    const found = lookup(fens);
    if (found !== undefined) {
      indexed.eco ??= found.eco;
      indexed.opening ??= found.name;
    }
  }
  return indexed;
};

/** One game's row with the app's book — what an Update or a Save as copy writes beside the game. */
export const indexGame = async (pgn: string): Promise<IndexedRow> =>
  indexedRowOf(pgn, await loadOpeningLookup());

export type IndexOptions = {
  lookup?: OpeningLookup;
  /** Stamped on the index — see {@link CollectionIndex.hash}. */
  hash?: string;
  /** After each game: how many are done, of how many. */
  onProgress?: (done: number, total: number) => void;
};

/** Index a collection's games, in order — synchronous: the CLI and the worker run it. */
export const buildCollectionIndex = (
  games: readonly string[],
  { lookup, hash = "", onProgress }: IndexOptions = {},
): CollectionIndex => {
  const rows = games.map((pgn, index) => {
    const row = indexedRowOf(pgn, lookup);
    onProgress?.(index + 1, games.length);
    return row;
  });
  return { hash, rows };
};

/**
 * The same, yielding to the event loop every `batch` games — where no worker
 * can run it (a test's jsdom), so the page still paints its progress.
 */
export const buildCollectionIndexAsync = async (
  games: readonly string[],
  { lookup, hash = "", onProgress, signal, batch = 25 }: IndexOptions & {
    signal?: AbortSignal;
    batch?: number;
  } = {},
): Promise<CollectionIndex> => {
  const rows: IndexedRow[] = [];
  for (let start = 0; start < games.length; start += batch) {
    if (signal?.aborted) throw new DOMException("Indexing cancelled", "AbortError");
    for (const pgn of games.slice(start, start + batch)) rows.push(indexedRowOf(pgn, lookup));
    onProgress?.(rows.length, games.length);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return { hash, rows };
};

/** An index's rows as the table's, numbered 1… in collection order. */
export const numberedRows = (rows: readonly IndexedRow[]): CollectionRow[] =>
  rows.map((row, index) => ({ ...row, number: index + 1 }));

/**
 * **A text's hash** — 32-bit FNV-1a over its UTF-16 code units, as 8 hex
 * digits. Not a security measure: it only tells a shipped `.pgn` edited by
 * hand from the one its index was built from (~20 ms for 10 MB).
 *
 * Line endings are read as `\n` whatever they are, so a checkout that turns
 * them into `\r\n` (git's `core.autocrlf` on Windows) is still the same file.
 */
export const textHash = (text: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    // `\r\n` and a lone `\r` both count as the `\n` they stand for.
    if (code === 13) {
      if (text.charCodeAt(index + 1) !== 10) {
        hash ^= 10;
        hash = Math.imul(hash, 0x01000193);
      }
      continue;
    }
    hash ^= code;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

/* ------------------------------------------------------------------ *
 * The file format — `<Stem>.index.json`.
 *
 * Rows are **tuples under a column list**, not objects: 10,000 rows of
 * repeated keys would be a megabyte of the same eleven words. A column is
 * found by its name, so a later version that adds one still reads an older
 * file (the new column absent, as an optional field is), and an unknown
 * column is ignored. One row per line, so a re-wired file diffs by game.
 * `line` (CTA-76) is such a later column: its SAN joined by spaces, and a
 * file from before it reads as games with no line.
 * ------------------------------------------------------------------ */

const COLLECTION_INDEX_FORMAT = "chessapp.collectionIndex";
const COLLECTION_INDEX_VERSION = 1;

const TEXT_FIELDS = ["white", "black", "result", "date", "round", "event", "eco", "opening"] as const;
const NUMBER_FIELDS = ["whiteElo", "blackElo", "moves"] as const;
const INDEX_COLUMNS = [
  "white",
  "whiteElo",
  "black",
  "blackElo",
  "result",
  "date",
  "round",
  "event",
  "eco",
  "opening",
  "moves",
  "unreadable",
  "line",
] as const satisfies readonly (keyof IndexedRow)[];

type Cell = string | number | null;

/** The index as its file's text. */
export const encodeCollectionIndex = (index: CollectionIndex): string => {
  const rows = index.rows.map((row) =>
    JSON.stringify(
      INDEX_COLUMNS.map((column): Cell => {
        if (column === "unreadable") return row.unreadable ? 1 : null;
        if (column === "line") return row.line === undefined ? null : row.line.join(" ");
        return row[column] ?? null;
      }),
    ),
  );
  const head = JSON.stringify({
    format: COLLECTION_INDEX_FORMAT,
    version: COLLECTION_INDEX_VERSION,
    hash: index.hash,
    count: index.rows.length,
    columns: INDEX_COLUMNS,
  });
  return `${head.slice(0, -1)},"rows":[${rows.length === 0 ? "" : `\n${rows.join(",\n")}\n`}]}\n`;
};

/**
 * An index file's parsed JSON back as an index, or `undefined` for anything
 * that is not one — the wrong format or version, a count its rows do not
 * match. Non-throwing; a cell of the wrong type reads as absent.
 */
export const decodeCollectionIndex = (value: unknown): CollectionIndex | undefined => {
  if (typeof value !== "object" || value === null) return undefined;
  const file = value as Record<string, unknown>;
  if (
    file.format !== COLLECTION_INDEX_FORMAT ||
    file.version !== COLLECTION_INDEX_VERSION ||
    typeof file.hash !== "string" ||
    !Array.isArray(file.columns) ||
    !Array.isArray(file.rows) ||
    file.count !== file.rows.length
  ) {
    return undefined;
  }
  const at = new Map<string, number>();
  file.columns.forEach((column, index) => {
    if (typeof column === "string") at.set(column, index);
  });
  const rows: IndexedRow[] = [];
  for (const tuple of file.rows) {
    if (!Array.isArray(tuple)) return undefined;
    const cell = (column: string): unknown => {
      const index = at.get(column);
      return index === undefined ? undefined : tuple[index];
    };
    const moves = cell("moves");
    const result = cell("result");
    const row: IndexedRow = {
      result: typeof result === "string" ? result : "*",
      moves: typeof moves === "number" ? moves : 0,
    };
    for (const field of TEXT_FIELDS) {
      if (field === "result") continue;
      const text = cell(field);
      if (typeof text === "string") row[field] = text;
    }
    for (const field of NUMBER_FIELDS) {
      if (field === "moves") continue;
      const number = cell(field);
      if (typeof number === "number") row[field] = number;
    }
    if (cell("unreadable") === 1) row.unreadable = true;
    const line = cell("line");
    if (typeof line === "string" && line.trim() !== "") row.line = line.trim().split(/\s+/);
    rows.push(row);
  }
  return { hash: file.hash, rows };
};
