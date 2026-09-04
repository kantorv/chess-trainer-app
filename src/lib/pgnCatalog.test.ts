import { describe, expect, it } from "vitest";

import {
  allCategories,
  findLibraryCategory,
  itemsInLibraryCategory,
  resolveLibraryPath,
} from "./libraryCatalog";
import { pgnCatalog } from "./pgnCatalog";

/**
 * The **shipped** User PGNs library — the glob, the manifest and the three
 * `.pgn` files under `src/data/pgn/`, as they actually load.
 *
 * `pgnLibrary.test.ts` is where the loader's behaviour is pinned down against
 * fixtures. What is asserted here is that the real files come through it: that
 * every game in them parses, that the manifest names two of the studies, and —
 * the promise the section rests on — that the file the manifest says nothing
 * about is listed anyway.
 *
 * The three shipped studies sit at the **top level** of the section: the
 * manifest renames and orders them but no longer nests them under a "Studies"
 * wrapper, so each file is its own top-level folder.
 */
const ROSETTES = "lichess-study-queen-vs-rook-rosettes-by-methurst-2021-07-08";
const PUZZLES = "lichess-study-puzzles-custom-set-1-by-lalala732-2026-05-03";
const GAMES = "lichess-study-zwischenzug-best-games-part1-by-lalala732-2026-04-12";

describe("the shipped User PGNs catalog", () => {
  it("loads every file with nothing to report", () => {
    expect(pgnCatalog.problems).toEqual([]);
  });

  it("finds all three files, each a top-level folder of its own", () => {
    const paths = allCategories(pgnCatalog).map((category) => category.path);

    expect(paths).toContain(ROSETTES);
    expect(paths).toContain(PUZZLES);
    expect(paths).toContain(GAMES);
    // No "Studies" wrapper any more — every path is a single segment.
    expect(paths.every((path) => !path.includes("/"))).toBe(true);
  });

  it("names a folder from the manifest, and one the manifest did not label from its own file", () => {
    expect(findLibraryCategory(ROSETTES, pgnCatalog)?.label).toEqual({
      en: "Queen vs Rook, Rosettes",
      he: "מלכה נגד צריח, רוזטות",
    });

    /*
      The manifest nests and orders this one but gives it no `label`, so its name
      comes from its own `StudyName` tag — the shipped proof that a manifest
      entry is a set of *overrides* rather than a registration, and that a file
      is named from itself for anything the manifest leaves out.
    */
    expect(findLibraryCategory(GAMES, pgnCatalog)?.label).toEqual({
      en: "Zwischenzug best games [part1]",
    });
  });

  it("holds every game in the three files", () => {
    // 18 rosette chapters + 28 puzzle chapters + 9 annotated master games.
    expect(pgnCatalog.items).toHaveLength(55);
    expect(pgnCatalog.items.every((item) => item.kind === "game")).toBe(true);
    // A game is not a position, so the projection the other two sections read is
    // empty for this one.
    expect(pgnCatalog.positions).toEqual([]);
  });

  it("gives every game a unique, non-empty id and name", () => {
    const ids = pgnCatalog.items.map((item) => `${item.category}/${item.id}`);

    expect(new Set(ids).size).toBe(ids.length);
    for (const item of pgnCatalog.items) {
      if (item.kind !== "game") throw new Error("expected a game");
      expect(item.id).not.toBe("");
      expect(item.name.en).not.toBe("");
    }
  });

  it("keeps a chapter that is a position and a comment, with no moves at all", () => {
    /*
      A lichess study chapter need not have any movetext — some are a set-up
      position and prose. It is still an item: it previews its `FEN` tag and its
      move list is simply empty, which `useGameNavigation` already handles by
      clamping every ply to 0. Asserting "every game has moves" would have made
      shipping one of these a test failure rather than content.
    */
    const moveless = pgnCatalog.items.filter(
      (item) => item.kind === "game" && item.game.moves.length === 0,
    );

    expect(moveless.length).toBeGreaterThan(0);
  });

  it("names every game from its own chapter title", () => {
    const games = itemsInLibraryCategory(GAMES, pgnCatalog);
    expect(games).toHaveLength(9);
    expect(games[0].name.en).toBe("Jose Raul Capablanca - Savielly Tartakower");

    const chapters = itemsInLibraryCategory(ROSETTES, pgnCatalog);
    expect(chapters).toHaveLength(18);
    expect(chapters[0].name.en).toBe("Chapter 1");
  });

  it("carries the tag pairs a card footer reads, on the annotated games", () => {
    // `gameSummary.ts` shows these; a study chapter that is a position and a
    // comment has none of them, and its footer collapses to name and length.
    const [first] = itemsInLibraryCategory(GAMES, pgnCatalog);
    if (first.kind !== "game") throw new Error("expected a game");

    expect(first.game.headers).toMatchObject({
      Event: "New York",
      Date: "1924.03.23",
      Result: "1-0",
      ECO: "A40",
      Opening: "Horwitz Defense",
    });
  });

  it("resolves every shipped game from its own URL segments", () => {
    // What `/pgn/*` does on every request: one splat, however deep the manifest
    // nested the folder.
    for (const item of pgnCatalog.items) {
      const segments = `${item.category}/${item.id}`.split("/");

      expect(resolveLibraryPath(segments, pgnCatalog)).toMatchObject({
        kind: "item",
        item: { kind: "game", id: item.id },
      });
    }
  });
});
