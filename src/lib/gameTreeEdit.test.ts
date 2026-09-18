import { describe, expect, it } from "vitest";
import { parsePgnTree } from "./pgn";
import {
  deleteFrom,
  findNode,
  isInSideLine,
  linePgn,
  makeMainline,
  mainline,
  nodeAtSanPath,
  promoteVariation,
  subtreeCounts,
  treeToPgn,
  type GameTree,
  type VariationNode,
} from "./gameTree";

/**
 * The variations explorer's edits (CTA-64): promote, make main line, delete
 * from here, and the counts and line PGN the menu shows and copies. What they
 * all rest on: immutable (the input tree is untouched), ids preserved, and the
 * `children[0]` rule applied to what comes out.
 */

/*
  1. e4 e5 (1... c5 2. Nf3 (2. Nc3 Nc6) d6) (1... e6) 2. Nf3 Nc6
  — a side line with its own side line, and a second alternative at move 1.
*/
const PGN = "1. e4 e5 (1... c5 2. Nf3 (2. Nc3 Nc6) 2... d6) (1... e6) 2. Nf3 Nc6 *";

const load = (): GameTree => parsePgnTree(PGN);

const idAt = (tree: GameTree, ...sans: string[]): string => {
  const id = nodeAtSanPath(tree, sans);
  if (id === null) throw new Error(`no node at ${sans.join(" ")}`);
  return id;
};

const sansOf = (nodes: readonly VariationNode[]) => nodes.map((node) => node.san);

describe("isInSideLine", () => {
  it("is false on the mainline and at the start, true anywhere under a side line", () => {
    const tree = load();
    expect(isInSideLine(tree, null)).toBe(false);
    expect(isInSideLine(tree, idAt(tree, "e4", "e5", "Nf3"))).toBe(false);
    expect(isInSideLine(tree, idAt(tree, "e4", "c5"))).toBe(true);
    expect(isInSideLine(tree, idAt(tree, "e4", "c5", "Nf3", "d6"))).toBe(true);
  });
});

describe("promoteVariation", () => {
  it("moves the closest branch up one level, the old first line becoming the first side line", () => {
    const tree = load();
    const nc6 = idAt(tree, "e4", "c5", "Nc3", "Nc6");
    const next = promoteVariation(tree, nc6);

    // Inside 1... c5, 2. Nc3 is now first; the mainline itself is untouched.
    const c5 = findNode(next, idAt(tree, "e4", "c5"));
    expect(sansOf(c5?.children ?? [])).toEqual(["Nc3", "Nf3"]);
    expect(sansOf(mainline(next))).toEqual(["e4", "e5", "Nf3", "Nc6"]);

    // Once more: now the c5 line itself is promoted over e5.
    const again = promoteVariation(next, nc6);
    expect(sansOf(findNode(again, idAt(tree, "e4"))?.children ?? [])).toEqual([
      "c5",
      "e5",
      "e6",
    ]);
    expect(sansOf(mainline(again))).toEqual(["e4", "c5", "Nc3", "Nc6"]);
  });

  it("keeps ids and does not touch the tree it was given", () => {
    const tree = load();
    const before = treeToPgn(tree);
    const e6 = idAt(tree, "e4", "e6");
    const next = promoteVariation(tree, e6);
    expect(treeToPgn(tree)).toBe(before);
    expect(findNode(next, e6)?.san).toBe("e6");
    expect(next.nextId).toBe(tree.nextId);
    expect(sansOf(findNode(next, idAt(tree, "e4"))?.children ?? [])).toEqual([
      "e6",
      "e5",
      "c5",
    ]);
  });

  it("hands a mainline move back the same tree", () => {
    const tree = load();
    expect(promoteVariation(tree, idAt(tree, "e4", "e5"))).toBe(tree);
    expect(promoteVariation(tree, "nowhere")).toBe(tree);
  });
});

describe("makeMainline", () => {
  it("promotes at every level, so the path to the move is the mainline", () => {
    const tree = load();
    const nc6 = idAt(tree, "e4", "c5", "Nc3", "Nc6");
    const next = makeMainline(tree, nc6);
    expect(sansOf(mainline(next))).toEqual(["e4", "c5", "Nc3", "Nc6"]);
    // Nothing is lost: every line is still there, as a side line.
    expect(treeToPgn(next)).toBe(
      "1. e4 c5 (1... e5 2. Nf3 Nc6) (1... e6) 2. Nc3 (2. Nf3 d6) 2... Nc6 *",
    );
  });

  it("hands a mainline move back the same tree", () => {
    const tree = load();
    expect(makeMainline(tree, idAt(tree, "e4", "e5", "Nf3", "Nc6"))).toBe(tree);
  });
});

describe("deleteFrom", () => {
  it("removes the move and everything after it", () => {
    const tree = load();
    const next = deleteFrom(tree, idAt(tree, "e4", "c5", "Nf3"));
    expect(treeToPgn(next)).toBe(
      "1. e4 e5 (1... c5 2. Nc3 Nc6) (1... e6) 2. Nf3 Nc6 *",
    );
    expect(findNode(next, idAt(tree, "e4", "c5", "Nf3", "d6"))).toBeNull();
    expect(findNode(tree, idAt(tree, "e4", "c5", "Nf3", "d6"))).not.toBeNull();
  });

  it("deleting a mainline move lets the next line take its place", () => {
    const tree = load();
    const next = deleteFrom(tree, idAt(tree, "e4", "e5"));
    expect(sansOf(mainline(next))).toEqual(["e4", "c5", "Nf3", "d6"]);
  });

  it("can empty the tree, and ignores an id it does not hold", () => {
    const tree = load();
    expect(deleteFrom(tree, idAt(tree, "e4")).moves).toEqual([]);
    expect(deleteFrom(tree, "nowhere")).toBe(tree);
  });
});

describe("subtreeCounts", () => {
  it("counts the moves from the node on and the lines ending among them", () => {
    const tree = load();
    expect(subtreeCounts(tree, idAt(tree, "e4", "c5"))).toEqual({ moves: 5, lines: 2 });
    expect(subtreeCounts(tree, idAt(tree, "e4"))).toEqual({ moves: 10, lines: 4 });
    expect(subtreeCounts(tree, idAt(tree, "e4", "e6"))).toEqual({ moves: 1, lines: 1 });
    expect(subtreeCounts(tree, "nowhere")).toEqual({ moves: 0, lines: 0 });
  });
});

describe("linePgn", () => {
  it("writes the one line from the start to the move, and no side lines", () => {
    const tree = load();
    expect(linePgn(tree, idAt(tree, "e4", "c5", "Nc3"))).toBe("1. e4 c5 2. Nc3 *");
  });

  it("keeps the tree's tags and start position, but not its result", () => {
    const tree = parsePgnTree(
      '[Event "Study"]\n[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/4P3/4K3 b - - 0 12"]\n[Result "1-0"]\n\n12... Kd7 13. e4 (13. e3) 1-0',
    );
    const pgn = linePgn(tree, idAt(tree, "Kd7", "e3"));
    expect(pgn).toContain('[Event "Study"]');
    expect(pgn).toContain('[FEN "4k3/8/8/8/8/8/4P3/4K3 b - - 0 12"]');
    expect(pgn).not.toContain("Result");
    expect(pgn.endsWith("12... Kd7 13. e3 *")).toBe(true);
  });
});
