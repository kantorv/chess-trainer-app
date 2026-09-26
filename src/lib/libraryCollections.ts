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
 * game or a position, and it does not nest: a collection is a table of its
 * games, each game an analysis board. The Library files collections in
 * folders (CTA-88, `lib/libraryFolderStore.ts`), but a collection holds no
 * folder.
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
type CollectionSource = "shipped" | "uploaded";

/**
 * **The most text one collection may be** — 100,000,000 characters, about
 * 100,000 games of the World Cup file's ~950 characters each. An upload is kept
 * in IndexedDB (`lib/libraryCollectionStore.ts`), whose quota is a share of
 * the disk rather than `localStorage`'s few megabytes, so this is a guard on
 * the tab's memory (a text is held twice while it is read), not on storage.
 */
export const MAX_COLLECTION_CHARS = 100_000_000;

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
  /**
   * The folder an upload is filed in (CTA-88) — `null` the top level, as is a
   * folder that is not there. Absent for a shipped file, which lives in the
   * Library's fixed Built-in folder.
   */
  folderId?: string | null;
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
  /**
   * The game's whole parsed mainline, as SAN (CTA-76, uncapped by CTA-92) —
   * what the opening-moves board filters by (`lib/openingTree.ts`). Set by
   * the index's `chess.js` pass; absent for an unreadable game, one that does
   * not start from the standard position, and every game of an index from
   * before it — and an index from between the two holds only the game's
   * first 30 plies, which the tree follows as far as they go.
   */
  line?: readonly string[];
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
 * sorts **last in either direction**, and ties go by `#` in the same
 * direction (newest first puts one day's later games first).
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
    // A tie follows the direction too: of one day's games, newest first reads the later first.
    return sign * (compareValues(left, right) || a.number - b.number);
  });
};

/** The side a player had — what narrows a player filter to their games as White or as Black. */
export type PlayerColor = "white" | "black";

/**
 * The narrowing the table offers: words in any column (the box over the
 * table), and the side panel's structured filters. Every field but `text`
 * and `result` is optional, and an empty one narrows nothing.
 */
export type RowFilter = {
  /** Every word must appear in some column, case aside. */
  text: string;
  /** One of {@link RESULTS}, or `""` for any. */
  result: string;
  /**
   * Parts of players' names, case aside — a game is kept when **any** name is
   * in White's or Black's, as `color` says (CTA-95: several spellings of one
   * player chosen together). Each name is a substring match exactly as one
   * name always was; an empty list narrows nothing.
   */
  player?: readonly string[];
  /** The side one of `player` had; `""` / absent for either. Nothing without a `player`. */
  color?: PlayerColor | "";
  /**
   * Part of the opening's label — its ECO code, then its name
   * ({@link openingLabelOf}): `B9` finds B90–B99, `najdorf` the Najdorf, and
   * a label picked from the list its own line and the lines under it.
   */
  opening?: string;
  /** The event, exactly. */
  event?: string;
  /** Inclusive bounds, `YYYY-MM-DD` (a date input's value). */
  from?: string;
  to?: string;
  /**
   * Inclusive Elo bounds (CTA-103, the import popup's filter): a game is kept
   * only when **both** players' Elo is within them. Either may be absent; with
   * either set, a game missing an Elo is out.
   */
  minElo?: number;
  maxElo?: number;
  /**
   * The opening moves played on the filter board, as SAN from the start
   * (CTA-76): a game is kept when its `line` begins with them. Empty or
   * absent narrows nothing; a game with no `line` is out once it is set.
   */
  line?: readonly string[];
};

/**
 * The side panel's filters as the table's URL holds them — every field a
 * string, `""` for none (dates as `YYYY-MM-DD`), but `player`: the chosen
 * names, the URL's repeated `?player=` params in the order they were chosen
 * (mutable, as the panel's Autocomplete takes them).
 */
export type CollectionFilterValues = {
  player: string[];
  color: PlayerColor | "";
  opening: string;
  event: string;
  from: string;
  to: string;
  result: string;
  /**
   * The opening-moves board's line, comma-joined SAN (`e4,c5,Nf3` — the
   * `?at=` encoding, `lib/repertoireLink.ts`), as far as the collection's
   * games follow it.
   */
  line: string;
};

/** The URL parameters the side panel owns — what its Clear removes. */
export const COLLECTION_FILTER_PARAMS = [
  "player",
  "color",
  "opening",
  "event",
  "from",
  "to",
  "result",
  "line",
] as const satisfies readonly (keyof CollectionFilterValues)[];

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

/**
 * What the opening filter shows and matches: the ECO code, then the name —
 * `B90 Sicilian Defense: Najdorf Variation`. Either alone when the game has
 * only one; `undefined` with neither.
 */
export const openingLabelOf = (row: Pick<CollectionRow, "eco" | "opening">): string | undefined => {
  const label = [row.eco, row.opening].filter((part) => part !== undefined && part !== "").join(" ");
  return label === "" ? undefined : label;
};

/** The words a batch's folder name is made of, in the reader's language — the name is theirs. */
export type BatchNameLabels = {
  /** "12 games" — the count, already worded. */
  games: string;
  /** The side a player filter is limited to. */
  white: string;
  black: string;
};

/**
 * A SAN line as a reader writes it: `1.e4 c5 2.Nf3` — move numbers on White's
 * moves (and on a line that starts with Black's, never here: the filter
 * board starts at the standard start).
 */
const numberedLine = (line: readonly string[]): string =>
  line.map((san, index) => (index % 2 === 0 ? `${index / 2 + 1}.${san}` : san)).join(" ");

/**
 * The filters that are on, as the short phrases a batch's folder name
 * carries — the player and side, the opening (its ECO code when the filter
 * names one, else what was typed), the event, the dates, the result, the
 * opening moves and the words box — in that order. Empty when none is on.
 */
export const activeFilterSummary = (filter: RowFilter, labels: BatchNameLabels): string[] => {
  const parts: string[] = [];
  // The names as one phrase, "/" for the either-spelling the filter means.
  const players = (filter.player ?? [])
    .map((name) => name.trim())
    .filter((name) => name !== "");
  if (players.length > 0) parts.push(players.join(" / "));
  if (players.length > 0 && (filter.color === "white" || filter.color === "black")) {
    parts.push(labels[filter.color]);
  }
  const opening = filter.opening?.trim() ?? "";
  if (opening !== "") parts.push(/^[A-E]\d\d\b/.exec(opening)?.[0] ?? opening);
  if ((filter.event ?? "") !== "") parts.push(filter.event as string);
  const from = filter.from ?? "";
  const to = filter.to ?? "";
  if (from !== "" || to !== "") parts.push(`${from || "…"}–${to || "…"}`);
  if (filter.result !== "") parts.push(filter.result);
  if ((filter.line ?? []).length > 0) parts.push(numberedLine(filter.line ?? []));
  const words = filter.text.trim();
  if (words !== "") parts.push(`"${words}"`);
  return parts;
};

/**
 * **The name of the analyses folder a batch of picked games goes into**
 * (CTA-77, the table's Analyse): the collection's name, how many games, and —
 * only when some are on — the filters, `World Cup 2023 — 12 games (Carlsen,
 * White, B90, 1.e4 c5)`. Kept within `max` characters (the folder name's
 * limit): the filter summary is cut first, with an ellipsis, and dropped
 * when too little of it would be left to read; only a collection name too
 * long on its own is cut, and never the count.
 */
export const batchFolderNameOf = (
  collectionName: string,
  filter: RowFilter,
  labels: BatchNameLabels,
  max: number,
): string => {
  const count = ` — ${labels.games}`;
  let name = collectionName.trim();
  if (name.length + count.length > max) {
    name = `${name.slice(0, Math.max(0, max - count.length - 1)).trimEnd()}…`;
  }
  const base = `${name}${count}`;
  const summary = activeFilterSummary(filter, labels).join(", ");
  if (summary === "") return base;
  const full = `${base} (${summary})`;
  if (full.length <= max) return full;
  // " (" + at least a few characters + "…)" — else not worth the room.
  const room = max - base.length - 4;
  if (room < 4) return base;
  return `${base} (${summary.slice(0, room).trimEnd()}…)`;
};

/**
 * The days a PGN date could be, as `YYYY-MM-DD` bounds: `2023.07.30` is that
 * day; `1848` (its unknown parts already dropped) is the whole year; a month
 * or day written `??` is any. `undefined` without a readable year.
 */
export const dateBounds = (date: string | undefined): [string, string] | undefined => {
  const [year, month, day] = (date ?? "").split(".");
  if (year === undefined || !/^\d{4}$/.test(year)) return undefined;
  const part = (value: string | undefined, low: string, high: string): [string, string] =>
    value !== undefined && /^\d{2}$/.test(value) ? [value, value] : [low, high];
  const [monthLow, monthHigh] = part(month, "01", "12");
  const [dayLow, dayHigh] = part(day, "01", "31");
  return [`${year}-${monthLow}-${dayLow}`, `${year}-${monthHigh}-${dayHigh}`];
};

export const filteredRows = (
  rows: readonly CollectionRow[],
  filter: RowFilter,
): CollectionRow[] => {
  const words = filter.text.toLowerCase().split(/\s+/).filter(Boolean);
  // Every name a substring match exactly as one name always was; OR across them (CTA-95).
  const players = (filter.player ?? [])
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name !== "");
  const opening = filter.opening?.trim().toLowerCase() ?? "";
  const event = filter.event ?? "";
  const from = filter.from ?? "";
  const to = filter.to ?? "";
  const line = filter.line ?? [];
  const { minElo, maxElo } = filter;
  const eloIn = (elo: number | undefined) =>
    elo !== undefined && (minElo === undefined || elo >= minElo) && (maxElo === undefined || elo <= maxElo);
  return rows.filter((row) => {
    if ((minElo !== undefined || maxElo !== undefined) && !(eloIn(row.whiteElo) && eloIn(row.blackElo))) {
      return false;
    }
    if (line.length > 0) {
      if (row.line === undefined || row.line.length < line.length) return false;
      if (line.some((san, index) => row.line?.[index] !== san)) return false;
    }
    if (filter.result !== "" && row.result !== filter.result) return false;
    if (players.length > 0) {
      // Any selected player had the side `color` leaves open — with White or
      // Black chosen, any of them on that side; one name, today's behaviour.
      const asWhite =
        filter.color !== "black" && players.some((name) => row.white?.toLowerCase().includes(name) ?? false);
      const asBlack =
        filter.color !== "white" && players.some((name) => row.black?.toLowerCase().includes(name) ?? false);
      if (!asWhite && !asBlack) return false;
    }
    if (opening !== "" && !(openingLabelOf(row)?.toLowerCase().includes(opening) ?? false)) {
      return false;
    }
    if (event !== "" && row.event !== event) return false;
    if (from !== "" || to !== "") {
      // A game is in range when any day it could have been played is.
      const bounds = dateBounds(row.date);
      if (bounds === undefined) return false;
      if (from !== "" && bounds[1] < from) return false;
      if (to !== "" && bounds[0] > to) return false;
    }
    if (words.length === 0) return true;
    const text = searchTextOf(row);
    return words.every((word) => text.includes(word));
  });
};

/**
 * What a collection's rows offer the side panel's filters — **a filter is
 * shown only where some game carries its field**, since a collection is
 * whatever its PGN says (Morphy's file has no rounds, an upload may have no
 * dates). The lists are distinct and complete — a 7,818-game collection
 * offers its 3,040 openings, every one; `openings` are {@link openingLabelOf}
 * labels in ECO order (A00 to E99, then any without a code), the rest sorted
 * numeric-aware. `dates` is the earliest and latest day any game could be.
 */
export type CollectionFacets = {
  players: string[];
  openings: string[];
  events: string[];
  results: string[];
  dates?: { min: string; max: string };
};

export const collectionFacetsOf = (rows: readonly CollectionRow[]): CollectionFacets => {
  const players = new Set<string>();
  const openings = new Set<string>();
  const events = new Set<string>();
  const results = new Set<string>();
  let min: string | undefined;
  let max: string | undefined;
  for (const row of rows) {
    if (row.white !== undefined) players.add(row.white);
    if (row.black !== undefined) players.add(row.black);
    const opening = openingLabelOf(row);
    if (opening !== undefined) openings.add(opening);
    if (row.event !== undefined) events.add(row.event);
    results.add(row.result);
    const bounds = dateBounds(row.date);
    if (bounds !== undefined) {
      if (min === undefined || bounds[0] < min) min = bounds[0];
      if (max === undefined || bounds[1] > max) max = bounds[1];
    }
  }
  const sorted = (values: Set<string>) => [...values].sort(collator.compare);
  const hasEco = (label: string) => /^[A-E]\d\d\b/.test(label);
  return {
    players: sorted(players),
    openings: [...openings].sort(
      (a, b) => Number(hasEco(b)) - Number(hasEco(a)) || collator.compare(a, b),
    ),
    events: sorted(events),
    results: RESULTS.filter((result) => results.has(result)),
    dates: min === undefined || max === undefined ? undefined : { min, max },
  };
};

/**
 * What a text's games are, at a glance (CTA-103, the import popup's file
 * info), from their tag-only rows: how many games and distinct players, the
 * events, the lowest and highest Elo either side had, and the earliest and
 * latest `Date` as the games write it (`1848`, `2023.07.30`) — ordered by the
 * days they could be ({@link dateBounds}). A span is absent when no game
 * carries its tag.
 */
export type CollectionMetadata = {
  games: number;
  players: number;
  events: string[];
  elo?: { min: number; max: number };
  dates?: { first: string; last: string };
};

export const collectionMetadataOf = (rows: readonly CollectionRow[]): CollectionMetadata => {
  const players = new Set<string>();
  const events = new Set<string>();
  let elo: { min: number; max: number } | undefined;
  let first: { date: string; day: string } | undefined;
  let last: { date: string; day: string } | undefined;
  for (const row of rows) {
    if (row.white !== undefined) players.add(row.white);
    if (row.black !== undefined) players.add(row.black);
    if (row.event !== undefined) events.add(row.event);
    for (const value of [row.whiteElo, row.blackElo]) {
      if (value === undefined) continue;
      elo = elo === undefined ? { min: value, max: value } : { min: Math.min(elo.min, value), max: Math.max(elo.max, value) };
    }
    const bounds = dateBounds(row.date);
    if (bounds !== undefined && row.date !== undefined) {
      if (first === undefined || bounds[0] < first.day) first = { date: row.date, day: bounds[0] };
      if (last === undefined || bounds[1] > last.day) last = { date: row.date, day: bounds[1] };
    }
  }
  return {
    games: rows.length,
    players: players.size,
    events: [...events].sort(collator.compare),
    elo,
    dates: first === undefined || last === undefined ? undefined : { first: first.date, last: last.date },
  };
};

/**
 * The `Event` every one of these games shares, when they do — what a
 * tournament export is called, and so a new collection's name
 * ({@link readCollectionText}'s `name`, over rows: the games an import keeps).
 */
export const sharedEventOf = (rows: readonly Pick<CollectionRow, "event">[]): string | undefined => {
  const events = new Set(rows.map((row) => row.event));
  const [event] = events;
  return events.size === 1 ? event : undefined;
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
type CollectionTextProblem = "empty" | "too-large" | "unreadable";

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

/**
 * One text brought in to become a collection (CTA-103, `/library/new`'s
 * import popup) — a picked `.pgn`, one `.pgn` of a zip, or a paste — cut into
 * games, each with its tag-only row, so the popup can describe and filter
 * them before any `chess.js` pass.
 */
export type CollectionImportFile = {
  /** The file's name (a zip entry's path); absent for a paste. */
  name?: string;
  /** Its stem — the name fallback; absent for a paste. */
  stem?: string;
  /** In bytes. */
  size: number;
  games: readonly string[];
  /** Each game's tag-only row (`collectionRowOf`, no `chess.js`), numbered from 1. */
  rows: readonly CollectionRow[];
};

/** What was brought in: the file picked (or the paste) and the texts in it. */
export type CollectionImportSource = {
  /** The picked file's name; absent for a paste. */
  name?: string;
  size: number;
  /** A zip's `.pgn` files, else the one text. */
  zip: boolean;
  files: readonly CollectionImportFile[];
};

/** A text read as one import file: its games and their tag-only rows, or why it is none. */
export const collectionImportFileOf = (
  text: string,
  size: number,
  name?: string,
  stem?: string,
): { file: CollectionImportFile; reading: CollectionReading } => {
  const reading = readCollectionText(text);
  const games = reading.ok ? reading.games : [];
  return {
    reading,
    file: { name, stem, size, games, rows: games.map((pgn, index) => collectionRowOf(pgn, index + 1)) },
  };
};
