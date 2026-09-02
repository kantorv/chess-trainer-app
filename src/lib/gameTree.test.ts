import { describe, expect, it } from "vitest";
import { Chess, DEFAULT_POSITION } from "chess.js";
import { parsePgnGames } from "./pgn";
import { moveRowsOf } from "./gameNavigation";
import {
  addMove,
  emptyTree,
  fenAtNode,
  findNode,
  lineGame,
  lineOf,
  mainline,
  mainlineGame,
  pathTo,
  plyLabel,
  treeFromGame,
  treeToPgn,
  type GameTree,
} from "./gameTree";

/**
 * The tree is the risky part of the analysis board, so these tests are about the
 * two things everything else rests on: that a branch keeps *both* lines, and
 * that the linear reading the two shipped screens depend on is still exactly a
 * mainline walk over it.
 */

/** Play a line of SAN onto a tree, from `parentId`, and hand back where it ended. */
const play = (
  tree: GameTree,
  parentId: string | null,
  ...sans: string[]
): { tree: GameTree; nodeId: string | null } => {
  let current = tree;
  let at = parentId;

  for (const san of sans) {
    const chess = new Chess(fenAtNode(current, at));
    const move = chess.move(san);
    const added = addMove(current, at, {
      san: move.san,
      from: move.from,
      to: move.to,
      fen: move.after,
    });
    current = added.tree;
    at = added.nodeId;
  }

  return { tree: current, nodeId: at };
};

/** `1. e4 e5 2. Nf3 Nc6` as a tree. */
const opening = () => play(emptyTree(), null, "e4", "e5", "Nf3", "Nc6");

describe("addMove", () => {
  it("grows a single line when every move is new", () => {
    const { tree } = opening();

    expect(mainline(tree).map((node) => node.san)).toEqual([
      "e4",
      "e5",
      "Nf3",
      "Nc6",
    ]);
    expect(mainline(tree).map((node) => node.ply)).toEqual([1, 2, 3, 4]);
  });

  it("records the position after each move, so nothing re-simulates", () => {
    const { tree } = opening();
    const [first] = mainline(tree);

    expect(first.fen).toContain("4P3");
    expect(fenAtNode(tree, first.id)).toBe(first.fen);
    // Ply 0 is the tree's own start position.
    expect(fenAtNode(tree, null)).toBe(DEFAULT_POSITION);
  });

  it("branches when a different move is played from an earlier ply", () => {
    const { tree: line } = opening();
    // Step back to after 1. e4 and answer it differently.
    const afterE4 = mainline(line)[0];
    const { tree, nodeId } = play(line, afterE4.id, "c5");

    // Both replies to 1. e4 are there, mainline first.
    expect(afterE4.children).toHaveLength(1);
    expect(
      findNode(tree, afterE4.id)!.children.map((node) => node.san),
    ).toEqual(["e5", "c5"]);

    // And the new line is navigable in its own right.
    expect(pathTo(tree, nodeId).map((node) => node.san)).toEqual(["e4", "c5"]);
    expect(mainline(tree).map((node) => node.san)).toEqual([
      "e4",
      "e5",
      "Nf3",
      "Nc6",
    ]);
  });

  it("follows the line that exists rather than duplicating a move", () => {
    const { tree: line } = opening();
    const afterE4 = mainline(line)[0];

    // Replaying the mainline's own reply must not make a second "e5" node.
    const { tree, nodeId } = play(line, afterE4.id, "e5");

    expect(tree).toBe(line);
    expect(nodeId).toBe(mainline(line)[1].id);
  });

  it("leaves the tree alone when the parent is not in it", () => {
    const { tree: line } = opening();
    const chess = new Chess();
    const move = chess.move("d4");

    const added = addMove(line, "nope", {
      san: move.san,
      from: move.from,
      to: move.to,
      fen: move.after,
    });

    expect(added.tree).toBe(line);
  });
});

describe("lineOf", () => {
  it("is the path to a node plus how that node naturally continues", () => {
    const { tree } = opening();
    const afterE4 = mainline(tree)[0];

    expect(lineOf(tree, afterE4.id).map((node) => node.san)).toEqual([
      "e4",
      "e5",
      "Nf3",
      "Nc6",
    ]);
  });

  it("continues down the variation a node sits on, not the mainline", () => {
    const { tree: line } = opening();
    const afterE4 = mainline(line)[0];
    const { tree, nodeId } = play(line, afterE4.id, "c5", "Nf3", "d6");

    // Standing on 1... c5, "next" is the Sicilian's own continuation.
    const sicilian = pathTo(tree, nodeId)[1];
    expect(lineOf(tree, sicilian.id).map((node) => node.san)).toEqual([
      "e4",
      "c5",
      "Nf3",
      "d6",
    ]);
  });

  it("is the mainline from the start position", () => {
    const { tree } = opening();
    expect(lineOf(tree, null).map((node) => node.san)).toEqual([
      "e4",
      "e5",
      "Nf3",
      "Nc6",
    ]);
  });
});

describe("the linear reading", () => {
  it("flattens a tree's mainline into a Game the shared pieces can read", () => {
    const { tree: line } = opening();
    const afterE4 = mainline(line)[0];
    const { tree } = play(line, afterE4.id, "c5");

    const game = mainlineGame(tree);

    // The variation is not in the linear reading — that is the whole point.
    expect(game.moves.map((move) => move.san)).toEqual([
      "e4",
      "e5",
      "Nf3",
      "Nc6",
    ]);
    expect(game.moves.map((move) => move.ply)).toEqual([1, 2, 3, 4]);
    // And it pairs up in the move list exactly as a parsed game does.
    expect(moveRowsOf(game).map((row) => row.number)).toEqual([1, 2]);
  });

  it("round-trips a parsed game through the tree unchanged", () => {
    const game = parsePgnGames("1. e4 e5 2. Nf3 Nc6 3. Bb5 1-0")[0];

    expect(mainlineGame(treeFromGame(game))).toEqual({
      headers: game.headers,
      moves: game.moves,
    });
  });

  it("reads one variation as its own line", () => {
    const { tree: line } = opening();
    const afterE4 = mainline(line)[0];
    const { tree, nodeId } = play(line, afterE4.id, "c5", "Nf3");

    expect(lineGame(tree, nodeId).moves.map((move) => move.san)).toEqual([
      "e4",
      "c5",
      "Nf3",
    ]);
  });

  it("keeps a custom start position in the headers, so numbering survives", () => {
    const fen = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 3 12";
    const { tree } = play(emptyTree(fen), null, "Nf6");

    const game = mainlineGame(tree);
    expect(game.headers.FEN).toBe(fen);
    expect(game.headers.SetUp).toBe("1");
    // Black to move on move 12: the first row is numbered 12, White's half empty.
    expect(moveRowsOf(game)[0]).toMatchObject({ number: 12, white: null });
  });
});

describe("plyLabel", () => {
  it("numbers a standard game the way a book prints it", () => {
    expect(plyLabel(DEFAULT_POSITION, 1)).toEqual({
      number: 1,
      isWhiteMove: true,
    });
    expect(plyLabel(DEFAULT_POSITION, 2)).toEqual({
      number: 1,
      isWhiteMove: false,
    });
    expect(plyLabel(DEFAULT_POSITION, 5)).toEqual({
      number: 3,
      isWhiteMove: true,
    });
  });

  it("follows a FEN that starts on Black's move at move 12", () => {
    const fen = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 12";
    expect(plyLabel(fen, 1)).toEqual({ number: 12, isWhiteMove: false });
    expect(plyLabel(fen, 2)).toEqual({ number: 13, isWhiteMove: true });
  });
});

describe("treeToPgn", () => {
  it("writes a plain line with its result", () => {
    const { tree } = opening();
    const pgn = treeToPgn({ ...tree, headers: { Result: "1-0" } });

    expect(pgn).toContain('[Result "1-0"]');
    expect(pgn).toContain("1. e4 e5 2. Nf3 Nc6 1-0");
  });

  it("writes side lines in parentheses and renumbers after them", () => {
    const { tree: line } = opening();
    const afterE4 = mainline(line)[0];
    const { tree } = play(line, afterE4.id, "c5", "Nf3");

    expect(treeToPgn(tree)).toContain("1. e4 e5 (1... c5 2. Nf3) 2. Nf3 Nc6");
  });

  it("states a custom start position so it reloads as itself", () => {
    const fen = "8/8/8/8/8/5k2/6q1/7K b - - 0 60";
    const { tree } = play(emptyTree(fen), null, "Qg7");

    const pgn = treeToPgn(tree);
    expect(pgn).toContain(`[FEN "${fen}"]`);
    expect(pgn).toContain('[SetUp "1"]');
    expect(pgn).toContain("60... Qg7 *");
  });

  it("writes an empty tree as its result alone", () => {
    expect(treeToPgn(emptyTree())).toBe("*");
  });
});
