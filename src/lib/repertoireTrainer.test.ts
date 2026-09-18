import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";

import { addMove, findNode, mainline, treeToPgn, type GameTree } from "./gameTree";
import { parsePgnTree } from "./pgn";
import {
  extensionIdsOf,
  nodeIdsOf,
  pickTrainerMove,
  repertoireMovesAt,
} from "./repertoireTrainer";

/** `3... Bf5` is the mainline, `3... c5` the side line: two trainer moves at one node. */
const CARO = "1. e4 c6 2. d4 d5 3. e5 Bf5 (3... c5 4. dxc5) 4. Nf3 *";

/** Play `san` under `parentId`, as the board core would. */
const play = (tree: GameTree, parentId: string | null, san: string) => {
  const before = parentId === null ? tree.startFen : findNode(tree, parentId)!.fen;
  const move = new Chess(before).move(san);
  return addMove(tree, parentId, {
    san: move.san,
    from: move.from,
    to: move.to,
    fen: move.after,
    captured: move.captured,
  });
};

/** The node `3. e5`, where Black's two repertoire answers hang. */
const afterE5 = (tree: GameTree) => mainline(tree)[4]!;

describe("pickTrainerMove", () => {
  it("covers every child of the node, uniformly, with an injected source", () => {
    const tree = parsePgnTree(CARO);
    const at = afterE5(tree).id;
    expect(pickTrainerMove(tree, at, () => 0)?.san).toBe("Bf5");
    expect(pickTrainerMove(tree, at, () => 0.49)?.san).toBe("Bf5");
    expect(pickTrainerMove(tree, at, () => 0.5)?.san).toBe("c5");
    expect(pickTrainerMove(tree, at, () => 0.99)?.san).toBe("c5");
    // A source at its very edge still names a real move.
    expect(pickTrainerMove(tree, at, () => 1)?.san).toBe("c5");
  });

  it("does not favour the mainline: over many draws both moves come up", () => {
    const tree = parsePgnTree(CARO);
    let seed = 1;
    const lcg = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const seen = new Set<string>();
    for (let i = 0; i < 50; i += 1) seen.add(pickTrainerMove(tree, afterE5(tree).id, lcg)!.san);
    expect(seen).toEqual(new Set(["Bf5", "c5"]));
  });

  it("answers from the start position with null", () => {
    expect(pickTrainerMove(parsePgnTree(CARO), null, () => 0)?.san).toBe("e4");
  });

  it("gives undefined where the repertoire has no move", () => {
    const tree = parsePgnTree(CARO);
    const end = mainline(tree).at(-1)!;
    expect(pickTrainerMove(tree, end.id, () => 0)).toBeUndefined();
    // A node the repertoire does not hold is not the start position.
    expect(repertoireMovesAt(tree, "no-such-node")).toEqual([]);
    expect(pickTrainerMove(tree, "no-such-node", () => 0)).toBeUndefined();
  });
});

describe("extensionIdsOf", () => {
  it("marks the added nodes and everything under them, and nothing else", () => {
    const original = parsePgnTree(CARO);
    const ids = nodeIdsOf(original);
    expect(extensionIdsOf(original, ids).size).toBe(0);

    // A new side line off 3. e5 (3... e6), continued (4. Nf3), and a new
    // move at the end of the mainline (4... e6).
    const a = play(original, afterE5(original).id, "e6");
    const b = play(a.tree, a.nodeId, "Nf3");
    const end = mainline(b.tree).at(-1)!;
    const c = play(b.tree, end.id, "e6");

    expect(extensionIdsOf(c.tree, ids)).toEqual(new Set([a.nodeId, b.nodeId, c.nodeId]));
    // A move the repertoire already has is followed, not added.
    const followed = play(c.tree, afterE5(c.tree).id, "c5");
    expect(followed.tree).toBe(c.tree);
    expect(extensionIdsOf(followed.tree, ids).has(followed.nodeId)).toBe(false);

    // The trainer, asked about the original tree, has nothing inside an extension.
    expect(pickTrainerMove(original, b.nodeId, () => 0)).toBeUndefined();
  });

  it("leaves the original tree unchanged", () => {
    const original = parsePgnTree(CARO);
    const pgn = treeToPgn(original);
    play(original, afterE5(original).id, "e6");
    expect(treeToPgn(original)).toBe(pgn);
    expect(nodeIdsOf(original).size).toBe(9);
  });
});
