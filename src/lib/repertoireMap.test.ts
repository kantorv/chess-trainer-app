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
  mapDots,
  mapPathDots,
  mapPathTo,
  MAP_VIEW_MAX_K,
  centerView,
  fitView,
  mapLabelsIn,
  visibleRect,
  zoomViewAt,
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

  it("splits edges by coverage, and the reader's additions apart from both", () => {
    const layout = mapLayoutOf(tree);
    const edges = mapEdgePaths(layout, coverageOf(tree, new Set([nf3.id])));
    expect(edges.covered).toBe(`M${px(2)} ${py(0)}H${px(3)}`);
    expect(edges.added).toBe("");

    // 2. Bc4 as an addition: its edge is the added one, and its dot ringed.
    const added = mapEdgePaths(layout, coverageOf(tree, new Set()), new Set([bc4.id]));
    expect(added.added).toBe(`M${px(2)} ${py(0)}V${py(1)}H${px(3)}`);
    expect(added.open).not.toContain(`V${py(1)}H${px(3)}`);
    expect(mapDots(layout, new Set([bc4.id])).added).toBe(`M${px(3)} ${py(1)}h0`);
    expect(mapDots(layout).added).toBe("");
  });

  it("colours every dot by the side that moved, a line's end apart", () => {
    const layout = mapLayoutOf(tree);
    const dots = mapDots(layout);
    const count = (d: string) => d.match(/h0/g)?.length ?? 0;
    // White: 1. e4 (a move); 2. Nf3, 2. Bc4, 2. Nf3 after c5 (ends).
    expect(dots.white).toBe(`M${px(1)} ${py(0)}h0`);
    expect(count(dots.whiteEnds)).toBe(3);
    // Black: 1... e5 and 1... c5, both moves with a continuation.
    expect(count(dots.black)).toBe(2);
    expect(dots.blackEnds).toBe("");
    // A study from a Black-to-move position opens with a Black move.
    const fromBlack = parsePgnTree(
      '[SetUp "1"]\n[FEN "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"]\n\n1... e5 *',
    );
    expect(mapDots(mapLayoutOf(fromBlack)).blackEnds).not.toBe("");
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

  it("zooms a map view about the pointer, fits and centres it", () => {
    // The point under the pointer (100, 50) stays under it.
    const view = zoomViewAt({ x: 20, y: 10, k: 1 }, 2, 100, 50);
    expect(view).toEqual({ k: 2, x: -60, y: -30 });
    expect((100 - view.x) / view.k).toBe(80);
    // Clamped at the far end.
    expect(zoomViewAt({ x: 0, y: 0, k: MAP_VIEW_MAX_K }, 2, 0, 0).k).toBe(MAP_VIEW_MAX_K);

    // A 200 × 100 drawing in a 432 × 432 viewport: width-bound, centred.
    expect(fitView(200, 100, 432, 432)).toEqual({ k: 2, x: 16, y: 116 });
    expect(centerView(10, 20, 2, 400, 300)).toEqual({ k: 2, x: 180, y: 110 });
  });

  it("labels only the moves in view, up to a limit", () => {
    const layout = mapLayoutOf(tree);
    const everything = { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity };
    expect(mapLabelsIn(layout, everything).map((label) => label.san)).toEqual([
      "e4", "e5", "Nf3", "Bc4", "c5", "Nf3",
    ]);
    expect(mapLabelsIn(layout, everything)[0]).toEqual({ id: e4.id, san: "e4", px: px(1), py: py(0) });
    // Just the top row: 1. e4 e5 2. Nf3.
    const top = { left: -Infinity, top: py(0) - 1, right: Infinity, bottom: py(0) + 1 };
    expect(mapLabelsIn(layout, top).map((label) => label.san)).toEqual(["e4", "e5", "Nf3"]);
    expect(mapLabelsIn(layout, everything, 2)).toHaveLength(2);
    // A view panned to the drawing's origin at 2×, in a 100 × 50 viewport.
    expect(visibleRect({ x: 0, y: 0, k: 2 }, 100, 50, 0)).toEqual({
      left: -0, top: -0, right: 50, bottom: 25,
    });
  });

  it("lays out an empty tree without dividing by nothing", () => {
    const layout = mapLayoutOf(parsePgnTree("*"));
    expect(layout.rows).toBe(1);
    expect(layout.columns).toBe(0);
  });
});
