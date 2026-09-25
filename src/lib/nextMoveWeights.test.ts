import { describe, expect, it } from "vitest";

import {
  arrowPaletteFrom,
  arrowWidthSourceFrom,
  DEFAULT_ARROW_PALETTE,
  DEFAULT_ARROW_WIDTH_SOURCE,
} from "./arrowSettings";
import { gamesInText, gamesOf, withoutGames } from "./gamesTag";
import { nodeAtSanPath, findNode, setComments, type GameTree } from "./gameTree";
import {
  arrowWidthSourcesIn,
  EVAL_HAIRLINE_CP,
  evalOf,
  nextMoveWeights,
  parseEval,
} from "./nextMoveWeights";
import { parsePgnTree } from "./pgn";

/*
  CTA-98: what sizes the Analysis Board's next-move arrows — the `games` tag's
  reader, the eval reader, each width source's weights at a branch, and which
  sources a tree offers.
*/

/** The continuations after the SAN path — the branch a board draws. */
const branchAt = (tree: GameTree, ...sans: string[]) =>
  sans.length === 0 ? tree.moves : findNode(tree, nodeAtSanPath(tree, sans))!.children;

describe("the games tag", () => {
  it("reads the token and the command form, the first one winning", () => {
    expect(gamesInText("games:12")).toBe(12);
    expect(gamesInText("Main line. GAMES: 7 again")).toBe(7);
    expect(gamesInText("[%games 40]")).toBe(40);
    expect(gamesInText("games:3 [%games 9]")).toBe(3);
    expect(gamesInText("no games here")).toBeUndefined();
    expect(gamesInText("videogames:4")).toBeUndefined();
  });

  it("takes the tag out of the prose, leaving a plain comment as it was", () => {
    expect(withoutGames("Popular. games:12")).toBe("Popular.");
    expect(withoutGames("[%games 3] Rare.")).toBe("Rare.");
    expect(withoutGames("Nothing  to strip")).toBe("Nothing  to strip");
  });

  it("reads a move's comments after it, then before it", () => {
    const tree = parsePgnTree("1. e4 {Best. games:20} (1. d4 {Solid.}) ( {games:5} 1. c4) *");
    const [e4, d4, c4] = tree.moves;
    expect(gamesOf(e4)).toBe(20);
    expect(gamesOf(d4)).toBeUndefined();
    expect(gamesOf(c4)).toBe(5);
  });
});

describe("the eval a move carries", () => {
  it("parses pawns and mates, White's view, ignoring a depth suffix", () => {
    expect(parseEval("0.25")).toEqual({ cp: 25 });
    expect(parseEval("+1.31")).toEqual({ cp: 131 });
    expect(parseEval("-0.5,22")).toEqual({ cp: -50 });
    expect(parseEval("#3")).toEqual({ mate: 3 });
    expect(parseEval("#-2")).toEqual({ mate: -2 });
    expect(parseEval("?")).toBeUndefined();
  });

  it("reads [%eval] and the trailing engine shape, from the comments after the move", () => {
    const tree = parsePgnTree(
      "1. e4 {[%eval 0.3] [%clk 0:05:00]} (1. d4 {Fine. +/= +0.25 (20 ply)}) (1. c4 {Nothing.}) *",
    );
    const [e4, d4, c4] = tree.moves;
    expect(evalOf(e4)).toEqual({ cp: 30 });
    expect(evalOf(d4)).toEqual({ cp: 25 });
    expect(evalOf(c4)).toBeUndefined();
  });
});

describe("nextMoveWeights — eval: loss against the best tagged move", () => {
  it("makes the best the widest and narrows the rest linearly, an untagged move null", () => {
    const tree = parsePgnTree(
      "1. e4 e5 2. Nf3 {[%eval 0.3]} (2. Bc4 {[%eval 0.1]}) (2. f4 {[%eval -1.5]}) (2. Qh5) *",
    );
    const weights = nextMoveWeights(branchAt(tree, "e4", "e5"), "eval")!;
    expect(weights[0]).toBe(1);
    expect(weights[1]).toBeCloseTo(1 - 20 / EVAL_HAIRLINE_CP);
    expect(weights[2]).toBeCloseTo(1 - 180 / EVAL_HAIRLINE_CP);
    expect(weights[3]).toBeNull();
  });

  it("reads the score from the side to move's view at the branch", () => {
    // Black moves here: -0.25 is Black's best, +2.0 its worst.
    const tree = parsePgnTree(
      "1. e4 c5 {[%eval 0.4]} (1... e5 {+/= +0.25 (20 ply)}) (1... g5 {[%eval 2.0]}) *",
    );
    const [c5, e5, g5] = nextMoveWeights(branchAt(tree, "e4"), "eval")!;
    expect(e5).toBe(1);
    expect(c5).toBeCloseTo(1 - 15 / EVAL_HAIRLINE_CP);
    expect(g5).toBeCloseTo(1 - 175 / EVAL_HAIRLINE_CP);
  });

  it("is a hairline at the loss limit or worse", () => {
    const tree = parsePgnTree("1. e4 {[%eval 0.3]} (1. g4 {[%eval -3.5]}) *");
    expect(nextMoveWeights(tree.moves, "eval")).toEqual([1, 0]);
  });

  it("takes a mate for the mover as the best and a mate against it as a hairline", () => {
    const tree = parsePgnTree(
      "1. e4 e5 2. Qh5 {[%eval #3]} (2. Bc4 {[%eval #5]}) (2. Nf3 {[%eval 4.0]}) (2. Ke2 {[%eval #-2]}) *",
    );
    const [qh5, bc4, nf3, ke2] = nextMoveWeights(branchAt(tree, "e4", "e5"), "eval")!;
    expect(qh5).toBe(1);
    expect(bc4).toBeGreaterThan(0.9);
    expect(nf3).toBe(0);
    expect(ke2).toBe(0);
  });

  it("flips a mate's sign for Black", () => {
    const tree = parsePgnTree("1. f3 e5 2. g4 Qh4# {[%eval #0]} (2... d6 {[%eval #-9]}) *");
    const weights = nextMoveWeights(branchAt(tree, "f3", "e5", "g4"), "eval")!;
    expect(weights[0]).toBe(1);
    expect(weights[1]).toBeGreaterThan(0.9);
  });
});

describe("nextMoveWeights — games, prc and lines", () => {
  it("games: each tagged move's share of the tagged games", () => {
    const tree = parsePgnTree("1. e4 {games:30} (1. d4 {[%games 10]}) (1. c4) *");
    expect(nextMoveWeights(tree.moves, "games")).toEqual([0.75, 0.25, null]);
  });

  it("prc: the marks scaled to 100% among the tagged moves", () => {
    const tree = parsePgnTree("1. e4 {prc:5} (1. d4 {prc:15}) (1. c4) *");
    expect(nextMoveWeights(tree.moves, "prc")).toEqual([0.25, 0.75, null]);
    const zero = parsePgnTree("1. e4 {prc:0} (1. d4 {prc:0}) *");
    expect(nextMoveWeights(zero.moves, "prc")).toEqual([0, 0]);
  });

  it("lines: each move's share of the lines within 8 plies, needing no tag", () => {
    const tree = parsePgnTree("1. e4 (1. d4) 1... e5 (1... c5) *");
    const [e4, d4] = nextMoveWeights(tree.moves, "lines")!;
    expect(e4).toBeCloseTo(2 / 3);
    expect(d4).toBeCloseTo(1 / 3);
  });

  it("is undefined where no move at the branch carries the tag, and for none", () => {
    const tree = parsePgnTree("1. e4 {games:3} e5 (1... c5) *");
    expect(nextMoveWeights(branchAt(tree, "e4"), "games")).toBeUndefined();
    expect(nextMoveWeights(branchAt(tree, "e4"), "eval")).toBeUndefined();
    expect(nextMoveWeights(tree.moves, "none")).toBeUndefined();
    expect(nextMoveWeights([], "lines")).toBeUndefined();
  });
});

describe("arrowWidthSourcesIn — the sources a tree offers", () => {
  it("always offers none and lines, and each tag some move carries anywhere", () => {
    expect(arrowWidthSourcesIn(parsePgnTree("1. e4 e5 *"))).toEqual(new Set(["none", "lines"]));
    const tree = parsePgnTree("1. e4 e5 (1... c5 2. Nf3 {prc:40} (2. c3 {[%eval 0.2]})) *");
    expect(arrowWidthSourcesIn(tree)).toEqual(new Set(["none", "lines", "prc", "eval"]));
  });

  it("follows the tree as a comment is edited", () => {
    const tree = parsePgnTree("1. e4 e5 *");
    const e5 = nodeAtSanPath(tree, ["e4", "e5"])!;
    const tagged = setComments(tree, e5, "comments", ["Most played. games:120"]);
    expect(arrowWidthSourcesIn(tagged).has("games")).toBe(true);
    expect(arrowWidthSourcesIn(tree).has("games")).toBe(false);
  });
});

describe("the record's arrow settings, read back", () => {
  it("keeps a known value and reads anything else as the default", () => {
    expect(arrowWidthSourceFrom("eval")).toBe("eval");
    expect(arrowWidthSourceFrom("width")).toBe(DEFAULT_ARROW_WIDTH_SOURCE);
    expect(arrowWidthSourceFrom(undefined)).toBe("none");
    expect(arrowPaletteFrom("colorblind")).toBe("colorblind");
    expect(arrowPaletteFrom(3)).toBe(DEFAULT_ARROW_PALETTE);
    expect(arrowPaletteFrom(undefined)).toBe("classic");
  });
});
