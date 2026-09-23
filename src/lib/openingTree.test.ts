import { describe, expect, it } from "vitest";

import {
  openingLineOfParam,
  openingLineParamOf,
  openingNodeAt,
  openingNodeOn,
  openingTreeOf,
  type OpeningTreeNode,
} from "./openingTree";

/*
  A collection's opening tree (lib/openingTree.ts, CTA-76): the index rows'
  lines merged by SAN, each node counting the games through it and their
  results, the most played continuation first.
*/

const row = (line: string | undefined, result = "*") => ({
  line: line === undefined ? undefined : line.split(" "),
  result,
});

const sans = (node: OpeningTreeNode) => node.children.map((child) => child.san);

describe("openingTreeOf", () => {
  it("merges the lines by SAN, counting games and results at every node", () => {
    const tree = openingTreeOf([
      row("e4 e5 Nf3", "1-0"),
      row("d4 d5", "1/2-1/2"),
      row("e4 c5", "0-1"),
      row("e4 e5 Bc4", "1-0"),
    ]);
    expect(tree.count).toBe(4);
    expect(sans(tree)).toEqual(["e4", "d4"]);
    const e4 = tree.children[0];
    expect(e4).toMatchObject({ san: "e4", count: 3, results: { white: 2, draw: 0, black: 1 } });
    expect(sans(e4)).toEqual(["e5", "c5"]);
    expect(sans(e4.children[0])).toEqual(["Nf3", "Bc4"]);
    expect(tree.children[1].results).toEqual({ white: 0, draw: 1, black: 0 });
  });

  it("puts the most played continuation first, ties in the order they first appeared", () => {
    const tree = openingTreeOf([row("c4"), row("Nf3"), row("d4"), row("d4")]);
    expect(sans(tree)).toEqual(["d4", "c4", "Nf3"]);
  });

  it("leaves out the games with no line — unreadable, a set-up start, an old index", () => {
    const tree = openingTreeOf([row(undefined, "1-0"), row("e4"), { line: [], result: "*" }]);
    expect(tree.count).toBe(1);
    expect(openingTreeOf([row(undefined)])).toMatchObject({ count: 0, children: [] });
  });

  it("keeps a tree of one game whole — the board stays walkable to its end", () => {
    const line = Array.from({ length: 40 }, (_, index) => (index % 2 === 0 ? "Nf3" : "Nf6"));
    let node = openingTreeOf([{ line, result: "*" }]);
    let depth = 0;
    while (node.children.length > 0) {
      node = node.children[0];
      depth += 1;
    }
    expect(depth).toBe(40); // past the old 30-ply cap, and nothing is cut
    expect(node.continues).toBeUndefined();
  });

  it("extends past the old 30-ply cap, offering the choice where the games part", () => {
    const shared = Array.from({ length: 34 }, (_, index) => (index % 2 === 0 ? "Nf3" : "Nf6"));
    const tree = openingTreeOf([
      { line: [...shared, "d4", "d5"], result: "*" },
      { line: [...shared, "c4", "c5"], result: "*" },
    ]);
    // The 34 shared plies are two games' choice all the way; the parting move is each one's alone.
    expect(openingNodeAt(tree, shared).node.children.map((child) => child.san)).toEqual(["d4", "c4"]);
    const { line, node } = openingNodeAt(tree, [...shared, "d4", "d5"]);
    expect(line).toHaveLength(35); // the walk reaches past ply 30, then the tree stops
    expect(node.continues).toBe(true); // one game goes on, alone
  });

  it("cuts where a single game continues — a node one game passed keeps no children", () => {
    const tree = openingTreeOf([row("e4 e5 Nf3 Nc6"), row("e4 e5 Nc6 a6"), row("e4 c5 d6")]);
    const e4 = tree.children[0];
    expect(e4.count).toBe(3);
    // e5 is still a choice of two games, so its moves are offered…
    const e5 = e4.children[0];
    expect(e5.count).toBe(2);
    expect(e5.children.map((child) => child.san)).toEqual(["Nf3", "Nc6"]);
    // …but each of them is one game's alone from there, so the tree stops and says so.
    for (const alone of [...e5.children, e4.children[1]]) {
      expect(alone.children).toEqual([]);
      expect(alone.continues).toBe(true);
    }
    // The walk follows the games only as far as the tree holds them.
    expect(openingNodeAt(tree, ["e4", "e5", "Nf3", "Nc6"]).line).toEqual(["e4", "e5", "Nf3"]);
    expect(openingNodeAt(tree, ["e4", "c5", "d6"]).line).toEqual(["e4", "c5"]);
  });

  it("does not mark a game's own last move — the cut is only where one goes on", () => {
    const tree = openingTreeOf([row("e4 e5 Nf3 Nc6"), row("e4 c5")]);
    const e5 = tree.children[0].children[0];
    expect(e5).toMatchObject({ count: 1, children: [], continues: true }); // game 1 goes on past e5
    const c5 = tree.children[0].children[1];
    expect(c5).toMatchObject({ count: 1, children: [] }); // game 2 ends here
    expect(c5.continues).toBeUndefined();
  });

  it("merges 10,000 full-length games quickly", () => {
    const moves = ["e4", "d4", "c4", "Nf3", "g3", "b3"];
    const rows = Array.from({ length: 10_000 }, (_, game) => ({
      line: Array.from({ length: 80 }, (_, ply) => moves[(game * (ply + 1)) % moves.length] + ply),
      result: "1-0",
    }));
    const started = performance.now();
    const tree = openingTreeOf(rows);
    expect(tree.count).toBe(10_000);
    // ~30 ms in a browser; generous here for a loaded CI machine. (The real
    // 7,818-game fixture, whose lines branch rather than repeat, measures
    // ~150 ms — the budgets table in game-collections.md §7 carries that.)
    expect(performance.now() - started).toBeLessThan(1500);
  });
});

describe("walking the tree", () => {
  const tree = openingTreeOf([row("e4 e5 Nf3"), row("e4 c5")]);

  it("follows a line as far as the games do", () => {
    expect(openingNodeAt(tree, ["e4", "e5"]).line).toEqual(["e4", "e5"]);
    expect(openingNodeAt(tree, ["e4", "e5"]).node.san).toBe("e5");
    // A move no game played ends the walk.
    expect(openingNodeAt(tree, ["e4", "e6", "d4"])).toMatchObject({ line: ["e4"], node: { san: "e4" } });
    expect(openingNodeAt(tree, [])).toMatchObject({ line: [], node: tree });
  });

  it("reaches a node only when the tree holds the whole line — else a node of no games", () => {
    expect(openingNodeOn(tree, ["e4", "c5"])).toMatchObject({ san: "c5", count: 1 });
    expect(openingNodeOn(tree, [])).toBe(tree);
    expect(openingNodeOn(tree, ["e4", "e6"])).toMatchObject({ count: 0, children: [] });
  });

  it("travels in the URL as comma-joined SAN", () => {
    expect(openingLineParamOf(["e4", "c5", "Nf3"])).toBe("e4,c5,Nf3");
    expect(openingLineOfParam("e4, c5,,Nf3")).toEqual(["e4", "c5", "Nf3"]);
    expect(openingLineOfParam(null)).toEqual([]);
    expect(openingLineOfParam("")).toEqual([]);
  });
});
