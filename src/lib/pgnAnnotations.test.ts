import { describe, expect, it } from "vitest";
import { parsePgnGame, parsePgnTree, parsePgnTrees } from "./pgn";
import { gamesOf } from "./gamesTag";
import { NAG_SECTIONS, toggleNag } from "./moveAnnotations";
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
  mainlineGame,
  setComments,
  setNags,
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

describe("mergeTrees writes the games tag (CTA-101)", () => {
  const count = (trees: GameTree[]) =>
    mergeTrees(trees, trees[0].startFen, {}, { countGames: true });
  /** Movetexts as one many-game text — a game starts at its `[Event]`. */
  const text = (...games: string[]) =>
    games.map((movetext, index) => `[Event "${index + 1}"]\n\n${movetext}`).join("\n\n");
  const games = (...movetexts: string[]) => parsePgnTrees(text(...movetexts));

  it("sums the counts the games already carry, an untagged move counting 1", () => {
    const merged = count(
      games(
        "1. e4 {[%games 5] King's pawn.} e5 *",
        "1. e4 {games:2 King's pawn.} c5 *",
        "1. d4 {Queen's pawn.} *",
      ),
    );
    expect(at(merged, "e4").comments).toEqual(["[%games 7] King's pawn."]);
    expect(at(merged, "d4").comments).toEqual(["[%games 1] Queen's pawn."]);
    expect(gamesOf(at(merged, "e4"))).toBe(7);
    expect(gamesOf(at(merged, "e4", "c5"))).toBe(1);
  });

  it("takes the old tags out of the joined comment, on the trunk too", () => {
    const merged = count(
      games("1. e4 {[%games 4]} e5 {Open.} *", "1. e4 {games:3 Solid.} e5 {[%games 9] Open.} *"),
    );
    // Every game played e4 and e5: nothing to tag, and nothing of the old tags left.
    expect(at(merged, "e4").comments).toEqual(["Solid."]);
    expect(at(merged, "e4", "e5").comments).toEqual(["Open."]);
    expect(treeToPgn(merged)).not.toMatch(/games/);
  });

  it("re-merging a merged tree sums its counts rather than keeping the first", () => {
    const first = count(games("1. e4 e5 *", "1. e4 c5 *", "1. e4 e5 2. Nf3 *"));
    const again = count([parsePgnTree(treeToPgn(first)), ...games("1. e4 e5 *", "1. e4 e6 *")]);
    expect(gamesOf(at(again, "e4", "e5"))).toBe(3);
    expect(gamesOf(at(again, "e4", "c5"))).toBe(1);
    expect(gamesOf(at(again, "e4", "e6"))).toBe(1);
  });

  it("writes it into the PGN, first in the move's comment, and reads back the same", () => {
    const merged = count(games("1. e4 {Best.} {Also.} *", "1. d4 *"));
    const pgn = treeToPgn(merged);
    expect(pgn).toContain("1. e4 { [%games 1] Best. } { Also. } (1. d4 { [%games 1] })");
    expect(treeToPgn(parsePgnTree(pgn))).toBe(pgn);
  });

  it("a repertoire merge writes it", () => {
    const reading = readRepertoireText(text("1. e4 e5 *", "1. e4 c5 *", "1. e4 e5 2. Nf3 *"));
    if (!reading.ok) throw new Error("unreadable");
    const record = mergedRepertoireOf("m", reading, "", new Date("2026-09-26T00:00:00Z"))!;
    expect(record.pgn).toContain("e5 { [%games 2] }");
    expect(record.pgn).toContain("c5 { [%games 1] }");
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

describe("the same comment wrapped two ways is one comment", () => {
  const WRAPPED_A = "We grab the center. Now\nBlack has various moves.";
  const WRAPPED_B = "We grab the center. Now Black has\nvarious moves.";

  it("a merge keeps it once, in the first game's wording", () => {
    const trees = parsePgnTrees(
      `[Event "1"]\n\n1. e4 c5 2. c3 {${WRAPPED_A}} *\n\n[Event "2"]\n\n1. e4 c5 2. c3 {${WRAPPED_B}} d6 *`,
    );
    const merged = mergeTrees(trees, trees[0].startFen);
    expect(at(merged, "e4", "c5", "c3").comments).toEqual([WRAPPED_A]);
  });

  it("a parse keeps it once on one move — an export written before that reads clean", () => {
    const tree = parsePgnTree(`1. e4 c5 2. c3 {Other.} {${WRAPPED_A}} {${WRAPPED_B}} *`);
    expect(at(tree, "e4", "c5", "c3").comments).toEqual(["Other.", WRAPPED_A]);
  });

  it("but different words are still two comments", () => {
    const tree = parsePgnTree("1. e4 {Good.} {Good!} *");
    expect(at(tree, "e4").comments).toEqual(["Good.", "Good!"]);
  });
});

describe("setNags — editing a move's glyphs (CTA-97)", () => {
  const tree = parsePgnTree(ANNOTATED);
  const f4 = at(tree, "e4", "e5", "f4");

  it("replaces the list, keeping every id, the comments, and every node off the path", () => {
    const edited = setNags(tree, f4.id, [2, 17]);
    expect(at(edited, "e4", "e5", "f4")).toMatchObject({
      id: f4.id,
      nags: [2, 17],
      comments: ["The gambit.", "A second thought."],
    });
    // Only the path to the edit is copied: a sibling line and the moves
    // after the edited one are the same objects.
    expect(at(edited, "e4", "e5", "Nc3")).toBe(at(tree, "e4", "e5", "Nc3"));
    expect(at(edited, "e4", "e5", "f4", "exf4")).toBe(at(tree, "e4", "e5", "f4", "exf4"));
    expect(at(edited, "e4")).not.toBe(at(tree, "e4"));
    // Immutable: the tree it was given is untouched.
    expect(f4.nags).toEqual([6]);
  });

  it("keeps a repeated code once, and removes the field with the last glyph", () => {
    expect(at(setNags(tree, f4.id, [1, 1, 14]), "e4", "e5", "f4").nags).toEqual([1, 14]);
    const cleared = setNags(tree, f4.id, []);
    expect("nags" in at(cleared, "e4", "e5", "f4")).toBe(false);
    const nf3 = at(tree, "e4", "e5", "Nf3");
    expect(at(setNags(tree, nf3.id, [3]), "e4", "e5", "Nf3").nags).toEqual([3]);
  });

  it("hands back the same tree when nothing changes", () => {
    expect(setNags(tree, f4.id, [6])).toBe(tree);
    expect(setNags(tree, at(tree, "e4", "e5", "Nf3").id, [])).toBe(tree);
    expect(setNags(tree, "nope", [1])).toBe(tree);
  });

  it("round-trips an edited tree through PGN", () => {
    const [features] = NAG_SECTIONS.filter(({ section }) => section === "features");
    const attack = features.choices.find((entry) => entry.id === "attackWhite")!;
    const edited = setNags(tree, f4.id, toggleNag(f4.nags ?? [], "features", attack));
    const pgn = treeToPgn(edited);
    expect(pgn).toContain("f4 $6 $40");
    const reread = parsePgnTree(pgn);
    expect(at(reread, "e4", "e5", "f4").nags).toEqual([6, 40]);
    expect(at(reread, "e4").nags).toEqual([1, 14]);
  });

  it("carries the mainline's glyphs to the list's game, and nothing where there are none", () => {
    const [e4, e5] = mainlineGame(tree).moves;
    expect(e4.nags).toEqual([1, 14]);
    expect("nags" in e5).toBe(false);
  });
});
