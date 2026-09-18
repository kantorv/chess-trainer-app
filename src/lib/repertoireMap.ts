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

/**
 * The zoom steps the Map tab offers, as a scale on the drawing; 1 is the
 * layout's own size. The 9,146-node example is ~2,500px square at 1, so the
 * small end is what shows it whole.
 */
export const MAP_ZOOM_LEVELS = [0.25, 0.4, 0.6, 0.8, 1, 1.25, 1.5, 2, 3] as const;
export const MAP_DEFAULT_ZOOM = 1;

/** The next zoom step in `direction`, clamped to the ends. */
export const nextMapZoom = (zoom: number, direction: 1 | -1): number => {
  const index = MAP_ZOOM_LEVELS.findIndex((level) => level >= zoom);
  const at = index === -1 ? MAP_ZOOM_LEVELS.length - 1 : index;
  const next = Math.min(MAP_ZOOM_LEVELS.length - 1, Math.max(0, at + direction));
  return MAP_ZOOM_LEVELS[next];
};

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

/** A dot: a zero-length segment, drawn with round caps. */
const dotAt = (layout: MapLayout, node: VariationNode): string => {
  const { px, py } = mapPixel(layout.points.get(node.id)!);
  return `M${px} ${py}h0`;
};

/**
 * The line ends as dots, split by whether each is covered — drawn larger than
 * the move dots, since a line's end is what Backtracking counts.
 */
export const mapLeafDots = (
  layout: MapLayout,
  coverage: Coverage,
): { covered: string; open: string } => {
  const covered: string[] = [];
  const open: string[] = [];
  for (const node of layout.order) {
    if (node.children.length > 0) continue;
    (coverage.under(node.id) === 0 ? covered : open).push(dotAt(layout, node));
  }
  return { covered: covered.join(""), open: open.join("") };
};

/**
 * A dot on every move that is not a line's end — each position a line passes
 * through — split the same way, so the map reads as moves, not only as lines.
 */
export const mapMoveDots = (
  layout: MapLayout,
  coverage: Coverage,
): { covered: string; open: string } => {
  const covered: string[] = [];
  const open: string[] = [];
  for (const node of layout.order) {
    if (node.children.length === 0) continue;
    (coverage.under(node.id) === 0 ? covered : open).push(dotAt(layout, node));
  }
  return { covered: covered.join(""), open: open.join("") };
};

/** The moves already played on the way to the reader, as dots. */
export const mapPathDots = (layout: MapLayout, path: readonly VariationNode[]): string =>
  path.map((node) => dotAt(layout, node)).join("");

/** The path from the start position to `nodeId`, as one path string. */
export const mapPathTo = (
  layout: MapLayout,
  path: readonly VariationNode[],
): string => path.map((node) => edgeTo(layout, node)).join("");

/**
 * The full-screen map's view: the drawing translated by `x`, `y` and scaled by
 * `k`, in screen pixels — what the mouse moves (a drag pans, the wheel zooms
 * about the pointer). Pure, so the arithmetic is tested rather than eyeballed.
 */
export type MapView = { x: number; y: number; k: number };

/** How far the full-screen view zooms, out and in. */
export const MAP_VIEW_MIN_K = 0.05;
export const MAP_VIEW_MAX_K = 8;

const clampK = (k: number) => Math.min(MAP_VIEW_MAX_K, Math.max(MAP_VIEW_MIN_K, k));

/** Zoom by `factor` keeping the screen point `cx`, `cy` fixed under the pointer. */
export const zoomViewAt = (view: MapView, factor: number, cx: number, cy: number): MapView => {
  const k = clampK(view.k * factor);
  const ratio = k / view.k;
  return { k, x: cx - (cx - view.x) * ratio, y: cy - (cy - view.y) * ratio };
};

/** The whole drawing (`width` × `height`) fitted and centred in a `vw` × `vh` viewport. */
export const fitView = (
  width: number,
  height: number,
  vw: number,
  vh: number,
  margin = 16,
): MapView => {
  const k = clampK(
    Math.min((vw - 2 * margin) / Math.max(width, 1), (vh - 2 * margin) / Math.max(height, 1)),
  );
  return { k, x: (vw - width * k) / 2, y: (vh - height * k) / 2 };
};

/** The drawing's point `px`, `py` in the middle of the viewport, at scale `k`. */
export const centerView = (px: number, py: number, k: number, vw: number, vh: number): MapView => ({
  k,
  x: vw / 2 - px * k,
  y: vh / 2 - py * k,
});
