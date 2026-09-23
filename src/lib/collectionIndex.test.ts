import { describe, expect, it, vi } from "vitest";

import {
  buildCollectionIndex,
  buildCollectionIndexAsync,
  decodeCollectionIndex,
  encodeCollectionIndex,
  indexedRowOf,
  numberedRows,
  textHash,
  type OpeningLookup,
} from "./collectionIndex";

/*
  A collection's index (lib/collectionIndex.ts): a row per game, its tags and
  what the `chess.js` pass adds — the length off the parsed mainline, the
  unreadable flag, the opening from the book where the tags leave it out —
  and the file format it travels in.
*/

const PETROV =
  '[Event "Open"]\n[White "Carlsen"]\n[Black "Nepo"]\n[Result "1-0"]\n[WhiteElo "2835"]\n[ECO "C42"]\n[Opening "Petrov"]\n\n1. e4 e5 2. Nf3 Nf6 (2... Nc6) 3. Nxe5 1-0';
const UNTAGGED = '[Event "Open"]\n[White "Morphy"]\n[Black "Anderssen"]\n[Result "*"]\n\n1. e4 e5 2. Nf3 *';
const BROKEN = '[Event "Open"]\n[White "A"]\n[Black "B"]\n[Result "*"]\n\n1. e4 e5 2. Ke3 *';

/** A book that knows 1. e4 e5 2. Nf3 and 1. e4 e5, by the position's board. */
const lookup: OpeningLookup = (fens) => {
  const boards = fens.map((fen) => fen.split(" ")[0]);
  if (boards.includes("rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R")) {
    return { eco: "C40", name: "King's Knight Opening" };
  }
  return undefined;
};

describe("a game's indexed row", () => {
  it("is its tags, with the length counted off the parsed mainline", () => {
    expect(indexedRowOf(PETROV)).toEqual({
      white: "Carlsen",
      whiteElo: 2835,
      black: "Nepo",
      result: "1-0",
      event: "Open",
      eco: "C42",
      opening: "Petrov",
      moves: 3,
      line: ["e4", "e5", "Nf3", "Nf6", "Nxe5"],
    });
  });

  it("keeps the whole mainline as its line, from the standard start only", () => {
    const long = `[Event "Long"]\n[Result "*"]\n\n${"1. Nf3 Nf6 2. Ng1 Ng8 ".repeat(10)}*`;
    const row = indexedRowOf(long);
    expect(row.moves).toBe(20); // 40 plies
    expect(row.line).toHaveLength(40); // the whole game — CTA-92 took the cap off
    expect(row.line?.slice(0, 4)).toEqual(["Nf3", "Nf6", "Ng1", "Ng8"]);
    // A set-up position cannot join a tree from the standard start.
    const setUp =
      '[Event "Study"]\n[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]\n[Result "*"]\n\n1. e4 Kd7 *';
    expect(indexedRowOf(setUp)).toMatchObject({ moves: 1 });
    expect(indexedRowOf(setUp).unreadable).toBeUndefined();
    expect(indexedRowOf(setUp).line).toBeUndefined();
    expect(indexedRowOf(BROKEN).line).toBeUndefined();
    expect(indexedRowOf('[Event "Empty"]\n[Result "*"]\n\n*').line).toBeUndefined();
  });

  it("fills the opening in from the book when the tags leave it out", () => {
    expect(indexedRowOf(UNTAGGED, lookup)).toMatchObject({
      eco: "C40",
      opening: "King's Knight Opening",
    });
    // A tag the game carries always wins.
    expect(indexedRowOf(PETROV, lookup)).toMatchObject({ eco: "C42", opening: "Petrov" });
    // No book, nothing filled in.
    expect(indexedRowOf(UNTAGGED).eco).toBeUndefined();
  });

  it("flags a game that will not parse, keeping its tags", () => {
    const row = indexedRowOf(BROKEN, lookup);
    expect(row).toMatchObject({ white: "A", black: "B", unreadable: true });
    expect(indexedRowOf(PETROV).unreadable).toBeUndefined();
  });
});

describe("indexing a collection", () => {
  it("makes a row per game in order, reporting its progress", () => {
    const progress = vi.fn();
    const index = buildCollectionIndex([PETROV, BROKEN, UNTAGGED], { lookup, hash: "abc", onProgress: progress });
    expect(index.hash).toBe("abc");
    expect(index.rows.map((row) => row.white)).toEqual(["Carlsen", "A", "Morphy"]);
    expect(progress).toHaveBeenLastCalledWith(3, 3);
    expect(numberedRows(index.rows).map((row) => row.number)).toEqual([1, 2, 3]);
  });

  it("makes the same rows when yielding between batches, and can be cancelled", async () => {
    const games = [PETROV, BROKEN, UNTAGGED];
    expect(await buildCollectionIndexAsync(games, { lookup, batch: 2 })).toEqual(
      buildCollectionIndex(games, { lookup }),
    );
    const controller = new AbortController();
    controller.abort();
    await expect(buildCollectionIndexAsync(games, { signal: controller.signal })).rejects.toThrow(
      "cancelled",
    );
  });
});

describe("the index file", () => {
  it("round-trips, one row per line", () => {
    const index = buildCollectionIndex([PETROV, BROKEN, UNTAGGED], { lookup, hash: "1234abcd" });
    const text = encodeCollectionIndex(index);
    expect(text.split("\n").filter((line) => line.startsWith("["))).toHaveLength(3);
    expect(decodeCollectionIndex(JSON.parse(text))).toEqual(index);
    expect(decodeCollectionIndex(JSON.parse(encodeCollectionIndex({ hash: "", rows: [] })))).toEqual({
      hash: "",
      rows: [],
    });
  });

  it("reads columns by name, so an added or unknown column does not break it", () => {
    const file = {
      format: "chessapp.collectionIndex",
      version: 1,
      hash: "",
      count: 1,
      columns: ["moves", "future", "white"],
      rows: [[12, "whatever", "Tal"]],
    };
    expect(decodeCollectionIndex(file)).toEqual({ hash: "", rows: [{ white: "Tal", moves: 12, result: "*" }] });
  });

  it("writes a line as its SAN joined by spaces, and reads a file from before the column as no lines", () => {
    const text = encodeCollectionIndex(buildCollectionIndex([PETROV, BROKEN]));
    const file = JSON.parse(text);
    expect(file.columns).toContain("line");
    expect(file.rows[0][file.columns.indexOf("line")]).toBe("e4 e5 Nf3 Nf6 Nxe5");
    expect(file.rows[1][file.columns.indexOf("line")]).toBeNull();
    expect(decodeCollectionIndex(file)?.rows[0].line).toEqual(["e4", "e5", "Nf3", "Nf6", "Nxe5"]);

    const old = {
      ...file,
      columns: file.columns.filter((column: string) => column !== "line"),
      rows: file.rows.map((row: unknown[]) => row.slice(0, -1)),
    };
    const rows = decodeCollectionIndex(old)?.rows;
    expect(rows?.[0]).toMatchObject({ white: "Carlsen", moves: 3 });
    expect(rows?.every((row) => row.line === undefined)).toBe(true);
  });

  it("refuses what is not an index", () => {
    const good = JSON.parse(encodeCollectionIndex(buildCollectionIndex([PETROV])));
    expect(decodeCollectionIndex(null)).toBeUndefined();
    expect(decodeCollectionIndex({ ...good, format: "other" })).toBeUndefined();
    expect(decodeCollectionIndex({ ...good, version: 2 })).toBeUndefined();
    expect(decodeCollectionIndex({ ...good, count: 5 })).toBeUndefined();
  });
});

describe("textHash", () => {
  it("tells texts apart and is stable", () => {
    expect(textHash("")).toBe("811c9dc5");
    expect(textHash(PETROV)).toBe(textHash(PETROV));
    expect(textHash(PETROV)).not.toBe(textHash(`${PETROV} `));
    expect(textHash(PETROV)).toMatch(/^[0-9a-f]{8}$/);
  });

  it("reads every line ending as a newline, so a Windows checkout is the same file", () => {
    expect(textHash("a\r\nb\rc\n")).toBe(textHash("a\nb\nc\n"));
  });
});
