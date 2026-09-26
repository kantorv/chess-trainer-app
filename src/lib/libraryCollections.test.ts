import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  activeFilterSummary,
  batchFolderNameOf,
  collectionIdOfStem,
  collectionImportFileOf,
  collectionNameOfStem,
  collectionRowOf,
  collectionFacetsOf,
  collectionRowsOf,
  collectionMetadataOf,
  dateBounds,
  openingLabelOf,
  filteredRows,
  mainlinePlies,
  MAX_COLLECTION_CHARS,
  readCollectionText,
  sharedEventOf,
  sortedRows,
} from "./libraryCollections";

const GAME = (tags: Record<string, string>, moves: string) =>
  `${Object.entries(tags)
    .map(([key, value]) => `[${key} "${value}"]`)
    .join("\n")}\n\n${moves}`;

const A = GAME(
  {
    Event: "Test Open",
    Round: "1.10",
    Date: "2023.07.30",
    White: "Carlsen,M",
    Black: "Nepo,I",
    Result: "1-0",
    WhiteElo: "2835",
    BlackElo: "2780",
    ECO: "C42",
    Opening: "Petrov",
    Variation: "Classical",
  },
  "1. e4 e5 2. Nf3 Nf6 3. Nxe5 {a comment} d6 (3... Nxe4? 4. Qe2) 4. Nf3 $1 Nxe4 1-0",
);
const B = GAME(
  { Event: "Test Open", Round: "1.9", Date: "1848.??.??", White: "Morphy, Paul", Black: "Anderssen", Result: "1/2-1/2", WhiteElo: "" },
  "1.d4 d5 2.c4 1/2-1/2",
);
const C = GAME({ Event: "Test Open", White: "Zed", Black: "Carlsen,M", Result: "0-1", Date: "????.??.??" }, "1... e5 0-1");

describe("mainlinePlies", () => {
  it("counts the mainline's moves and nothing else", () => {
    expect(mainlinePlies("1. e4 e5 2. Nf3 {c} Nc6 (2... d6 3. d4 (3. Bc4)) 3. Bb5 $1 a6 ; rest\n *")).toBe(6);
    expect(mainlinePlies("1.e4 e5 2.Nf3 1-0")).toBe(3);
    expect(mainlinePlies("")).toBe(0);
  });

  it("reads a movetext that starts with Black's move", () => {
    expect(mainlinePlies("12... Qd7 13. O-O-O *")).toBe(2);
  });
});

describe("collectionRowOf", () => {
  it("reads the table's columns off the tags, without chess.js", () => {
    expect(collectionRowOf(A, 1)).toEqual({
      number: 1,
      white: "Carlsen,M",
      whiteElo: 2835,
      black: "Nepo,I",
      blackElo: 2780,
      result: "1-0",
      date: "2023.07.30",
      round: "1.10",
      event: "Test Open",
      eco: "C42",
      opening: "Petrov, Classical",
      moves: 4,
    });
  });

  it("drops what a tag does not know", () => {
    const row = collectionRowOf(B, 2);
    expect(row.date).toBe("1848");
    expect(row.whiteElo).toBeUndefined();
    expect(row.eco).toBeUndefined();
    expect(collectionRowOf(C, 3).date).toBeUndefined();
    expect(collectionRowOf("1. e4 *", 4).result).toBe("*");
  });
});

describe("sorting and filtering the rows", () => {
  const rows = collectionRowsOf({ games: [A, B, C] });

  it("sorts rounds numerically and puts a missing value last either way", () => {
    expect(sortedRows(rows, "round", "asc").map((row) => row.number)).toEqual([2, 1, 3]);
    expect(sortedRows(rows, "round", "desc").map((row) => row.number)).toEqual([1, 2, 3]);
    expect(sortedRows(rows, "whiteElo", "desc").map((row) => row.number)).toEqual([1, 2, 3]);
    expect(sortedRows(rows, "white", "asc").map((row) => row.number)).toEqual([1, 2, 3]);
  });

  it("filters on every word, in any column, and on the result", () => {
    expect(filteredRows(rows, { text: "carlsen", result: "" }).map((r) => r.number)).toEqual([1, 3]);
    expect(filteredRows(rows, { text: "carlsen petrov", result: "" }).map((r) => r.number)).toEqual([1]);
    expect(filteredRows(rows, { text: "", result: "0-1" }).map((r) => r.number)).toEqual([3]);
    expect(filteredRows(rows, { text: "", result: "" })).toHaveLength(3);
  });
});

describe("the side panel's filters", () => {
  const rows = collectionRowsOf({ games: [A, B, C] });
  const numbers = (filter: Partial<Parameters<typeof filteredRows>[1]>) =>
    filteredRows(rows, { text: "", result: "", ...filter }).map((r) => r.number);

  it("finds a player's games, either side or the one asked for", () => {
    expect(numbers({ player: ["carlsen"] })).toEqual([1, 3]);
    expect(numbers({ player: ["Carlsen"], color: "white" })).toEqual([1]);
    expect(numbers({ player: ["carlsen"], color: "black" })).toEqual([3]);
    // A side alone narrows nothing.
    expect(numbers({ color: "black" })).toEqual([1, 2, 3]);
  });

  it("keeps a game any of several players is in, on the side asked for (CTA-95)", () => {
    // Two spellings of one player, or several players: a game is kept when
    // any name is in it.
    expect(numbers({ player: ["carlsen", "morphy"] })).toEqual([1, 2, 3]);
    expect(numbers({ player: ["nepo", "morphy"] })).toEqual([1, 2]);
    // A side narrows to the games any selected player had it.
    expect(numbers({ player: ["carlsen", "anderssen"], color: "black" })).toEqual([2, 3]);
    expect(numbers({ player: ["nepo", "zed"], color: "white" })).toEqual([3]);
    // A name no game carries narrows nothing on its own...
    expect(numbers({ player: ["kasparov"] })).toEqual([]);
    // ...but joins the others with OR.
    expect(numbers({ player: ["kasparov", "morphy"] })).toEqual([2]);
    // An empty list, or only blank names, narrows nothing.
    expect(numbers({ player: [] })).toEqual([1, 2, 3]);
    expect(numbers({ player: ["  "] })).toEqual([1, 2, 3]);
  });

  it("keeps the games whose line begins with the moves played, with the other filters on top", () => {
    const lined = rows.map((row, index) => ({
      ...row,
      line: [["e4", "e5", "Nf3"], ["e4", "c5"], ["d4"]][index],
    }));
    const by = (filter: Partial<Parameters<typeof filteredRows>[1]>) =>
      filteredRows(lined, { text: "", result: "", ...filter }).map((r) => r.number);
    expect(by({ line: [] })).toEqual([1, 2, 3]);
    expect(by({ line: ["e4"] })).toEqual([1, 2]);
    expect(by({ line: ["e4", "e5", "Nf3"] })).toEqual([1]);
    // Longer than a game's line: not a game that began that way.
    expect(by({ line: ["e4", "c5", "Nf3"] })).toEqual([]);
    expect(by({ line: ["e4"], player: ["carlsen"] })).toEqual([1]);
    // A row without a line (an old index) is out once a line is set.
    expect(numbers({ line: ["e4"] })).toEqual([]);
  });

  it("finds an opening by its ECO code, its name, or the label picked from the list", () => {
    expect(numbers({ opening: "petrov" })).toEqual([1]);
    expect(numbers({ opening: "C4" })).toEqual([1]);
    expect(numbers({ opening: "classical" })).toEqual([1]);
    expect(numbers({ opening: "C42 Petrov, Classical" })).toEqual([1]);
    expect(numbers({ opening: "sicilian" })).toEqual([]);
  });

  it("labels an opening with its ECO code first", () => {
    expect(openingLabelOf({ eco: "B90", opening: "Sicilian Defense: Najdorf Variation" })).toBe(
      "B90 Sicilian Defense: Najdorf Variation",
    );
    expect(openingLabelOf({ eco: "D12" })).toBe("D12");
    expect(openingLabelOf({ opening: "Petrov" })).toBe("Petrov");
    expect(openingLabelOf({})).toBeUndefined();
  });

  it("matches an event exactly", () => {
    expect(numbers({ event: "Test Open" })).toEqual([1, 2, 3]);
    expect(numbers({ event: "Test" })).toEqual([]);
  });

  it("keeps a game any of whose possible days is in range, and drops one with no date", () => {
    expect(numbers({ from: "2023-07-01" })).toEqual([1]);
    expect(numbers({ to: "1848-06-15" })).toEqual([2]);
    expect(numbers({ from: "1848-12-31", to: "1848-12-31" })).toEqual([2]);
    expect(numbers({ from: "2023-07-31" })).toEqual([]);
  });

  it("keeps a game only when both players' Elo is within the bounds, and drops one missing an Elo (CTA-103)", () => {
    const D = GAME({ White: "Amy", Black: "Bob", WhiteElo: "2100", BlackElo: "1900", Result: "*" }, "1. e4 *");
    const withD = collectionRowsOf({ games: [A, B, C, D] });
    const elo = (filter: { minElo?: number; maxElo?: number }) =>
      filteredRows(withD, { text: "", result: "", ...filter }).map((r) => r.number);
    expect(elo({})).toEqual([1, 2, 3, 4]);
    expect(elo({ minElo: 1900 })).toEqual([1, 4]);
    expect(elo({ minElo: 2000 })).toEqual([1]);
    expect(elo({ maxElo: 2100 })).toEqual([4]);
    expect(elo({ minElo: 2780, maxElo: 2835 })).toEqual([1]);
    expect(elo({ minElo: 2790 })).toEqual([]);
    // Inclusive at both ends, and either bound alone.
    expect(elo({ minElo: 1900, maxElo: 2100 })).toEqual([4]);
    expect(elo({ maxElo: 3000 })).toEqual([1, 4]);
  });

  it("reads a partial PGN date as the days it could be", () => {
    expect(dateBounds("2023.07.30")).toEqual(["2023-07-30", "2023-07-30"]);
    expect(dateBounds("1858.10")).toEqual(["1858-10-01", "1858-10-31"]);
    expect(dateBounds("1848")).toEqual(["1848-01-01", "1848-12-31"]);
    expect(dateBounds("2023.??.15")).toEqual(["2023-01-15", "2023-12-15"]);
    expect(dateBounds(undefined)).toBeUndefined();
    expect(dateBounds("????")).toBeUndefined();
  });

  it("lists every opening of a real 7,818-game collection, ECO first, in ECO order", () => {
    const reading = readCollectionText(
      readFileSync(join(process.cwd(), "src/test/fixtures/pgn/Carlsen.pgn"), "utf8"),
    );
    if (!reading.ok) throw new Error("the fixture did not read");
    expect(reading.games).toHaveLength(7818);
    const carlsen = collectionRowsOf({ games: reading.games });
    const { openings, players, events } = collectionFacetsOf(carlsen);

    // Complete: every game's label is offered, once — not a first page.
    const labels = new Set(carlsen.map((row) => openingLabelOf(row)).filter((label) => label !== undefined));
    expect(openings).toHaveLength(labels.size);
    expect(new Set(openings)).toEqual(labels);
    expect(openings.length).toBeGreaterThan(400);
    // In ECO order, A to E.
    const ecos = openings.map((label) => label.slice(0, 3));
    expect(ecos[0]).toMatch(/^A0/);
    expect(ecos[ecos.length - 1]).toMatch(/^E9/);
    expect(ecos).toEqual([...ecos].sort());
    expect(players).toContain("Carlsen,Magnus");
    expect(events.length).toBeGreaterThan(600);
  });

  it("offers only what the games carry", () => {
    expect(collectionFacetsOf(rows)).toEqual({
      players: ["Anderssen", "Carlsen,M", "Morphy, Paul", "Nepo,I", "Zed"],
      openings: ["C42 Petrov, Classical"],
      events: ["Test Open"],
      results: ["1-0", "0-1", "1/2-1/2"],
      dates: { min: "1848-01-01", max: "2023-07-30" },
    });
    const bare = collectionRowsOf({ games: ["1. e4 *"] });
    expect(collectionFacetsOf(bare)).toEqual({ players: [], openings: [], events: [], results: ["*"], dates: undefined });
  });
});

describe("a text's metadata at a glance (CTA-103)", () => {
  it("counts the games, players and events, and spans the Elos and the dates", () => {
    expect(collectionMetadataOf(collectionRowsOf({ games: [A, B, C] }))).toEqual({
      games: 3,
      players: 5,
      events: ["Test Open"],
      elo: { min: 2780, max: 2835 },
      dates: { first: "1848", last: "2023.07.30" },
    });
  });

  it("orders the dates by the days they could be, and leaves out a span no game carries", () => {
    const partial = collectionRowsOf({
      games: [
        GAME({ Date: "1858.10.??", Event: "B" }, "1. e4 *"),
        GAME({ Date: "1858.10.05", Event: "A" }, "1. e4 *"),
        GAME({ Date: "1858", Event: "A" }, "1. e4 *"),
      ],
    });
    expect(collectionMetadataOf(partial)).toMatchObject({ events: ["A", "B"], dates: { first: "1858", last: "1858" } });
    expect(collectionMetadataOf(collectionRowsOf({ games: ["1. e4 *"] }))).toEqual({
      games: 1,
      players: 0,
      events: [],
      elo: undefined,
      dates: undefined,
    });
  });

  it("names the Event every game shares, and none when they differ or one lacks it", () => {
    expect(sharedEventOf([{ event: "Club" }, { event: "Club" }])).toBe("Club");
    expect(sharedEventOf([{ event: "Club" }, { event: "Open" }])).toBeUndefined();
    expect(sharedEventOf([{ event: "Club" }, {}])).toBeUndefined();
    expect(sharedEventOf([])).toBeUndefined();
  });
});

describe("naming a shipped file", () => {
  it.each([
    ["WorldCup2023", "World Cup 2023", "worldcup2023"],
    ["Bucharest2023", "Bucharest 2023", "bucharest2023"],
    ["Morphy", "Morphy", "morphy"],
    ["candidates_2024", "Candidates 2024", "candidates-2024"],
  ])("%s is %s at /library/%s", (stem, name, id) => {
    expect(collectionNameOfStem(stem)).toBe(name);
    expect(collectionIdOfStem(stem)).toBe(id);
  });
});

describe("readCollectionText", () => {
  it("cuts a text into its games and names it by the Event they share", () => {
    const reading = readCollectionText(`${A}\r\n\r\n${B}\n\n${C}\n`);
    expect(reading).toMatchObject({ ok: true, name: "Test Open" });
    expect(reading.ok && reading.games).toHaveLength(3);
  });

  it("gives no name when the games disagree", () => {
    const reading = readCollectionText(`${A}\n\n${GAME({ Event: "Other" }, "1. e4 *")}`);
    expect(reading.ok && reading.name).toBeUndefined();
  });

  it("refuses an empty, an unreadable and an oversized text", () => {
    expect(readCollectionText("  \n")).toEqual({ ok: false, problem: "empty" });
    expect(readCollectionText("just words")).toEqual({ ok: false, problem: "unreadable" });
    expect(readCollectionText(`${A}\n${" ".repeat(MAX_COLLECTION_CHARS)}`)).toEqual({
      ok: false,
      problem: "too-large",
    });
  });
});

describe("collectionImportFileOf — a text for the import popup (CTA-103)", () => {
  it("cuts the text into games with their tag-only rows, numbered from 1", () => {
    const { reading, file } = collectionImportFileOf(`${A}\n\n${B}`, 123, "x/Test.pgn", "Test");
    expect(reading).toMatchObject({ ok: true, name: "Test Open" });
    expect(file).toMatchObject({ name: "x/Test.pgn", stem: "Test", size: 123, games: [A, B] });
    expect(file.rows).toEqual([collectionRowOf(A, 1), collectionRowOf(B, 2)]);
  });

  it("holds no game for a text that reads none, and says why", () => {
    const { reading, file } = collectionImportFileOf("hello", 5);
    expect(reading).toEqual({ ok: false, problem: "unreadable" });
    expect(file).toEqual({ name: undefined, stem: undefined, size: 5, games: [], rows: [] });
  });
});

describe("batchFolderNameOf — where the table's Analyse files a batch (CTA-77)", () => {
  const labels = { games: "12 games", white: "white", black: "black" };
  const none = { text: "", result: "" };

  it("is the collection and the count when no filter is on", () => {
    expect(batchFolderNameOf("World Cup 2023", none, labels, 100)).toBe("World Cup 2023 — 12 games");
  });

  it("adds the filters that are on, in a fixed order", () => {
    expect(
      batchFolderNameOf(
        "World Cup 2023",
        {
          text: " najdorf ",
          result: "1-0",
          player: ["Carlsen"],
          color: "white",
          opening: "B90 Sicilian Defense: Najdorf Variation",
          event: "FIDE World Cup 2023",
          from: "2023-08-01",
          to: "",
          line: ["e4", "c5", "Nf3"],
        },
        labels,
        200,
      ),
    ).toBe(
      'World Cup 2023 — 12 games (Carlsen, white, B90, FIDE World Cup 2023, 2023-08-01–…, 1-0, 1.e4 c5 2.Nf3, "najdorf")',
    );
  });

  it("lists several players as one phrase — the names joined, then the side", () => {
    expect(
      activeFilterSummary({ ...none, player: ["Carlsen,Magnus", " Carlsen,M "], color: "white" }, labels),
    ).toEqual(["Carlsen,Magnus / Carlsen,M", "white"]);
  });

  it("names a side only with a player, and an opening typed without a code as typed", () => {
    expect(activeFilterSummary({ ...none, color: "black", opening: "najdorf" }, labels)).toEqual([
      "najdorf",
    ]);
    expect(activeFilterSummary({ ...none, player: ["Nepo"], color: "black" }, labels)).toEqual([
      "Nepo",
      "black",
    ]);
  });

  it("cuts the filter summary, never the collection or the count, to fit", () => {
    const filter = { ...none, player: ["Carlsen"], event: "A very long event name ".repeat(6).trim() };
    const name = batchFolderNameOf("World Cup 2023", filter, labels, 100);
    expect(name).toHaveLength(100);
    expect(name.startsWith("World Cup 2023 — 12 games (Carlsen, A very long")).toBe(true);
    expect(name.endsWith("…)")).toBe(true);
  });

  it("drops a summary there is no room left for, and cuts only a name too long on its own", () => {
    const long = "A collection with a name that goes on for a long while";
    expect(batchFolderNameOf(long, { ...none, player: ["Carlsen"] }, labels, 70)).toBe(
      `${long} — 12 games`,
    );
    const cut = batchFolderNameOf("x".repeat(120), none, labels, 100);
    expect(cut).toHaveLength(100);
    expect(cut.endsWith("… — 12 games")).toBe(true);
  });
});
