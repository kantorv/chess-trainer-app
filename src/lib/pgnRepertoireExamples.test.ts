import { describe, expect, it } from "vitest";

import { countVariations } from "./gameTree";
import { itemsInLibraryCategory, type LibraryGame } from "./libraryCatalog";
import { parsePgnTree } from "./pgn";
import { pgnCatalog, pgnKinds } from "./pgnCatalog";
import { pgnKindOf } from "./pgnKind";

/**
 * The three shipped **repertoire** examples, and the shape each one has to
 * come out as.
 *
 * They exist as a test rather than as a note because the classification is
 * *derived* — from tags, from a heuristic and from `src/data/pgn.json` — and
 * every one of those can drift silently. The failure this guards against is
 * not a crash: a repertoire misread as a `study` or as `games` still renders,
 * as a perfectly ordinary flat game. It just throws its `( … )` branches away
 * on the way, because `LibraryGameDetail` walks `parsePgnGames` and `chess.js`
 * `loadPgn` discards side lines — and for a repertoire those branches *are*
 * the content. Nothing would look broken; the file would simply stop being a
 * repertoire.
 *
 * The three cover the three routes into the kind:
 *
 * | file | recognised by | shape |
 * | --- | --- | --- |
 * | Sicilian 2.c3 sampler | the **heuristic** — many games, no `StudyName`, `"N) "` `White` tags | a folder of chapter sub-folders |
 * | Live chess, one tree | a manifest **`kind`** — one game with no `"N) "` chapters, so it would otherwise be `games` | one folder, its single line in it |
 * | 1.d4 repertoire | a manifest **`kind` + `chapters: false`** — its `White` tag is the opening family, not a chapter | one folder, a card per line |
 */

const REPERTOIRES = {
  sampler: "sicilian-2c3-sampler",
  oneTree: "live-chess-2026-09-18",
  d2d4: "d2d4variations",
} as const;

/** Every category path in the shipped catalog, flattened. */
const allPaths = (): string[] => {
  const out: string[] = [];
  const walk = (categories: readonly { path: string; children?: readonly never[] }[]) => {
    for (const category of categories) {
      out.push(category.path);
      if (category.children) walk(category.children);
    }
  };
  walk(pgnCatalog.categories as never);
  return out;
};

const linesIn = (path: string): LibraryGame[] =>
  itemsInLibraryCategory(path, pgnCatalog).filter(
    (item): item is LibraryGame => item.kind === "game",
  );

describe("the shipped repertoire examples", () => {
  it.each(Object.entries(REPERTOIRES))(
    "reads %s as a repertoire",
    (_name, path) => {
      expect(allPaths()).toContain(path);
      expect(pgnKindOf(path, pgnKinds)).toBe("repertoire");
    },
  );

  it("splits the multi-chapter repertoire into chapter folders", () => {
    /*
      The "one big example of multiple repertoires": its `White` tags carry a
      `"N) "` chapter prefix, so the folder holds a sub-folder per chapter and
      each chapter holds its lines. Nothing declares this — it is the
      structural heuristic, which is why the count is asserted rather than the
      kind alone.
    */
    const root = pgnCatalog.categories.find(
      (category) => category.path === REPERTOIRES.sampler,
    );
    expect(root?.children ?? []).toHaveLength(6);

    // Every chapter is a repertoire too, so a line inside one opens in the
    // variation viewer — `UserPgnsSection` reads the kind of the line's own
    // category, not of the file's root.
    for (const chapter of root?.children ?? []) {
      expect(pgnKindOf(chapter.path, pgnKinds)).toBe("repertoire");
      expect(linesIn(chapter.path).length).toBeGreaterThan(0);
    }

    // The unnumbered chapter leads, then the `"N) "` ones in their own order —
    // not the file's, which names them 3, 1, 5, 2, 4.
    expect(root?.children?.map((chapter) => chapter.label?.en)).toEqual([
      "Overview",
      "The central strike",
      "The French-style setup",
      "Knight to f6",
      "Knight to c6",
      "Rare second moves",
    ]);
  });

  it.each([
    ["oneTree", REPERTOIRES.oneTree],
    ["d2d4", REPERTOIRES.d2d4],
  ])("keeps %s flat — one repertoire, its lines in it", (_name, path) => {
    const root = pgnCatalog.categories.find(
      (category) => category.path === path,
    );
    // No chapter sub-folders: a single repertoire is one folder of lines.
    expect(root?.children ?? []).toHaveLength(0);
    expect(linesIn(path).length).toBeGreaterThan(0);
  });

  it("names the 1.d4 lines by opening family and variation together", () => {
    /*
      `chapters: false` is what buys this. Grouped on `White`, the family would
      have become the folder and the card would read "Exchange I" alone — and
      eleven of the thirteen folders would have held a single line.
    */
    const names = linesIn(REPERTOIRES.d2d4).map((line) => line.name.en);
    expect(names).toHaveLength(13);
    expect(names).toContain("QGD – Exchange I");
    expect(names).toContain("Slav – Exchange");
    expect(names).toContain("KID – Petrosian");
  });

  /*
    Given its own timeout for the same reason the render test is: the
    one-tree example is a single 7,859-node tree, and `parsePgnTree` over 49KB of
    deeply nested `( … )` is seconds of work. The size is the data's, not a
    regression — see the note in `views/pgn/repertoireExamples.test.tsx`.
  */
  it("keeps the side lines, which is the whole reason the kind matters", () => {
    /*
      The assertion the misclassification would have broken silently. Every
      example's lines are re-read with `parsePgnTree` — what
      `LibraryVariationDetail` does — and the branches are there. Read through
      `parsePgnGames` instead, as a `study` or `games` folder would be, every
      one of these counts would be zero.
    */
    const branchy = (path: string) =>
      linesIn(path).reduce(
        (total, line) => total + countVariations(parsePgnTree(line.pgn)),
        0,
      );

    expect(branchy(REPERTOIRES.oneTree)).toBe(141);
    expect(branchy(REPERTOIRES.d2d4)).toBeGreaterThan(20);
  }, 60000);

  it("adds no problems to the catalog", () => {
    // The examples themselves parse cleanly. (The Capablanca studies' own
    // "missing white king" rows are older and unrelated — hence the filter
    // rather than an empty-array assertion.)
    const mine = pgnCatalog.problems.filter(
      (problem) =>
        problem.includes("d2d4Variations") ||
        problem.includes("live-chess-2026-09-18") ||
        problem.includes("sicilian-2c3-sampler"),
    );
    expect(mine).toEqual([]);
  });
});
