import { describe, expect, it } from "vitest";
import { parsePgnGame, parsePgnTree, parsePgnTrees } from "./pgn";
import {
  deleteFrom,
  gameToPgn,
  linePgn,
  mainline,
  makeMainline,
  mergeTrees,
  nodeAtSanPath,
  promoteVariation,
  findNode,
  setComments,
  treeToPgn,
  type GameTree,
} from "./gameTree";
import {
  mergedRepertoireOf,
  readRepertoireText,
  repertoireCopyOf,
  savedRepertoireOf,
  withRepertoireTree,
} from "./savedRepertoires";

/**
 * PGN annotations through the tree (CTA-69): `{ comments }`, `$N` NAGs and the
 * `!?`-style suffixes are read onto the right node, written back out, carried
 * through a merge and kept by every edit on the moves that survive.
 */

/** The node a SAN path names — the test's way to point at a move. */
const at = (tree: GameTree, ...sans: string[]) => findNode(tree, nodeAtSanPath(tree, sans))!;

const ANNOTATED =
  "{The game's opening words.} 1. e4! {King's pawn.} $14 e5 ; to the end of the line\n" +
  "2. Nf3 (2. f4?! {The gambit.} {A second thought.} 2... exf4) " +
  "(2. d4 $2) ({Or quietly:} 2. Nc3 Nc6) 2... Nc6!? *";

describe("parsePgnTree keeps annotations", () => {
  const tree = parsePgnTree(ANNOTATED);

  it("reads the text before the first move as the game's comment", () => {
    expect(tree.comments).toEqual(["The game's opening words."]);
  });

  it("puts a comment and its NAGs on the move they follow, suffixes as NAGs", () => {
    expect(at(tree, "e4")).toMatchObject({ comments: ["King's pawn."], nags: [1, 14] });
    expect(at(tree, "e4", "e5").comments).toEqual(["to the end of the line"]);
    expect(at(tree, "e4", "e5", "f4")).toMatchObject({
      nags: [6],
      comments: ["The gambit.", "A second thought."],
    });
    expect(at(tree, "e4", "e5", "d4").nags).toEqual([2]);
    expect(at(tree, "e4", "e5", "Nf3", "Nc6").nags).toEqual([5]);
  });

  it("reads a comment opening a variation as the comment before its first move", () => {
    const nc3 = at(tree, "e4", "e5", "Nc3");
    expect(nc3.preComments).toEqual(["Or quietly:"]);
    expect(nc3.comments).toBeUndefined();
    // …and not as a comment after e5, the move the variation answers.
    expect(at(tree, "e4", "e5").comments).toEqual(["to the end of the line"]);
  });

  it("leaves an unannotated move exactly as it was", () => {
    const node = at(tree, "e4", "e5", "Nf3");
    expect("comments" in node || "preComments" in node || "nags" in node).toBe(false);
    expect(parsePgnTree("1. e4 e5 *").comments).toBeUndefined();
  });

  it("reads every game of a file with its own comments", () => {
    const [one, two] = parsePgnTrees(
      '[Event "a"]\n\n{First.} 1. e4 *\n\n[Event "b"]\n\n{Second.} 1. d4 {Queen.} *',
    );
    expect(one.comments).toEqual(["First."]);
    expect(two.comments).toEqual(["Second."]);
    expect(at(two, "d4").comments).toEqual(["Queen."]);
  });
});

describe("treeToPgn writes them back", () => {
  it("in standard PGN, restating the number after a comment", () => {
    const pgn = treeToPgn(parsePgnTree("{Intro} 1. e4 {Why} $1 e5 (1... c5 {Sharp}) ({Solid:} 1... e6) *"));
    expect(pgn).toBe(
      "{ Intro } 1. e4 $1 { Why } 1... e5 (1... c5 { Sharp }) ({ Solid: } 1... e6) *",
    );
  });

  it("round-trips: parse, write, parse gives the same annotations", () => {
    const once = parsePgnTree(ANNOTATED);
    const again = parsePgnTree(treeToPgn(once));
    expect(again).toEqual(once);
    expect(treeToPgn(again)).toBe(treeToPgn(once));
  });

  it("writes a game of nothing but a comment", () => {
    expect(treeToPgn(parsePgnTree("{Just words.} *"))).toBe("{ Just words. } *");
  });

  it("leaves the linear writer's output alone", () => {
    const game = parsePgnGame("1. e4 {ignored by chess.js's game} e5 *");
    expect(gameToPgn(game)).toMatch(/\n\n1\. e4 e5 \*$/);
  });
});

describe("mergeTrees carries annotations", () => {
  const trees = parsePgnTrees(
    [
      '[Event "1"]\n\n{Chapter one.} 1. e4 {Best by test.} $1 c5 2. c3 {Alapin.} *',
      '[Event "2"]\n\n{Chapter two.} 1. e4 {Best by test.} c5 $5 2. c3 {The Alapin.} d5 *',
      '[Event "3"]\n\n{Chapter one.} 1. e4 c5 *',
      '[Event "4"]\n\n{Other first move.} 1. d4 {Queen pawn.} *',
    ].join("\n\n"),
  );
  const merged = mergeTrees(trees, trees[0].startFen);

  it("keeps a shared text once and joins different ones in file order", () => {
    expect(at(merged, "e4").comments).toEqual(["Best by test."]);
    expect(at(merged, "e4", "c5", "c3").comments).toEqual(["Alapin.", "The Alapin."]);
  });

  it("unions NAGs", () => {
    expect(at(merged, "e4").nags).toEqual([1]);
    expect(at(merged, "e4", "c5").nags).toEqual([5]);
  });

  it("opens each later game's own line with its game comment", () => {
    // The first game's is the tree's; a game adding nothing new joins it.
    expect(merged.comments).toEqual(["Chapter one."]);
    expect(at(merged, "e4", "c5", "c3", "d5").preComments).toEqual(["Chapter two."]);
    // Diverging at move 1: its own line starts there.
    expect(at(merged, "d4")).toMatchObject({
      preComments: ["Other first move."],
      comments: ["Queen pawn."],
    });
  });

  it("does not touch the trees it read", () => {
    expect(at(trees[0], "e4", "c5", "c3").comments).toEqual(["Alapin."]);
    expect(trees[0].comments).toEqual(["Chapter one."]);
  });

  it("writes every distinct comment into the merged PGN, and reads back the same", () => {
    const pgn = treeToPgn(merged);
    for (const text of ["Chapter one.", "Chapter two.", "Best by test.", "Alapin.", "The Alapin.", "Other first move.", "Queen pawn."]) {
      expect(pgn).toContain(`{ ${text} }`);
    }
    expect(pgn.match(/\{/g)).toHaveLength(7);
    expect(treeToPgn(parsePgnTree(pgn))).toBe(pgn);
  });
});

describe("the edits keep annotations on the moves that survive", () => {
  const tree = parsePgnTree(ANNOTATED);

  it("promote variation and make main line", () => {
    const f4 = at(tree, "e4", "e5", "f4");
    for (const edited of [promoteVariation(tree, f4.id), makeMainline(tree, f4.id)]) {
      expect(mainline(edited).map((node) => node.san)).toEqual(["e4", "e5", "f4", "exf4"]);
      expect(at(edited, "e4", "e5", "f4").comments).toEqual(["The gambit.", "A second thought."]);
      expect(at(edited, "e4").nags).toEqual([1, 14]);
      expect(edited.comments).toEqual(tree.comments);
    }
  });

  it("delete from here", () => {
    const edited = deleteFrom(tree, at(tree, "e4", "e5", "f4").id);
    expect(at(edited, "e4", "e5", "Nc3").preComments).toEqual(["Or quietly:"]);
    expect(treeToPgn(edited)).not.toContain("gambit");
    expect(treeToPgn(edited)).toContain("{ King's pawn. }");
  });

  it("copy variation PGN", () => {
    const pgn = linePgn(tree, at(tree, "e4", "e5", "f4", "exf4").id);
    expect(pgn).toContain("{ The game's opening words. }");
    expect(pgn).toContain("$1 $14 { King's pawn. }");
    expect(pgn).toContain("$6 { The gambit. } { A second thought. }");
  });
});

describe("a repertoire record keeps them", () => {
  const TEXT =
    '[Event "Alapin"]\n\n{Intro one.} 1. e4 c5 2. c3 {Main.} *\n\n' +
    '[Event "Alapin"]\n\n{Intro two.} 1. e4 c5 2. c3 d5 {Centre.} *';
  const NOW = new Date("2026-09-19T00:00:00Z");

  it("a merge writes every comment into the stored PGN", () => {
    const reading = readRepertoireText(TEXT);
    if (!reading.ok) throw new Error("unreadable");
    const record = mergedRepertoireOf("m", reading, "", NOW)!;
    for (const text of ["Intro one.", "Main.", "Intro two.", "Centre."]) {
      expect(record.pgn).toContain(`{ ${text} }`);
    }
  });

  it("Update and Save as copy write the tree's annotations", () => {
    const reading = readRepertoireText('[Event "x"]\n\n1. e4 {Mine.} e5 *');
    if (!reading.ok) throw new Error("unreadable");
    const saved = savedRepertoireOf("r", reading.games[0], "", undefined, NOW);
    const tree = parsePgnTree(saved.pgn);
    expect(withRepertoireTree(saved, tree, NOW).pgn).toContain("{ Mine. }");
    expect(repertoireCopyOf(saved, tree, "c", "Copy", NOW).pgn).toContain("{ Mine. }");
  });
});

describe("setComments — editing a move's comments", () => {
  const tree = parsePgnTree(ANNOTATED);
  const f4 = at(tree, "e4", "e5", "f4");

  it("replaces the list, keeping every id and every other node", () => {
    const edited = setComments(tree, f4.id, "comments", ["Rewritten.", " "]);
    expect(at(edited, "e4", "e5", "f4")).toMatchObject({ id: f4.id, comments: ["Rewritten."], nags: [6] });
    expect(at(edited, "e4").comments).toEqual(["King's pawn."]);
    // Immutable: the tree it was given is untouched.
    expect(f4.comments).toEqual(["The gambit.", "A second thought."]);
    expect(treeToPgn(edited)).toContain("$6 { Rewritten. }");
  });

  it("adds to a move that had none, and removes the field with the last one", () => {
    const e5 = at(tree, "e4", "e5", "Nf3");
    const added = setComments(tree, e5.id, "comments", ["New."]);
    expect(at(added, "e4", "e5", "Nf3").comments).toEqual(["New."]);
    const removed = setComments(added, e5.id, "comments", []);
    expect("comments" in at(removed, "e4", "e5", "Nf3")).toBe(false);
  });

  it("edits the comment opening a line, and the game's own", () => {
    const nc3 = at(tree, "e4", "e5", "Nc3");
    expect(at(setComments(tree, nc3.id, "preComments", []), "e4", "e5", "Nc3").preComments).toBeUndefined();
    expect(setComments(tree, null, "comments", ["Intro."]).comments).toEqual(["Intro."]);
    expect(setComments(tree, null, "comments", []).comments).toBeUndefined();
  });

  it("hands back the same tree when nothing changes", () => {
    expect(setComments(tree, f4.id, "comments", ["The gambit.", "A second thought."])).toBe(tree);
    expect(setComments(tree, "nope", "comments", ["x"])).toBe(tree);
  });
});
