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
 * every game in them parses, that the manifest nests and names the two studies,
 * and — the promise the section rests on — that the file the manifest says
 * nothing about is listed anyway.
 */
describe("the shipped User PGNs catalog", () => {
  it("loads every file with nothing to report", () => {
    expect(pgnCatalog.problems).toEqual([]);
  });

  it("finds all three files, the unmentioned one included", () => {
    const paths = allCategories(pgnCatalog).map((category) => category.path);

    expect(paths).toContain("studies");
    expect(paths).toContain("studies/lichess-study-queen-vs-rook-rosettes-by-methurst-2021-07-08");
    expect(paths).toContain("studies/lichess-study-puzzles-custom-set-1-by-lalala732-2026-05-03");
    // No entry in `src/data/pgn.json` at all — and still a folder of its own.
    expect(paths).toContain("chess-com-games-2026-08-30");
  });

  it("names a folder from the manifest, and an unmentioned one from its file", () => {
    expect(
      findLibraryCategory(
        "studies/lichess-study-queen-vs-rook-rosettes-by-methurst-2021-07-08",
        pgnCatalog,
      )?.label,
    ).toEqual({ en: "Queen vs Rook, Rosettes", he: "מלכה נגד צריח, רוזטות" });

    expect(findLibraryCategory("chess-com-games-2026-08-30", pgnCatalog)?.label).toEqual({
      en: "Chess com games 2026-08-30",
    });
  });

  it("holds every game in the three files", () => {
    // 9 chess.com games + 18 study chapters + 28 puzzle chapters.
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

  it("names a chess.com game by its players and a chapter by its title", () => {
    const played = itemsInLibraryCategory("chess-com-games-2026-08-30", pgnCatalog);
    expect(played).toHaveLength(9);
    expect(played[0].name.en).toBe("AlbertSimTL – lalala732 (0-1)");

    const chapters = itemsInLibraryCategory(
      "studies/lichess-study-queen-vs-rook-rosettes-by-methurst-2021-07-08",
      pgnCatalog,
    );
    expect(chapters).toHaveLength(18);
    expect(chapters[0].name.en).toBe("Chapter 1");
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
