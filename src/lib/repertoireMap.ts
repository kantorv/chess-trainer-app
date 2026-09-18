import type { GameTree, VariationNode } from "./gameTree";
import type { Coverage } from "./repertoireGames";

/**
 * **The repertoire map** (CTA-63) — the layout of Backtracking's Map tab: the
 * repertoire's tree drawn as an SVG, so the reader sees where they are in it
 * and how much of it is left. Pure: coordinates and path strings in, nothing
 * rendered here (`views/repertoires/RepertoireMap.tsx` draws them).
 *
 * ## The layout
 *
 * Depth runs left to right — one column per ply — and every **line** (a leaf)
 * gets a row of its own, in the order the tree lists them. A position sits on
 * the row of its **first** child, so `children[0]` continues straight along
 * its parent's row: the mainline is the top row, and each side line drops to
 * the rows below the point it branches from, joined by an elbow. The same
 * reading the merged move list gives, turned into a picture.
 *
 * ## Why path strings, not elements
 *
 * The 9,146-node example would be nine thousand `<line>` elements. Instead the
 * edges are grouped into one `d` string per kind — covered, open, the path to
 * the reader — so the map is a handful of elements whatever its size, and a
 * step redraws one short path rather than the tree.
 */

/** One position's place on the map: its column (ply) and row. */
export type MapPoint = { x: number; y: number };

export type MapLayout = {
  /** Every node's place, by id; the start position is {@link MapLayout.root}. */
  points: ReadonlyMap<string, MapPoint>;
  root: MapPoint;
  /** Columns (the deepest ply) and rows (the lines). */
  columns: number;
  rows: number;
  /** Every node, parents before children — what the edge paths walk. */
  order: readonly VariationNode[];
  /** Each node's parent id, `null` for a first move. */
  parents: ReadonlyMap<string, string | null>;
};

/** Pixels per column and per row, and the margin around the drawing. */
export const MAP_DX = 14;
export const MAP_DY = 12;
export const MAP_PAD = 8;

/** A place on the map, in pixels. */
export const mapPixel = (point: MapPoint) => ({
  px: MAP_PAD + point.x * MAP_DX,
  py: MAP_PAD + point.y * MAP_DY,
});

/** Lay a repertoire out — once per tree; it does not change as it is played. */
export const mapLayoutOf = (tree: GameTree): MapLayout => {
  const order: VariationNode[] = [];
  const parents = new Map<string, string | null>();
  // Pre-order, first child first: the order the lines are listed in.
  const stack: [VariationNode, string | null][] = [...tree.moves]
    .reverse()
    .map((node) => [node, null]);
  for (let entry = stack.pop(); entry !== undefined; entry = stack.pop()) {
    const [node, parentId] = entry;
    order.push(node);
    parents.set(node.id, parentId);
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      stack.push([node.children[index], node.id]);
    }
  }

  // A leaf takes the next row; a position takes its first child's row, so it
  // is placed after its children — the reverse of the walk above.
  const rowOf = new Map<string, number>();
  let rows = 0;
  for (const node of order) if (node.children.length === 0) rowOf.set(node.id, rows++);
  for (let index = order.length - 1; index >= 0; index -= 1) {
    const node = order[index];
    if (node.children.length > 0) rowOf.set(node.id, rowOf.get(node.children[0].id) ?? 0);
  }

  const points = new Map<string, MapPoint>();
  let columns = 0;
  for (const node of order) {
    points.set(node.id, { x: node.ply, y: rowOf.get(node.id) ?? 0 });
    columns = Math.max(columns, node.ply);
  }
  const first = tree.moves[0];
  return {
    points,
    root: { x: 0, y: first === undefined ? 0 : (rowOf.get(first.id) ?? 0) },
    columns,
    rows: Math.max(rows, 1),
    order,
    parents,
  };
};

/** The edge into `node` from its parent: straight along a row, or an elbow down. */
const edgeTo = (layout: MapLayout, node: VariationNode): string => {
  const parentId = layout.parents.get(node.id) ?? null;
  const from = mapPixel(parentId === null ? layout.root : layout.points.get(parentId)!);
  const to = mapPixel(layout.points.get(node.id)!);
  return from.py === to.py
    ? `M${from.px} ${from.py}H${to.px}`
    : `M${from.px} ${from.py}V${to.py}H${to.px}`;
};

/**
 * The tree as two path strings: the edges into positions whose lines are all
 * covered, and the rest. Recomputed when the coverage changes — once per line.
 */
export const mapEdgePaths = (
  layout: MapLayout,
  coverage: Coverage,
): { covered: string; open: string } => {
  const covered: string[] = [];
  const open: string[] = [];
  for (const node of layout.order) {
    (coverage.under(node.id) === 0 ? covered : open).push(edgeTo(layout, node));
  }
  return { covered: covered.join(""), open: open.join("") };
};

/**
 * The line ends as dots — a zero-length segment per leaf, drawn with round
 * caps — split by whether each is covered.
 */
export const mapLeafDots = (
  layout: MapLayout,
  coverage: Coverage,
): { covered: string; open: string } => {
  const covered: string[] = [];
  const open: string[] = [];
  for (const node of layout.order) {
    if (node.children.length > 0) continue;
    const { px, py } = mapPixel(layout.points.get(node.id)!);
    (coverage.under(node.id) === 0 ? covered : open).push(`M${px} ${py}h0`);
  }
  return { covered: covered.join(""), open: open.join("") };
};

/** The path from the start position to `nodeId`, as one path string. */
export const mapPathTo = (
  layout: MapLayout,
  path: readonly VariationNode[],
): string => path.map((node) => edgeTo(layout, node)).join("");
