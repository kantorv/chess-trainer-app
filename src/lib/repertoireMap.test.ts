import { describe, expect, it } from "vitest";

import { pathTo } from "./gameTree";
import { parsePgnTree } from "./pgn";
import { coverageOf } from "./repertoireGames";
import {
  MAP_DX,
  MAP_DY,
  MAP_PAD,
  mapEdgePaths,
  mapLayoutOf,
  mapLeafDots,
  mapMoveDots,
  mapPathDots,
  mapPathTo,
  MAP_ZOOM_LEVELS,
  nextMapZoom,
} from "./repertoireMap";

// Three lines: 1. e4 e5 2. Nf3 (the mainline) | 2. Bc4 | 1... c5 2. Nf3.
const tree = parsePgnTree("1. e4 e5 (1... c5 2. Nf3) 2. Nf3 (2. Bc4) *");
const [e4] = tree.moves;
const [e5, c5] = e4.children;
const [nf3, bc4] = e5.children;
const [c5nf3] = c5.children;

const px = (x: number) => MAP_PAD + x * MAP_DX;
const py = (y: number) => MAP_PAD + y * MAP_DY;

describe("the repertoire map layout", () => {
  it("gives every line a row, depth a column, and keeps the mainline on the top row", () => {
    const layout = mapLayoutOf(tree);
    expect(layout.rows).toBe(3);
    expect(layout.columns).toBe(3);
    expect(layout.root).toEqual({ x: 0, y: 0 });
    // The mainline: row 0 all the way.
    for (const node of [e4, e5, nf3]) expect(layout.points.get(node.id)?.y).toBe(0);
    // 2. Bc4 drops to row 1; the 1... c5 line, listed after it, to row 2.
    expect(layout.points.get(bc4.id)).toEqual({ x: 3, y: 1 });
    expect(layout.points.get(c5.id)).toEqual({ x: 2, y: 2 });
    expect(layout.points.get(c5nf3.id)).toEqual({ x: 3, y: 2 });
  });

  it("draws a straight edge along a row and an elbow down to a side line", () => {
    const layout = mapLayoutOf(tree);
    const { open, covered } = mapEdgePaths(layout, coverageOf(tree, new Set()));
    expect(covered).toBe("");
    expect(open).toContain(`M${px(2)} ${py(0)}H${px(3)}`); // 2. Nf3
    expect(open).toContain(`M${px(2)} ${py(0)}V${py(1)}H${px(3)}`); // 2. Bc4
  });

  it("splits edges and line ends by coverage", () => {
    const layout = mapLayoutOf(tree);
    const coverage = coverageOf(tree, new Set([nf3.id]));
    const edges = mapEdgePaths(layout, coverage);
    expect(edges.covered).toBe(`M${px(2)} ${py(0)}H${px(3)}`);
    const dots = mapLeafDots(layout, coverage);
    expect(dots.covered).toBe(`M${px(3)} ${py(0)}h0`);
    expect(dots.open.match(/h0/g)).toHaveLength(2);
  });

  it("puts a dot on every move that is not a line's end, and on the way played", () => {
    const layout = mapLayoutOf(tree);
    const none = mapMoveDots(layout, coverageOf(tree, new Set()));
    // e4, e5, c5: the three moves with a continuation.
    expect(none.open.match(/h0/g)).toHaveLength(3);
    expect(none.covered).toBe("");
    // With both e5 lines covered, e5's dot turns; e4 and c5 still lead somewhere.
    const some = mapMoveDots(layout, coverageOf(tree, new Set([nf3.id, bc4.id])));
    expect(some.covered).toBe(`M${px(2)} ${py(0)}h0`);
    expect(mapPathDots(layout, pathTo(tree, bc4.id))).toBe(
      `M${px(1)} ${py(0)}h0M${px(2)} ${py(0)}h0M${px(3)} ${py(1)}h0`,
    );
  });

  it("traces the way from the start to a position", () => {
    const layout = mapLayoutOf(tree);
    expect(mapPathTo(layout, pathTo(tree, c5nf3.id))).toBe(
      `M${px(0)} ${py(0)}H${px(1)}` +
        `M${px(1)} ${py(0)}V${py(2)}H${px(2)}` +
        `M${px(2)} ${py(2)}H${px(3)}`,
    );
    expect(mapPathTo(layout, [])).toBe("");
  });

  it("steps the zoom through its levels and stops at the ends", () => {
    expect(nextMapZoom(1, 1)).toBe(1.25);
    expect(nextMapZoom(1, -1)).toBe(0.8);
    expect(nextMapZoom(MAP_ZOOM_LEVELS[0], -1)).toBe(MAP_ZOOM_LEVELS[0]);
    expect(nextMapZoom(3, 1)).toBe(3);
  });

  it("lays out an empty tree without dividing by nothing", () => {
    const layout = mapLayoutOf(parsePgnTree("*"));
    expect(layout.rows).toBe(1);
    expect(layout.columns).toBe(0);
  });
});
