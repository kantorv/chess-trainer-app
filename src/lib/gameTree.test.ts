import { describe, expect, it } from "vitest";
import { Chess, DEFAULT_POSITION } from "chess.js";
import { parsePgnGames, parsePgnTree } from "./pgn";
import { moveRowsOf } from "./gameNavigation";
import {
  addMove,
  countVariations,
  emptyTree,
  fenAtNode,
  findNode,
  lineGame,
  lineOf,
  mainline,
  mainlineGame,
  mergeTrees,
  nodeAtSanPath,
  pathTo,
  plyLabel,
  sanPathTo,
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

  it("records the piece type a capture took, through the move param", () => {
    // 1. e4 d5 2. exd5 — the capture rides with the move.
    const chess = new Chess();
    for (const san of ["e4", "d5", "exd5"]) chess.move(san);

    let parentId: string | null = null;
    let current = emptyTree();
    for (const move of chess.history({ verbose: true })) {
      const added = addMove(current, parentId, {
        san: move.san,
        from: move.from,
        to: move.to,
        fen: move.after,
        captured: move.captured,
      });
      current = added.tree;
      parentId = added.nodeId;
    }

    expect(findNode(current, parentId!)!.captured).toBe("p");
    expect(mainline(current)[0].captured).toBeUndefined();
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

  it("carries a capture through the round trip, the same field both ways", () => {
    const game = parsePgnGames("1. e4 d5 2. exd5 1-0")[0];
    expect(game.moves[2].captured).toBe("p");

    expect(mainlineGame(treeFromGame(game)).moves[2].captured).toBe("p");
    expect(lineGame(treeFromGame(game), "n3").moves[2].captured).toBe("p");
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

describe("sanPathTo / nodeAtSanPath — a portable place in a tree", () => {
  /*
    A node id is minted per tree (`nextId`), so it means nothing once the same
    game has been round-tripped through PGN and re-parsed — which is exactly what
    a saved analysis does (`lib/savedAnalyses.ts`). SAN identifies a move
    uniquely within its position, which is the property `addMove` already rests
    on, so a path of it is what travels.
  */
  const branched = () => {
    const first = play(emptyTree(), null, "e4", "e5", "Nf3");
    const e4 = first.tree.moves[0].id;
    return play(first.tree, e4, "c5", "Nf3").tree;
  };

  it("names a node inside a side line, and finds it again", () => {
    const tree = branched();
    const sicilian = nodeAtSanPath(tree, ["e4", "c5", "Nf3"]);

    expect(sicilian).not.toBeNull();
    expect(sanPathTo(tree, sicilian)).toEqual(["e4", "c5", "Nf3"]);
    // Not the mainline's `Nf3`, which is a different node with the same SAN.
    expect(sicilian).not.toBe(mainline(tree)[2].id);
  });

  it("is the start position for an empty or absent path", () => {
    const tree = branched();

    expect(nodeAtSanPath(tree, [])).toBeNull();
    expect(nodeAtSanPath(tree, undefined)).toBeNull();
    expect(sanPathTo(tree, null)).toEqual([]);
  });

  it("survives the PGN round trip, where a node id would not", () => {
    const tree = branched();
    const path = ["e4", "c5", "Nf3"];
    const reparsed = parsePgnTree(treeToPgn(tree));

    expect(fenAtNode(reparsed, nodeAtSanPath(reparsed, path))).toBe(
      fenAtNode(tree, nodeAtSanPath(tree, path)),
    );
  });

  it("stops at the last move it recognises rather than giving up", () => {
    // A path written against a tree that has since lost its continuation.
    const tree = branched();
    const found = nodeAtSanPath(tree, ["e4", "c5", "Nc3", "d6"]);

    expect(sanPathTo(tree, found)).toEqual(["e4", "c5"]);
  });
});

describe("countVariations", () => {
  it("is zero for a tree with only one line", () => {
    expect(countVariations(opening().tree)).toBe(0);
  });

  it("counts a side line once, however many moves it runs to", () => {
    const short = play(opening().tree, null, "e4");
    const branchedShort = play(short.tree, short.nodeId, "c5").tree;
    expect(countVariations(branchedShort)).toBe(1);

    const long = play(opening().tree, null, "e4");
    const branchedLong = play(
      long.tree,
      long.nodeId,
      "c5",
      "Nc3",
      "a6",
      "Bc4",
      "e6",
      "Qf3",
    ).tree;
    expect(countVariations(branchedLong)).toBe(1);
  });

  it("counts a branch at the very first half-move, not only deeper ones", () => {
    const tree = play(emptyTree(), null, "e4").tree;
    const branched = play(emptyTree(), null, "d4").tree;
    // Two alternatives at ply 1, "d4" appended beside the existing "e4" tree.
    const merged: GameTree = { ...tree, moves: [...tree.moves, ...branched.moves] };

    expect(countVariations(merged)).toBe(1);
  });

  it("counts every branch point, not just one", () => {
    // Mainline e4 e5 Nf3 Nc6, plus a side line off e4 and another off e5.
    const { tree: t1, nodeId: e4 } = play(emptyTree(), null, "e4");
    const { tree: t2, nodeId: e5 } = play(t1, e4, "e5");
    const t3 = play(t2, e5, "Nf3").tree;
    const t4 = play(t3, e4, "c5").tree;
    const t5 = play(t4, e5, "Nc3").tree;

    expect(countVariations(t5)).toBe(2);
  });
});

describe("mergeTrees", () => {
  it("follows moves already there, and hangs new ones as side lines", () => {
    const merged = mergeTrees(
      [
        parsePgnTree("1. e4 e5 2. Nf3 *"),
        parsePgnTree("1. e4 c5 2. Nf3 *"),
        parsePgnTree("1. e4 e5 2. Bc4 (2. Nc3) *"),
      ],
      DEFAULT_POSITION,
      { Event: "Merged" },
    );

    expect(merged.headers).toEqual({ Event: "Merged" });
    expect(mainline(merged).map((node) => node.san)).toEqual(["e4", "e5", "Nf3"]);
    expect(merged.moves).toHaveLength(1);
    expect(merged.moves[0].children.map((node) => node.san)).toEqual(["e5", "c5"]);
    expect(merged.moves[0].children[0].children.map((node) => node.san)).toEqual([
      "Nf3",
      "Bc4",
      "Nc3",
    ]);
    // Fresh ids, one per node in the order met — the last is 2. Nc3 — and
    // plies that count from the start.
    expect(merged.nextId).toBe(8);
    expect(pathTo(merged, "n7").map((node) => [node.san, node.ply])).toEqual([
      ["e4", 1],
      ["e5", 2],
      ["Nc3", 3],
    ]);
  });

  it("skips a tree that starts from another position", () => {
    const merged = mergeTrees(
      [parsePgnTree("1. e4 *"), parsePgnTree('[SetUp "1"]\n[FEN "8/8/8/4k3/8/8/4P3/4K3 w - - 0 1"]\n\n1. Kd2 *')],
      DEFAULT_POSITION,
    );
    expect(mainline(merged).map((node) => node.san)).toEqual(["e4"]);
    expect(merged.nextId).toBe(2);
  });

  describe("counting games (CTA-101)", () => {
    const trees = [
      parsePgnTree("1. e4 e5 2. Nf3 Nc6 *"),
      parsePgnTree("1. e4 c5 2. Nf3 *"),
      parsePgnTree("1. e4 e5 2. Bc4 *"),
      parsePgnTree("1. e4 e5 2. Nf3 Nc6 3. Bb5 *"),
    ];
    const merged = mergeTrees(trees, DEFAULT_POSITION, {}, { countGames: true });
    const at = (...sans: string[]) => findNode(merged, nodeAtSanPath(merged, sans))!;

    it("tags each move where the games part, with the games that played it", () => {
      expect(at("e4", "e5").comments).toEqual(["[%games 3]"]);
      expect(at("e4", "c5").comments).toEqual(["[%games 1]"]);
      expect(at("e4", "e5", "Nf3").comments).toEqual(["[%games 2]"]);
      expect(at("e4", "e5", "Bc4").comments).toEqual(["[%games 1]"]);
    });

    it("leaves the trunk — a position every game leaves the same way — untagged", () => {
      expect(at("e4").comments).toBeUndefined();
      expect(at("e4", "e5", "Nf3", "Nc6").comments).toBeUndefined();
      expect(at("e4", "c5", "Nf3").comments).toBeUndefined();
    });

    it("counts a game's own side lines, once per node", () => {
      const own = mergeTrees(
        [parsePgnTree("1. e4 e5 (1... c5 2. Nf3) (1... e5 2. Bc4) 2. Nf3 *"), parsePgnTree("1. d4 *")],
        DEFAULT_POSITION,
        {},
        { countGames: true },
      );
      expect(own.moves.map((node) => [node.san, node.comments])).toEqual([
        ["e4", ["[%games 1]"]],
        ["d4", ["[%games 1]"]],
      ]);
      expect(own.moves[0].children.map((node) => [node.san, node.comments])).toEqual([
        ["e5", ["[%games 1]"]],
        ["c5", ["[%games 1]"]],
      ]);
    });

    it("counts nothing without the option — the merge it always was", () => {
      const plain = mergeTrees(trees, DEFAULT_POSITION);
      expect(treeToPgn(plain)).not.toContain("{");
    });
  });
});


describe("treeToPgn's export options (CTA-73)", () => {
  const annotated = parsePgnTree(
    '[Event "Study"]\n\n{Intro.} 1. e4 $1 {Best by test.} e5 (1... c5 {The Sicilian.}) 2. Nf3 *',
  );

  it("writes everything with no options, and with every option on", () => {
    const all = treeToPgn(annotated);
    expect(treeToPgn(annotated, {})).toBe(all);
    expect(treeToPgn(annotated, { comments: true, nags: true, variations: true })).toBe(all);
    expect(all).toContain("{ Intro. }");
    expect(all).toContain("$1");
    expect(all).toContain("(1... c5");
  });

  it("drops every comment, the game's own and the side lines' included", () => {
    const pgn = treeToPgn(annotated, { comments: false });
    expect(pgn).not.toContain("{");
    expect(pgn).toContain("$1");
    expect(pgn).toContain("(1... c5)");
  });

  it("drops the NAGs", () => {
    const pgn = treeToPgn(annotated, { nags: false });
    expect(pgn).not.toContain("$");
    expect(pgn).toContain("{ Best by test. }");
  });

  it("drops the side lines, keeping the mainline and its comments", () => {
    const pgn = treeToPgn(annotated, { variations: false });
    expect(pgn).not.toContain("(");
    expect(pgn).not.toContain("Sicilian");
    expect(pgn).toContain("1. e4 $1 { Best by test. } 1... e5 2. Nf3 *");
  });

  it("round-trips what it keeps through the parser", () => {
    const bare = parsePgnTree(
      treeToPgn(annotated, { comments: false, nags: false, variations: false }),
    );
    expect(mainline(bare).map((node) => node.san)).toEqual(["e4", "e5", "Nf3"]);
    expect(countVariations(bare)).toBe(0);
  });

  it("is pure: the tree it was given keeps every annotation", () => {
    treeToPgn(annotated, { comments: false, nags: false, variations: false });
    expect(treeToPgn(annotated)).toContain("{ The Sicilian. }");
  });
});
