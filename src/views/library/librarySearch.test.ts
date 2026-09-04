import { describe, expect, it } from "vitest";

import type { LibraryGame, LibraryItem, LibraryPosition } from "../../lib/libraryCatalog";
import { parsePgnGames } from "../../lib/pgn";
import { filterLibraryItems, searchTextOf } from "./librarySearch";

/*
  Fixtures rather than the shipped catalogs: what the filter has to get right is
  the *shape* of an item, and a data edit must not be able to fail this file.
  The section tests below it assert the real libraries render.
*/
const position = (
  id: string,
  name: { en: string; he?: string },
  description?: { en: string },
): LibraryPosition => ({
  kind: "position",
  id,
  category: "basic",
  name,
  ...(description !== undefined ? { description } : {}),
  fen: "8/8/8/8/8/5k2/6q1/7K w - - 0 1",
});

const gameOf = (pgn: string, id: string, name: { en: string }): LibraryGame => ({
  kind: "game",
  id,
  category: "studies",
  name,
  pgn,
  game: parsePgnGames(pgn)[0],
});

const capablanca = gameOf(
  `[Event "New York"]
[Date "1924.03.23"]
[White "Jose Raul Capablanca"]
[Black "Savielly Tartakower"]
[Result "1-0"]
[ECO "A40"]
[Opening "Horwitz Defense"]

1. d4 e6 2. Nf3 f5 1-0`,
  "capablanca-tartakower",
  { en: "Chapter 3" },
);

describe("searchTextOf", () => {
  it("is the item's name, in the language the card is showing it in", () => {
    const item = position("lucena", { en: "Lucena position", he: "עמדת לוצ'נה" });

    expect(searchTextOf(item, "en")).toContain("lucena position");
    expect(searchTextOf(item, "he")).toContain("עמדת לוצ'נה");
  });

  it("includes the description, which the detail page shows and the card does not", () => {
    const item = position(
      "philidor",
      { en: "Philidor position" },
      { en: "The third-rank defense." },
    );

    expect(searchTextOf(item, "en")).toContain("third-rank defense");
  });

  it("includes a game's players even when its name never mentions them", () => {
    /*
      The one thing deliberately searchable that the card does not print: a
      lichess chapter is named "Chapter 3", and the players are exactly what a
      reader looks it up by.
    */
    const text = searchTextOf(capablanca, "en");

    expect(text).toContain("chapter 3");
    expect(text).toContain("capablanca");
    expect(text).toContain("tartakower");
  });

  it("includes the facts the game's own footer prints", () => {
    const text = searchTextOf(capablanca, "en");

    expect(text).toContain("new york, 1924");
    expect(text).toContain("horwitz defense");
    expect(text).toContain("a40");
    expect(text).toContain("1-0");
  });
});

describe("filterLibraryItems", () => {
  const items: readonly LibraryItem[] = [
    position("lucena", { en: "Lucena position" }),
    position("philidor", { en: "Philidor position" }),
    capablanca,
  ];

  it("returns the list itself when there is nothing to filter by", () => {
    // By reference: clearing the box restores exactly what was there, and costs
    // no work on a category of a hundred cards.
    expect(filterLibraryItems(items, "", "en")).toBe(items);
    expect(filterLibraryItems(items, "   ", "en")).toBe(items);
  });

  it("matches part of a name, ignoring case", () => {
    expect(filterLibraryItems(items, "LUCE", "en").map((item) => item.id)).toEqual([
      "lucena",
    ]);
  });

  it("keeps the catalog's order", () => {
    expect(filterLibraryItems(items, "position", "en").map((item) => item.id)).toEqual([
      "lucena",
      "philidor",
    ]);
  });

  it("requires every word, in any order", () => {
    // A single-substring match would find neither of these.
    expect(
      filterLibraryItems(items, "capablanca 1924", "en").map((item) => item.id),
    ).toEqual(["capablanca-tartakower"]);
    expect(
      filterLibraryItems(items, "1924 capablanca", "en").map((item) => item.id),
    ).toEqual(["capablanca-tartakower"]);
  });

  it("returns nothing for a query nothing carries", () => {
    expect(filterLibraryItems(items, "zugzwang", "en")).toEqual([]);
  });
});
