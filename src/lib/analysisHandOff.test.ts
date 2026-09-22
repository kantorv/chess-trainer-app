import { describe, expect, it } from "vitest";

import { analysisHandOffOf, analysisHandOffState, lineTreeOf } from "./analysisHandOff";
import { mainline, treeToPgn } from "./gameTree";
import { parsePgnTree } from "./pgn";

const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

describe("the Analysis Board hand-off", () => {
  it("carries a tree — side lines, comments, a start position — and the side, as plain data", () => {
    const tree = parsePgnTree(
      `[SetUp "1"]\n[FEN "${AFTER_E4}"]\n\n1... e5 {main} (1... c5 2. Nf3) 2. Nf3 *`,
    );
    const state = analysisHandOffState(tree, "black");
    // Structured-cloneable: what the browser's history keeps.
    const back = analysisHandOffOf(structuredClone(state));
    expect(back?.orientation).toBe("black");
    expect(back?.tree.startFen).toBe(AFTER_E4);
    expect(treeToPgn(back!.tree)).toBe(treeToPgn(tree));
  });

  it("reads anything else as no hand-off", () => {
    for (const state of [null, undefined, 3, {}, { analysisHandOff: {} }, { analysisHandOff: { pgn: 1 } }]) {
      expect(analysisHandOffOf(state)).toBeUndefined();
    }
  });
});

describe("lineTreeOf", () => {
  it("plays a line from a start position", () => {
    expect(mainline(lineTreeOf(AFTER_E4, ["c5", "Nf3"])).map((node) => node.san)).toEqual([
      "c5",
      "Nf3",
    ]);
  });

  it("stops at the first move that is not legal there", () => {
    expect(mainline(lineTreeOf(AFTER_E4, ["c5", "Ke5", "Nf3"])).map((node) => node.san)).toEqual([
      "c5",
    ]);
  });
});
