import { describe, expect, it } from "vitest";

import { mainline, treeToPgn } from "./gameTree";
import { openingNodeOn, openingTreeOf } from "./openingTree";
import { openingTreeToPgn } from "./openingTreePgn";
import { parsePgnTree } from "./pgn";

/*
  The Library opening board's Save tree as PGN (CTA-99): the opening tree
  below the board's position as one PGN game, the most played move the line,
  each move's counts as [%games N] / [%prc P] commands in its comment.
*/

const row = (line: string) => ({ line: line.split(" "), result: "*" });

/*
  Five games: e4 4 · d4 1 (cut: one game goes on, d5 unwritten); under e4,
  e5 3 · c5 1 (cut); under e5, Nf3 2 · Bc4 1; under Nf3, Nc6 1 · Nf6 1.
*/
const TREE = openingTreeOf([
  row("e4 e5 Nf3 Nc6"),
  row("e4 e5 Nf3 Nf6"),
  row("e4 c5 Nf3"),
  row("d4 d5"),
  row("e4 e5 Bc4"),
]);

const NONE = { games: false, prc: false };
const GAMES = { games: true, prc: false };
const PRC = { games: false, prc: true };
const BOTH = { games: true, prc: true };

/** The movetext alone — what follows the tags' blank line. */
const movetext = (pgn: string) => pgn.split("\n\n")[1];

describe("openingTreeToPgn", () => {
  it("writes the moves only, the most played first at every level, when no tag is asked for", () => {
    expect(openingTreeToPgn([], TREE, NONE, { Event: "Club" })).toBe(
      '[Event "Club"]\n[Result "*"]\n\n' +
        "1. e4 (1. d4) 1... e5 (1... c5) 2. Nf3 (2. Bc4) 2... Nc6 (2... Nf6) *",
    );
  });

  it("stops where the games stop branching, as the board does", () => {
    const text = movetext(openingTreeToPgn([], TREE, NONE));
    // d4 and c5 were each played by one game, which goes on alone: cut there.
    expect(text).not.toContain("d5");
    expect(text).not.toMatch(/c5 [^)]/);
  });

  it("writes [%games N] on every move: the games that played it from there", () => {
    expect(movetext(openingTreeToPgn([], TREE, GAMES))).toBe(
      "1. e4 { [%games 4] } (1. d4 { [%games 1] }) 1... e5 { [%games 3] } (1... c5 { [%games 1] }) " +
        "2. Nf3 { [%games 2] } (2. Bc4 { [%games 1] }) 2... Nc6 { [%games 1] } (2... Nf6 { [%games 1] }) *",
    );
  });

  it("writes [%prc P] on every move: its share of the position's games, rounded", () => {
    expect(movetext(openingTreeToPgn([], TREE, PRC))).toBe(
      "1. e4 { [%prc 80] } (1. d4 { [%prc 20] }) 1... e5 { [%prc 75] } (1... c5 { [%prc 25] }) " +
        // 2 of 3 is 66.7 → 67, 1 of 3 is 33.3 → 33.
        "2. Nf3 { [%prc 67] } (2. Bc4 { [%prc 33] }) 2... Nc6 { [%prc 50] } (2... Nf6 { [%prc 50] }) *",
    );
  });

  it("writes both in the move's one comment, games first", () => {
    const text = movetext(openingTreeToPgn([], TREE, BOTH));
    expect(text).toMatch(/^1\. e4 \{ \[%games 4\] \[%prc 80\] \} \(1\. d4 \{ \[%games 1\] \[%prc 20\] \}\)/);
    expect(text).toContain("2. Nf3 { [%games 2] [%prc 67] }");
  });

  it("leads to the board's position by the moves played, untagged, and branches from there", () => {
    const line = ["e4", "e5"];
    const pgn = openingTreeToPgn(line, openingNodeOn(TREE, line), BOTH, { Event: "Club" });
    expect(movetext(pgn)).toBe(
      "1. e4 e5 2. Nf3 { [%games 2] [%prc 67] } (2. Bc4 { [%games 1] [%prc 33] }) " +
        "2... Nc6 { [%games 1] [%prc 50] } (2... Nf6 { [%games 1] [%prc 50] }) *",
    );
  });

  it("writes only the line where the board's position has no continuation", () => {
    const line = ["d4"];
    expect(movetext(openingTreeToPgn(line, openingNodeOn(TREE, line), BOTH))).toBe("1. d4 *");
    // A line the filters left no game on: the moves, and nothing after them.
    const stale = ["e4", "e5", "Qh5"];
    expect(movetext(openingTreeToPgn(stale, openingNodeOn(TREE, stale), BOTH))).toBe("1. e4 e5 2. Qh5 *");
  });

  it("round-trips through parsePgnTree: the same moves, side lines and comments", () => {
    for (const tags of [NONE, GAMES, PRC, BOTH]) {
      const pgn = openingTreeToPgn(["e4"], openingNodeOn(TREE, ["e4"]), tags, { Event: "Club" });
      const tree = parsePgnTree(pgn);
      expect(treeToPgn(tree)).toBe(pgn);
      expect(mainline(tree).map((node) => node.san)).toEqual(["e4", "e5", "Nf3", "Nc6"]);
    }
    const tree = parsePgnTree(openingTreeToPgn([], TREE, BOTH));
    expect(tree.moves[0].comments).toEqual(["[%games 4] [%prc 80]"]);
    expect(tree.moves[1]).toMatchObject({ san: "d4", comments: ["[%games 1] [%prc 20]"] });
  });

  it("writes a tree of one game whole, hundreds of plies deep", () => {
    const long = Array.from({ length: 400 }, (_, index) => ["Nf3", "Nf6", "Ng1", "Ng8"][index % 4]);
    const single = openingTreeOf([{ line: long, result: "1-0" }]);
    const pgn = openingTreeToPgn([], single, GAMES);
    expect(mainline(parsePgnTree(pgn)).map((node) => node.san)).toEqual(long);
    expect(movetext(pgn)).toMatch(/^1\. Nf3 \{ \[%games 1\] \} 1\.\.\. Nf6 \{ \[%games 1\] \}/);
  });
});
