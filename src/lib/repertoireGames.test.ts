import { describe, expect, it } from "vitest";

import { findNode, mainline } from "./gameTree";
import { parsePgnTree } from "./pgn";
import {
  backtrackingPolicy,
  backtrackTarget,
  coverageOf,
  isRepertoireGameId,
  isRepertoireLeaf,
  requiredMovesAt,
} from "./repertoireGames";

/*
  Three lines: 1. e4 e5 2. Nf3 (A) | 2. Bc4 (B) — a fork at White's move —
  and 1... c5 2. Nf3 (C), a fork at Black's.
*/
const tree = parsePgnTree("1. e4 e5 (1... c5 2. Nf3) 2. Nf3 (2. Bc4) *");
const [e4] = tree.moves;
const [e5, c5] = e4.children;
const [nf3, bc4] = e5.children;
const [c5nf3] = c5.children;

describe("the repertoire games", () => {
  it("knows its games and its leaves", () => {
    expect(isRepertoireGameId("end")).toBe(true);
    expect(isRepertoireGameId("backtrack")).toBe(true);
    expect(isRepertoireGameId("nope")).toBe(false);
    expect(isRepertoireLeaf(tree, nf3.id)).toBe(true);
    expect(isRepertoireLeaf(tree, e5.id)).toBe(false);
    expect(isRepertoireLeaf(tree, null)).toBe(false);
    expect(isRepertoireLeaf(tree, "nope")).toBe(false);
  });

  it("counts uncovered lines under every position", () => {
    const none = coverageOf(tree, new Set());
    expect(none.total).toBe(3);
    expect(none.under(null)).toBe(3);
    expect(none.under(e5.id)).toBe(2);
    expect(none.under(nf3.id)).toBe(1);

    const one = coverageOf(tree, new Set([nf3.id]));
    expect(one.under(null)).toBe(2);
    expect(one.under(e5.id)).toBe(1);
    expect(one.under(nf3.id)).toBe(0);
  });

  it("steers the trainer to uncovered lines, and plays on from the book when none are left", () => {
    const coverage = coverageOf(tree, new Set([nf3.id, bc4.id]));
    // At 1. e4, e5 is finished: c5 is the only open answer, whatever the draw.
    expect(backtrackingPolicy(coverage)(tree, e4.id, () => 0)?.san).toBe("c5");
    expect(backtrackingPolicy(coverage)(tree, e4.id, () => 0.99)?.san).toBe("c5");
    // Everything covered: any book move.
    const all = coverageOf(tree, new Set([nf3.id, bc4.id, c5nf3.id]));
    expect(backtrackingPolicy(all)(tree, e4.id, () => 0)?.san).toBe("e5");
  });

  it("requires the reader's open moves only when some, not all, are open", () => {
    expect(requiredMovesAt(tree, e5.id, coverageOf(tree, new Set()))).toBeUndefined();
    expect(requiredMovesAt(tree, e5.id, coverageOf(tree, new Set([nf3.id])))).toEqual([bc4]);
    expect(
      requiredMovesAt(tree, e5.id, coverageOf(tree, new Set([nf3.id, bc4.id]))),
    ).toBeUndefined();
  });

  it("goes back to the deepest position with a line left, then the start, then nowhere", () => {
    expect(backtrackTarget(tree, nf3.id, coverageOf(tree, new Set([nf3.id])))).toBe(e5.id);
    expect(backtrackTarget(tree, bc4.id, coverageOf(tree, new Set([nf3.id, bc4.id])))).toBe(
      e4.id,
    );
    const all = coverageOf(tree, new Set([nf3.id, bc4.id, c5nf3.id]));
    expect(backtrackTarget(tree, c5nf3.id, all)).toBeUndefined();

    // A line off the first move: back to the start position itself.
    const root = parsePgnTree("1. e4 (1. d4) *");
    const [first] = mainline(root);
    expect(backtrackTarget(root, first.id, coverageOf(root, new Set([first.id])))).toBeNull();
    expect(findNode(root, first.id)?.san).toBe("e4");
  });
});
