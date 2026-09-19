import { describe, expect, it } from "vitest";
import { parsePgnTree } from "./pgn";
import { findNode, nodeAtSanPath, treeToPgn, type GameTree } from "./gameTree";
import {
  commentsWithPlayChance,
  linesWithin,
  marksFrom,
  pickByChance,
  playChanceInText,
  playChanceOf,
  playChances,
  setPlayChances,
  withoutPlayChance,
} from "./playChance";
import { playChancePolicy } from "./repertoireTrainer";

/**
 * Play chances (CTA-69) — lichess-tools' `prc:N`, and its default of weighing
 * a move by its lines in the next 8 plies. The two cases its manual and forum
 * pin down are asserted as they state them.
 */

const at = (tree: GameTree, ...sans: string[]) => findNode(tree, nodeAtSanPath(tree, sans))!;
const rounded = (chances: number[]) => chances.map((chance) => Math.round(chance * 1000) / 1000);

describe("reading a mark", () => {
  it("reads prc:N as a whole token, decimals too, and [%prc N]", () => {
    expect(playChanceInText("prc:40")).toBe(40);
    expect(playChanceInText("A good try. prc:12.5 Keep it.")).toBe(12.5);
    expect(playChanceInText("[%prc 30]")).toBe(30);
    expect(playChanceInText("PRC:7")).toBe(7);
  });

  it("clamps above 100, and ignores what is not a mark", () => {
    expect(playChanceInText("prc:150")).toBe(100);
    expect(playChanceInText("prc:abc")).toBeUndefined();
    expect(playChanceInText("xprc:40")).toBeUndefined();
    expect(playChanceInText("prc:40%")).toBeUndefined();
  });

  it("takes the mark out of the prose, and leaves a comment without one untouched", () => {
    expect(withoutPlayChance("A good try.  prc:40")).toBe("A good try.");
    expect(withoutPlayChance("Two  spaces\\nkept.")).toBe("Two  spaces\\nkept.");
  });

  it("reads a move's first mark, after it then before it", () => {
    const tree = parsePgnTree("1. e4 (1. d4 {prc:30} {prc:50}) ({prc:20} 1. c4) *");
    expect(playChanceOf(at(tree, "d4"))).toBe(30);
    expect(playChanceOf(at(tree, "c4"))).toBe(20);
    expect(playChanceOf(at(tree, "e4"))).toBeUndefined();
  });
});

describe("writing a mark", () => {
  it("appends to the last comment, replaces an old mark, and removes one", () => {
    expect(commentsWithPlayChance(["Main.", "Sharp."], 40)).toEqual(["Main.", "Sharp. prc:40"]);
    expect(commentsWithPlayChance(["Sharp. prc:10"], 40)).toEqual(["Sharp. prc:40"]);
    expect(commentsWithPlayChance(undefined, 12.5)).toEqual(["prc:12.5"]);
    expect(commentsWithPlayChance(["prc:10"], null)).toEqual([]);
    expect(commentsWithPlayChance(["Sharp. prc:10"], null)).toEqual(["Sharp."]);
  });

  it("sets a branch's marks as one tree edit, ids kept, through the PGN", () => {
    const tree = parsePgnTree("1. e4 (1. d4 {Solid.}) ({prc:5} 1. c4) *");
    const edited = setPlayChances(
      tree,
      new Map([
        [at(tree, "e4").id, 60],
        [at(tree, "d4").id, 30],
        [at(tree, "c4").id, null],
      ]),
    );
    expect(at(edited, "e4")).toMatchObject({ id: at(tree, "e4").id, comments: ["prc:60"] });
    expect(at(edited, "d4").comments).toEqual(["Solid. prc:30"]);
    expect(at(edited, "c4").preComments).toBeUndefined();
    expect(treeToPgn(edited)).toBe("1. e4 { prc:60 } (1. d4 { Solid. prc:30 }) (1. c4) *");
    // Nothing to change: the same tree back.
    expect(setPlayChances(edited, new Map([[at(edited, "e4").id, 60]]))).toBe(edited);
  });
});

describe("the chances at a branch", () => {
  it("with no marks, weighs each move by its lines in 8 plies — the manual's example", () => {
    const tree = parsePgnTree("1. e4 (1. d4 d5 2. Nc3 (2. Nf3)) 1... e5 2. Nf3 *");
    expect(tree.moves.map((node) => linesWithin(node))).toEqual([1, 2]);
    expect(rounded(playChances(tree.moves))).toEqual([0.333, 0.667]);
  });

  it("counts only 8 plies deep: a branch past the eighth is not a line of its own", () => {
    const deep = parsePgnTree("1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 (4... d6) 5. O-O *");
    expect(linesWithin(deep.moves[0])).toBe(2);
    const deeper = parsePgnTree("1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O (5. d3) *");
    expect(linesWithin(deeper.moves[0])).toBe(1);
  });

  it("with every move marked, scales the marks — the forum's 8 × 5% + 50% case", () => {
    const moves = ["a3", "a4", "b3", "b4", "c3", "c4", "d3", "d4", "e4"];
    const pgn = `1. ${moves[0]} {prc:5} ${moves.slice(1, 8).map((san) => `(1. ${san} {prc:5})`).join(" ")} (1. e4 {prc:50}) *`;
    const tree = parsePgnTree(pgn);
    const chances = playChances(tree.moves);
    expect(chances.at(-1)).toBeCloseTo(50 / 90, 5);
    expect(chances[0]).toBeCloseTo(5 / 90, 5);
  });

  it("with some marked, the rest share what is left by their lines", () => {
    // e4 marked 60; d4 (2 lines) and c4 (1 line) share the other 40 as 2:1.
    const tree = parsePgnTree("1. e4 {prc:60} (1. d4 d5 (1... Nf6)) (1. c4) *");
    expect(rounded(playChances(tree.moves))).toEqual([0.6, 0.267, 0.133]);
  });

  it("gives the unmarked nothing once the marks reach 100", () => {
    const tree = parsePgnTree("1. e4 {prc:70} (1. d4 {prc:50}) (1. c4) *");
    expect(rounded(playChances(tree.moves))).toEqual([0.583, 0.417, 0]);
  });

  it("never plays prc:0 — unless every move is 0, when the lines decide", () => {
    const some = parsePgnTree("1. e4 {prc:0} (1. d4) *");
    expect(playChances(some.moves)).toEqual([0, 1]);
    const all = parsePgnTree("1. e4 {prc:0} (1. d4 {prc:0} d5 (1... Nf6)) *");
    expect(rounded(playChances(all.moves))).toEqual([0.333, 0.667]);
  });
});

describe("picking by chance", () => {
  const tree = parsePgnTree("1. e4 {prc:25} (1. d4 {prc:75}) *");

  it("walks the cumulative chances", () => {
    const chances = playChances(tree.moves);
    expect(pickByChance(tree.moves, chances, () => 0.2)?.san).toBe("e4");
    expect(pickByChance(tree.moves, chances, () => 0.25)?.san).toBe("d4");
    expect(pickByChance(tree.moves, chances, () => 0.999999)?.san).toBe("d4");
  });

  it("never picks a move whose chance is 0", () => {
    const zero = parsePgnTree("1. e4 (1. d4 {prc:0}) *");
    expect(pickByChance(zero.moves, playChances(zero.moves), () => 0.9999999)?.san).toBe("e4");
  });

  it("the policy reads its marks from the session's tree, its moves from the repertoire", () => {
    const session = setPlayChances(tree, new Map([[at(tree, "e4").id, 100], [at(tree, "d4").id, 0]]));
    const policy = playChancePolicy(marksFrom(session));
    expect(policy(tree, null, () => 0.9)?.san).toBe("e4");
    expect(playChancePolicy()(tree, null, () => 0.9)?.san).toBe("d4");
  });
});
