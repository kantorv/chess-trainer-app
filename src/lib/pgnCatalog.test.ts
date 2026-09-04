import { describe, expect, it } from "vitest";

import {
  allCategories,
  findLibraryCategory,
  itemCountUnder,
  itemsInLibraryCategory,
  resolveLibraryPath,
} from "./libraryCatalog";
import { pgnCatalog } from "./pgnCatalog";

/**
 * The **shipped** User PGNs library — the glob, the manifest and the `.pgn`
 * files under `src/data/pgn/`, as they actually load.
 *
 * `pgnLibrary.test.ts` is where the loader's behaviour is pinned down against
 * fixtures. What is asserted here is that the real files come through it: that
 * their games parse, that the manifest names some of the studies, and — the
 * promise the section rests on — that a file the manifest says nothing about is
 * listed anyway.
 *
 * The three lichess-export studies sit at the **top level** of the section: the
 * manifest renames and orders them but does not nest them. The three
 * "Chess Fundamentals, Capablanca" parts *are* nested — the manifest groups
 * them under one `chess-fundamentals-capablanca` folder — which is the shipped
 * proof that `under` builds a folder tree.
 */
const ROSETTES = "lichess-study-queen-vs-rook-rosettes-by-methurst-2021-07-08";
const PUZZLES = "lichess-study-puzzles-custom-set-1-by-lalala732-2026-05-03";
const GAMES = "lichess-study-zwischenzug-best-games-part1-by-lalala732-2026-04-12";

/** The one shipped file that holds more than one study — see `pgnLibrary.ts`. */
const MULTI_STUDY = "methurst-public-studies";

const CAPABLANCA = "chess-fundamentals-capablanca";
const CAPABLANCA_PARTS = [1, 2, 3].map((n) => {
  const dates = { 1: "2021-02-16", 2: "2021-03-05", 3: "2021-03-25" };
  return `${CAPABLANCA}/lichess-study-chess-fundamentals-by-jr-capablanca-part-${n}-of-3-by-frankv53-${dates[n as 1 | 2 | 3]}`;
});

/**
 * The one thing the Capablanca export the loader cannot represent: ten
 * chapters — seven blank "chapter divider" boards and three king-less pawn /
 * piece skeletons — whose `FEN` tag has no king, which `chess.js` refuses to
 * load. They drop into `problems` and the other 84 chapters still load.
 */
const KINGLESS_DIAGRAM = /Invalid FEN: missing white king/;

describe("the shipped User PGNs catalog", () => {
  it("loads every file, reporting only the ten king-less Capablanca diagrams", () => {
    expect(pgnCatalog.problems).toHaveLength(10);
    expect(
      pgnCatalog.problems.every((problem) => KINGLESS_DIAGRAM.test(problem)),
    ).toBe(true);
  });

  it("finds the three lichess studies at the top level, and the Capablanca parts nested under one folder", () => {
    const paths = allCategories(pgnCatalog).map((category) => category.path);

    expect(paths).toContain(ROSETTES);
    expect(paths).toContain(PUZZLES);
    expect(paths).toContain(GAMES);
    // The three lichess exports are single-segment paths — not nested.
    for (const path of [ROSETTES, PUZZLES, GAMES]) {
      expect(path).not.toContain("/");
    }

    // The Capablanca parts hang off one grouping folder the manifest names.
    expect(findLibraryCategory(CAPABLANCA, pgnCatalog)?.label).toEqual({
      en: "Chess Fundamentals, Capablanca",
      he: "יסודות השחמט, קפבלנקה",
    });
    for (const part of CAPABLANCA_PARTS) {
      expect(paths).toContain(part);
    }
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

  it("holds every game the files could yield", () => {
    // 18 rosette chapters + 28 puzzle chapters + 9 annotated master games,
    // plus the Capablanca parts: 44 + 26 + 14 chapters once the ten king-less
    // diagrams are dropped — and the 169 chapters of the multi-study export.
    expect(pgnCatalog.items).toHaveLength(55 + 84 + 169);
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

  it("splits the multi-study export into a folder per study", () => {
    /*
      The shipped proof of the multi-study rule: one file, twenty-eight
      `StudyName`s, and a sub-folder for each — named from the tag, ordered as
      the file first mentions them. The file's own folder is the manifest's
      label, because there is no single study it could be named after.
    */
    const group = findLibraryCategory(MULTI_STUDY, pgnCatalog);

    expect(group?.label).toEqual({
      en: "Queen vs Rook, all studies",
      he: "מלכה נגד צריח, כל המחקרים",
    });
    expect(group?.children).toHaveLength(28);
    expect(group?.children[0]).toMatchObject({
      path: `${MULTI_STUDY}/queen-vs-rook-adjacent-rosettes`,
      label: { en: "Queen vs Rook, Adjacent Rosettes" },
    });

    // Every chapter is in a study's folder, not loose in the file's own.
    expect(itemsInLibraryCategory(MULTI_STUDY, pgnCatalog)).toHaveLength(0);
    expect(
      itemsInLibraryCategory(
        `${MULTI_STUDY}/queen-vs-rook-adjacent-rosettes`,
        pgnCatalog,
      ).map((item) => item.id),
    ).toEqual(
      Array.from({ length: 10 }, (_, index) => `chapter-${index + 1}`),
    );
  });

  it("counts the whole multi-study folder from the group down", () => {
    // What a folder card prints. Its own list holds nothing; the click behind
    // it leads to 169 chapters.
    const group = findLibraryCategory(MULTI_STUDY, pgnCatalog);
    if (group === undefined) throw new Error("expected the group");

    expect(itemCountUnder(group, pgnCatalog)).toBe(169);
  });

  it("lets two studies in one file name a chapter alike", () => {
    // Fourteen of the twenty-eight studies open with a "Chapter 1", and an id
    // is unique per *category* — which is what a URL addresses one by.
    const chapterOnes = pgnCatalog.items.filter(
      (item) => item.category.startsWith(`${MULTI_STUDY}/`) && item.id === "chapter-1",
    );

    expect(chapterOnes.length).toBeGreaterThan(1);
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
