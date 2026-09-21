import { describe, expect, it } from "vitest";

import { collectionRowsOf } from "./libraryCollections";
import {
  findShippedCollection,
  loadedShippedCollection,
  shippedCollections,
  shippedCollectionsOf,
} from "./shippedCollections";

/**
 * The shipped collections: every `.pgn` under `src/data/library/` is one, and
 * nothing else has to change for a new one to appear.
 */

describe("the shipped collections", () => {
  it("are exactly the three demos, by name", () => {
    expect(shippedCollections.map((entry) => [entry.id, entry.name])).toEqual([
      ["bucharest2023", "Bucharest 2023"],
      ["morphy", "Morphy"],
      ["worldcup2023", "World Cup 2023"],
    ]);
  });

  it.each([
    ["worldcup2023", 674],
    ["bucharest2023", 45],
    ["morphy", 211],
  ])("%s holds %i games, each a row with players and a length", async (id, count) => {
    const collection = await findShippedCollection(id)!.load();
    expect(collection).toMatchObject({ id, source: "shipped" });
    expect(collection.games).toHaveLength(count);
    // Fetched once, and read synchronously after that.
    expect(loadedShippedCollection(id)).toBe(collection);
    expect(await findShippedCollection(id)!.load()).toBe(collection);

    const rows = collectionRowsOf(collection);
    expect(rows.every((row) => row.white !== undefined && row.black !== undefined)).toBe(true);
    expect(rows.every((row) => row.moves > 0)).toBe(true);
  });
});

describe("dropping a file in", () => {
  it("is a collection named from the file, with no other change", async () => {
    const entries = shippedCollectionsOf({
      "../data/library/Candidates_2024.pgn": () =>
        Promise.resolve('[White "A"]\n[Black "B"]\n\n1. e4 *\n\n[Event "x"]\n\n1. d4 *'),
      "../data/library/Morphy.pgn": () => Promise.resolve("1. e4 *"),
    });
    expect(entries.map((entry) => [entry.id, entry.name])).toEqual([
      ["candidates-2024", "Candidates 2024"],
      ["morphy", "Morphy"],
    ]);
    expect((await entries[0].load()).games).toHaveLength(2);
  });

  it("leaves a second file with a taken slug out rather than shadowing the first", () => {
    const entries = shippedCollectionsOf({
      "../data/library/Morphy.pgn": () => Promise.resolve(""),
      "../data/library/morphy.pgn": () => Promise.resolve(""),
    });
    expect(entries).toHaveLength(1);
  });
});
