import { describe, expect, it } from "vitest";

import {
  openingLineOfParam,
  openingLineParamOf,
  openingNodeAt,
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

  it("goes as deep as the lines do — the index caps them at 30 plies", () => {
    const line = Array.from({ length: 30 }, (_, index) => (index % 2 === 0 ? "Nf3" : "Nf6"));
    let node = openingTreeOf([{ line, result: "*" }]);
    let depth = 0;
    while (node.children.length > 0) {
      node = node.children[0];
      depth += 1;
    }
    expect(depth).toBe(30);
  });

  it("merges 10,000 games of 30 plies quickly", () => {
    const moves = ["e4", "d4", "c4", "Nf3", "g3", "b3"];
    const rows = Array.from({ length: 10_000 }, (_, game) => ({
      line: Array.from({ length: 30 }, (_, ply) => moves[(game * (ply + 1)) % moves.length] + ply),
      result: "1-0",
    }));
    const started = performance.now();
    const tree = openingTreeOf(rows);
    expect(tree.count).toBe(10_000);
    // ~50 ms in a browser; generous here for a loaded CI machine.
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

  it("travels in the URL as comma-joined SAN", () => {
    expect(openingLineParamOf(["e4", "c5", "Nf3"])).toBe("e4,c5,Nf3");
    expect(openingLineOfParam("e4, c5,,Nf3")).toEqual(["e4", "c5", "Nf3"]);
    expect(openingLineOfParam(null)).toEqual([]);
    expect(openingLineOfParam("")).toEqual([]);
  });
});
