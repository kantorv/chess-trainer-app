import { gameTag } from "./gameModel";
import { readPgnParts, splitPgnGames } from "./pgn";
import { slugify } from "./pgnText";

/**
 * **The Library's collections** (CTA-75) — what one is, and how its games
 * become the rows of a table. Pure; the shipped files are read by
 * `lib/shippedCollections.ts` and the reader's uploads kept by
 * `lib/libraryCollectionStore.ts`.
 *
 * A **collection is one PGN text of many games** — a tournament, a player's
 * games — held as one PGN chunk per game, in file order. It is not a single
 * game or a position, and it does not nest: the Library is one level of
 * collections, each a table of its games, each game an analysis board.
 *
 * A game is **addressed by its place in the collection** — its 1-based
 * number, the table's `#` column and the last segment of its route. Nothing in
 * a PGN is an id (two games of one round can share every tag), and a number is
 * what a reader says ("game 12 of the Morphy collection").
 *
 * **A row is read without `chess.js`** ({@link collectionRowOf}): the game's
 * tags, read with the same tag reader `parsePgnTree` uses, and its length,
 * counted off the movetext as text ({@link mainlinePlies}). The table does not
 * build rows at all any more: it reads a collection's **index**
 * (`lib/collectionIndex.ts`), made once — by `scripts/wirepgn.js` for a
 * shipped file, on the way in for an upload — which starts from these rows
 * and adds what only a real parse can say.
 */

/** Where a collection came from — the one thing that decides what a save may write. */
export type CollectionSource = "shipped" | "uploaded";

/**
 * **The most text one collection may be** — 30,000,000 characters, about
 * 30,000 games of the World Cup file's ~950 characters each. An upload is kept
 * in IndexedDB (`lib/libraryCollectionStore.ts`), whose quota is a share of
 * the disk rather than `localStorage`'s few megabytes, so this is a guard on
 * the tab's memory (a text is held twice while it is read), not on storage.
 */
export const MAX_COLLECTION_CHARS = 30_000_000;

/**
 * What is known of a collection **without its games** — enough for the
 * Library's list and a table's header. A shipped file's summary is its
 * manifest entry (`src/data/library/manifest.json`), so listing the Library
 * fetches nothing; an upload's is its own IndexedDB record.
 */
export type CollectionSummary = {
  id: string;
  name: string;
  source: CollectionSource;
  /** How many games it holds. */
  count: number;
  /** ISO 8601 — when an upload was added. Absent for a shipped file. */
  addedAt?: string;
};

export type LibraryCollection = {
  /** Its route segment: a shipped file's slug, or an upload's minted id. */
  id: string;
  name: string;
  source: CollectionSource;
  /** One PGN chunk per game, in file order. */
  games: readonly string[];
  /** ISO 8601 — when an upload was added. Absent for a shipped file. */
  addedAt?: string;
};

/**
 * The table's columns (CTA-75), from the tags the shipped files carry: every
 * one of the three has White, Black, their Elos, Result, Date, Round, Event
 * and ECO; the two tournaments add Opening (and mostly Variation), which is
 * one column. `moves` is counted, not read.
 */
export const COLLECTION_COLUMNS = [
  "number",
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
] as const;

export type CollectionColumn = (typeof COLLECTION_COLUMNS)[number];

/** One game as the table shows it. A tag the game does not carry is `undefined`. */
export type CollectionRow = {
  /** 1-based, its place in the collection — the route's game segment. */
  number: number;
  white?: string;
  whiteElo?: number;
  black?: string;
  blackElo?: number;
  /** As PGN writes it — `1-0`, `0-1`, `1/2-1/2`, `*`. */
  result: string;
  /** The `Date` tag with its unknown parts dropped: `1848.??.??` is `1848`. */
  date?: string;
  round?: string;
  event?: string;
  eco?: string;
  /** `Opening`, and `Variation` after a comma when there is one. */
  opening?: string;
  /** Full moves in the mainline — a game of 41 plies is 21 moves. */
  moves: number;
  /**
   * The game will not parse (`parsePgnTree` throws) — its board will say so.
   * Set by the index's `chess.js` pass; absent when the game reads.
   */
  unreadable?: boolean;
};

/** The results a table can be narrowed to — PGN's four. */
export const RESULTS = ["1-0", "0-1", "1/2-1/2", "*"] as const;

/**
 * A movetext's **mainline** moves as text: comments, side lines, NAGs, move
 * numbers and the result are dropped and what is left is one token per move.
 * Never throws; a broken movetext yields what it has.
 */
const mainlineTokens = (movetext: string): string[] => {
  let depth = 0;
  let text = "";
  let index = 0;
  while (index < movetext.length) {
    const char = movetext[index];
    if (char === "{") {
      // A brace comment runs to the next `}` and does not nest.
      const end = movetext.indexOf("}", index + 1);
      index = end === -1 ? movetext.length : end + 1;
      text += " ";
      continue;
    }
    if (char === ";") {
      const end = movetext.indexOf("\n", index + 1);
      index = end === -1 ? movetext.length : end + 1;
      text += " ";
      continue;
    }
    if (char === "(") depth += 1;
    else if (char === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0) text += char;
    else {
      index += 1;
      continue;
    }
    if (char === "(" || char === ")") text += " ";
    index += 1;
  }
  return text
    .split(/\s+/)
    .map((token) => token.replace(/^\d+\.(\.\.)?/, ""))
    .filter(
      (token) =>
        token !== "" &&
        !token.startsWith("$") &&
        !/^\d+\.*$/.test(token) &&
        !(RESULTS as readonly string[]).includes(token),
    );
};

/** How many plies a movetext's mainline has — {@link mainlineTokens}, counted. */
export const mainlinePlies = (movetext: string): number => mainlineTokens(movetext).length;

/** A SAN move, marks and all — what tells a game's movetext from stray prose. */
const SAN = /^(?:[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=?[QRBN])?|O-O(?:-O)?|0-0(?:-0)?)[+#]?[!?]*$/;

const eloOf = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined;
  const elo = Number(value);
  return Number.isInteger(elo) && elo > 0 ? elo : undefined;
};

/** A PGN date without its unknown parts: `1848.??.??` → `1848`, `????.??.??` → none. */
const knownDate = (value: string | undefined): string | undefined => {
  if (value === undefined) return undefined;
  const known = value.replace(/(\.\?\?)+$/, "");
  return known === "" || known.startsWith("?") ? undefined : known;
};

/** One game's row. `number` is its 1-based place in the collection. */
export const collectionRowOf = (pgn: string, number: number): CollectionRow => {
  const { headers, movetext } = readPgnParts(pgn);
  const tag = (key: string) => gameTag(headers, key);
  const opening = tag("Opening");
  const variation = tag("Variation");
  return {
    number,
    white: tag("White"),
    whiteElo: eloOf(tag("WhiteElo")),
    black: tag("Black"),
    blackElo: eloOf(tag("BlackElo")),
    result: headers.Result?.trim() || "*",
    date: knownDate(tag("Date")),
    round: tag("Round"),
    event: tag("Event"),
    eco: tag("ECO"),
    opening:
      opening === undefined
        ? variation
        : variation === undefined
          ? opening
          : `${opening}, ${variation}`,
    moves: Math.ceil(mainlinePlies(movetext) / 2),
  };
};

/** Every game's row, in collection order. */
export const collectionRowsOf = (
  collection: Pick<LibraryCollection, "games">,
): CollectionRow[] =>
  collection.games.map((pgn, index) => collectionRowOf(pgn, index + 1));

/** What a game is called: its players, White first. */
export const gameTitleOf = (row: Pick<CollectionRow, "white" | "black">): string =>
  `${row.white ?? "?"} – ${row.black ?? "?"}`;

export type SortDirection = "asc" | "desc";

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

const compareValues = (a: string | number, b: string | number): number =>
  typeof a === "number" && typeof b === "number"
    ? a - b
    : collator.compare(String(a), String(b));

/**
 * The rows sorted by one column. Numbers numerically, text (a round's `1.10`
 * after its `1.9`) with a numeric-aware collation; a row missing the value
 * sorts **last in either direction**, and ties keep collection order.
 */
export const sortedRows = (
  rows: readonly CollectionRow[],
  column: CollectionColumn,
  direction: SortDirection,
): CollectionRow[] => {
  const sign = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = a[column];
    const right = b[column];
    if (left === undefined || right === undefined) {
      if (left === right) return a.number - b.number;
      return left === undefined ? 1 : -1;
    }
    return sign * compareValues(left, right) || a.number - b.number;
  });
};

/** The narrowing the table offers: words in any column, and one result. */
export type RowFilter = {
  /** Every word must appear in some column, case aside. */
  text: string;
  /** One of {@link RESULTS}, or `""` for any. */
  result: string;
};

const searchTextOf = (row: CollectionRow): string =>
  [
    row.white,
    row.black,
    row.whiteElo,
    row.blackElo,
    row.date,
    row.round,
    row.event,
    row.eco,
    row.opening,
  ]
    .filter((value) => value !== undefined)
    .join(" ")
    .toLowerCase();

export const filteredRows = (
  rows: readonly CollectionRow[],
  filter: RowFilter,
): CollectionRow[] => {
  const words = filter.text.toLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter((row) => {
    if (filter.result !== "" && row.result !== filter.result) return false;
    if (words.length === 0) return true;
    const text = searchTextOf(row);
    return words.every((word) => text.includes(word));
  });
};

/**
 * A shipped file's name out of its stem — the one naming rule that makes
 * dropping a file in enough: `WorldCup2023` → `World Cup 2023`,
 * `candidates_2024` → `Candidates 2024`. Word breaks at a lower-to-upper
 * case change, at a letter-digit boundary and at `_` / `-`.
 */
export const collectionNameOfStem = (stem: string): string => {
  const words = stem
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  return words === "" ? stem : words.charAt(0).toUpperCase() + words.slice(1);
};

/** A shipped file's route segment: its stem, slugified (`WorldCup2023` → `worldcup2023`). */
export const collectionIdOfStem = (stem: string): string => slugify(stem) || "collection";

/** Why a text was not taken as a collection. */
export type CollectionTextProblem = "empty" | "too-large" | "unreadable";

export type CollectionReading =
  | { ok: true; games: string[]; name?: string }
  | { ok: false; problem: CollectionTextProblem };

/**
 * A text's games: cut where an `[Event …]` follows a blank line
 * (`splitPgnGames`), each chunk kept as it stood, and a chunk holding no tag
 * pair and no SAN move — stray prose — left out. The one cutting rule, shared
 * by an upload ({@link readCollectionText}) and `scripts/wirepgn.js`, so a
 * file wired into the build and the same file uploaded are the same games.
 */
export const collectionGamesOf = (text: string): string[] =>
  splitPgnGames(text).filter((chunk) => {
    const { headers, movetext } = readPgnParts(chunk);
    return Object.keys(headers).length > 0 || mainlineTokens(movetext).some((token) => SAN.test(token));
  });

/**
 * A file's text or a paste, read as a collection: line endings normalised,
 * cut into games ({@link collectionGamesOf}), refused past
 * {@link MAX_COLLECTION_CHARS}. `name` is the `Event` every game shares, when
 * they do — what a tournament export is called. A text holding no game (no
 * tag pair and no SAN move) is `unreadable`.
 */
export const readCollectionText = (text: string): CollectionReading => {
  const normalised = text.replace(/\r\n?/g, "\n");
  if (normalised.trim() === "") return { ok: false, problem: "empty" };
  if (normalised.length > MAX_COLLECTION_CHARS) return { ok: false, problem: "too-large" };

  const games = collectionGamesOf(normalised);
  if (games.length === 0) return { ok: false, problem: "unreadable" };

  const events = new Set(games.map((pgn) => gameTag(readPgnParts(pgn).headers, "Event")));
  const [event] = events;
  return events.size === 1 && event !== undefined ? { ok: true, games, name: event } : { ok: true, games };
};
