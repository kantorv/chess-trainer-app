import { describe, expect, it } from "vitest";

import {
  collectionIdOfStem,
  collectionNameOfStem,
  collectionRowOf,
  collectionRowsOf,
  filteredRows,
  mainlinePlies,
  MAX_COLLECTION_CHARS,
  readCollectionText,
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
