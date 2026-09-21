import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { decodeCollectionIndex, encodeCollectionIndex, textHash } from "./collectionIndex";
import { collectionGamesOf } from "./libraryCollections";
import {
  findShippedCollection,
  peekShippedGames,
  peekShippedRows,
  shippedCollections,
  shippedCollectionsOf,
} from "./shippedCollections";

/**
 * The shipped collections: what `node scripts/wirepgn.js` wired into
 * `src/data/library/` — and the guard that keeps the folder honest, so a file
 * dropped in unwired, or edited after it was indexed, fails here rather than
 * showing a table that disagrees with its games.
 */

const FOLDER = join(process.cwd(), "src/data/library");
const manifest = JSON.parse(readFileSync(join(FOLDER, "manifest.json"), "utf8")) as {
  collections: { id: string; name: string; pgn: string; index: string; games: number; hash: string }[];
};

describe("the wired folder", () => {
  it("has every .pgn wired — run `node scripts/wirepgn.js <file.pgn>` for one that is not", () => {
    const pgns = readdirSync(FOLDER).filter((file) => file.endsWith(".pgn")).sort();
    expect(manifest.collections.map((entry) => entry.pgn).sort()).toEqual(pgns);
  });

  it.each(manifest.collections.map((entry) => [entry.id, entry] as const))(
    "%s: its PGN, index and manifest entry agree — re-wire it if not",
    (_id, entry) => {
      const text = readFileSync(join(FOLDER, entry.pgn), "utf8");
      expect(textHash(text)).toBe(entry.hash);
      const index = decodeCollectionIndex(JSON.parse(readFileSync(join(FOLDER, entry.index), "utf8")));
      expect(index?.hash).toBe(entry.hash);
      expect(index?.rows).toHaveLength(entry.games);
      expect(collectionGamesOf(text)).toHaveLength(entry.games);
    },
  );
});

describe("the shipped collections", () => {
  it("are the three demos, by name, counted without a fetch", () => {
    expect(shippedCollections.map((entry) => [entry.id, entry.name, entry.count])).toEqual([
      ["bucharest2023", "Bucharest 2023", 45],
      ["morphy", "Morphy", 211],
      ["worldcup2023", "World Cup 2023", 674],
    ]);
    expect(peekShippedRows("bucharest2023")).toBeUndefined();
  });

  it.each([
    ["worldcup2023", 674],
    ["bucharest2023", 45],
    ["morphy", 211],
  ])("%s: its index is its table's rows, and its PGN its games", async (id, count) => {
    const entry = findShippedCollection(id)!;
    const rows = await entry.loadRows();
    expect(rows).toHaveLength(count);
    expect(rows.map((row) => row.number)).toEqual(Array.from({ length: count }, (_, index) => index + 1));
    expect(rows.every((row) => row.white !== undefined && row.moves > 0 && !row.unreadable)).toBe(true);
    // Fetched once, read synchronously after that.
    expect(peekShippedRows(id)).toBe(rows);
    expect(await entry.loadRows()).toBe(rows);

    const games = await entry.loadGames();
    expect(games).toHaveLength(count);
    expect(peekShippedGames(id)).toBe(games);
  });

  it("fills an opening in from the book where the file's tags have none", async () => {
    // Morphy's games carry an ECO and no Opening tag.
    const rows = await findShippedCollection("morphy")!.loadRows();
    expect(rows.every((row) => row.opening !== undefined)).toBe(true);
  });
});

describe("reading a manifest", () => {
  const PGN = '[Event "x"]\n[White "A"]\n[Black "B"]\n\n1. e4 *\n\n[Event "x"]\n\n1. d4 *';
  const INDEX = encodeCollectionIndex({ hash: "", rows: [{ result: "*", moves: 1 }, { result: "*", moves: 1 }] });
  const loaders = (files: Record<string, string>) =>
    Object.fromEntries(Object.entries(files).map(([name, text]) => [`../data/library/${name}`, () => Promise.resolve(text)]));

  it("lists its entries by name, and loads what they name", async () => {
    const entries = shippedCollectionsOf(
      {
        collections: [
          { id: "t-zed", name: "Zed", pgn: "Z.pgn", index: "Z.index.json", games: 2, hash: "" },
          { id: "t-amy", name: "Amy", pgn: "A.pgn", index: "A.index.json", games: 2, hash: "" },
        ],
      },
      loaders({ "Z.pgn": PGN, "A.pgn": PGN }),
      loaders({ "Z.index.json": INDEX, "A.index.json": INDEX }),
    );
    expect(entries.map((entry) => entry.id)).toEqual(["t-amy", "t-zed"]);
    expect(await entries[0].loadGames()).toHaveLength(2);
    expect((await entries[0].loadRows()).map((row) => row.number)).toEqual([1, 2]);
  });

  it("leaves out a malformed entry, one whose files are missing, and a taken id", () => {
    const entries = shippedCollectionsOf(
      {
        collections: [
          { id: "t-one", name: "One", pgn: "A.pgn", index: "A.index.json", games: 2 },
          { id: "t-one", name: "Again", pgn: "A.pgn", index: "A.index.json", games: 2 },
          { id: "t-gone", name: "Gone", pgn: "Gone.pgn", index: "Gone.index.json", games: 2 },
          { name: "No id" },
        ],
      },
      loaders({ "A.pgn": PGN }),
      loaders({ "A.index.json": INDEX }),
    );
    expect(entries.map((entry) => entry.name)).toEqual(["One"]);
    expect(shippedCollectionsOf(null, {}, {})).toEqual([]);
  });

  it("refuses an index that does not match its entry", async () => {
    const [entry] = shippedCollectionsOf(
      { collections: [{ id: "t-bad", name: "Bad", pgn: "A.pgn", index: "A.index.json", games: 5 }] },
      loaders({ "A.pgn": PGN }),
      loaders({ "A.index.json": INDEX }),
    );
    await expect(entry.loadRows()).rejects.toThrow("not the index");
    expect(peekShippedRows("t-bad")).toBeNull();
  });
});
