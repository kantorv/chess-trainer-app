import { plyLabel, type GameTree, type VariationNode } from "./gameTree";
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
 * The shipped one-tree example would be nearly eight thousand `<line>` elements. Instead the
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
  /** The moves White made — every other one is Black's. */
  whiteMoves: ReadonlySet<string>;
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
  const whiteMoves = new Set<string>();
  let columns = 0;
  for (const node of order) {
    points.set(node.id, { x: node.ply, y: rowOf.get(node.id) ?? 0 });
    columns = Math.max(columns, node.ply);
    // Read off the tree's own start: a study from a Black-to-move position
    // opens with a Black move.
    if (plyLabel(tree.startFen, node.ply).isWhiteMove) whiteMoves.add(node.id);
  }
  const first = tree.moves[0];
  return {
    points,
    root: { x: 0, y: first === undefined ? 0 : (rowOf.get(first.id) ?? 0) },
    columns,
    rows: Math.max(rows, 1),
    order,
    parents,
    whiteMoves,
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

const NOTHING_ADDED: ReadonlySet<string> = new Set();

/**
 * The tree as path strings: the edges into moves the reader **added** (the
 * player draws the session's tree — `extensionIdsOf`), then of the rest those
 * into positions whose lines are all covered, and the others. Recomputed when
 * the tree or the coverage changes — a move added, a line covered.
 */
export const mapEdgePaths = (
  layout: MapLayout,
  coverage: Coverage,
  added: ReadonlySet<string> = NOTHING_ADDED,
): { covered: string; open: string; added: string } => {
  const covered: string[] = [];
  const open: string[] = [];
  const addedEdges: string[] = [];
  for (const node of layout.order) {
    const target = added.has(node.id)
      ? addedEdges
      : coverage.under(node.id) === 0
        ? covered
        : open;
    target.push(edgeTo(layout, node));
  }
  return { covered: covered.join(""), open: open.join(""), added: addedEdges.join("") };
};

/** A dot: a zero-length segment, drawn with round caps. */
const dotAt = (layout: MapLayout, node: VariationNode): string => {
  const { px, py } = mapPixel(layout.points.get(node.id)!);
  return `M${px} ${py}h0`;
};

/**
 * Every move as a dot, **coloured by the side that made it** — White's moves
 * white, Black's black — with a line's end drawn larger. Four path strings,
 * independent of coverage (the lines carry that), so they are built once per
 * tree.
 */
export const mapDots = (
  layout: MapLayout,
  added: ReadonlySet<string> = NOTHING_ADDED,
): {
  white: string;
  black: string;
  whiteEnds: string;
  blackEnds: string;
  /** The added moves' dots again, whichever side — ringed in the added colour. */
  added: string;
} => {
  const white: string[] = [];
  const black: string[] = [];
  const whiteEnds: string[] = [];
  const blackEnds: string[] = [];
  const addedDots: string[] = [];
  for (const node of layout.order) {
    const isWhite = layout.whiteMoves.has(node.id);
    const end = node.children.length === 0;
    const dot = dotAt(layout, node);
    (end ? (isWhite ? whiteEnds : blackEnds) : isWhite ? white : black).push(dot);
    if (added.has(node.id)) addedDots.push(dot);
  }
  return {
    white: white.join(""),
    black: black.join(""),
    whiteEnds: whiteEnds.join(""),
    blackEnds: blackEnds.join(""),
    added: addedDots.join(""),
  };
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
 * A map viewport's view (the tab's and the full-screen one's): the drawing translated by `x`, `y` and scaled by
 * `k`, in screen pixels — what the mouse moves (a drag pans, the wheel zooms
 * about the pointer). Pure, so the arithmetic is tested rather than eyeballed.
 */
export type MapView = { x: number; y: number; k: number };

/**
 * The scale a map viewport opens at: readable, since the moves are written on
 * it by default (`MAP_LABEL_MIN_K` below is where they stop being drawn).
 */
export const MAP_INITIAL_K = 2.5;

/** How far a map viewport zooms, out and in. */
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

/**
 * The map's move labels: each move's SAN written just above its
 * dot, in the drawing's own units, so it scales with the view and never
 * overlaps its neighbours — at 100% it is too small to read, from about 2.5×
 * it reads comfortably. Below {@link MAP_LABEL_MIN_K} none are drawn at all.
 */
export const MAP_LABEL_FONT = 4.5;
export const MAP_LABEL_MIN_K = 1.5;
/** The most labels drawn at once — a guard for a wide view of a huge tree. */
export const MAP_LABEL_LIMIT = 2000;

export type MapLabel = { id: string; san: string; px: number; py: number };

/**
 * The moves whose dots fall inside `rect` (drawing coordinates), in the
 * tree's order, at most `limit` of them — only what is on screen is written,
 * so a many-thousand-node repertoire costs what is visible, not what exists.
 */
export const mapLabelsIn = (
  layout: MapLayout,
  rect: { left: number; top: number; right: number; bottom: number },
  limit = MAP_LABEL_LIMIT,
): MapLabel[] => {
  const labels: MapLabel[] = [];
  for (const node of layout.order) {
    const { px, py } = mapPixel(layout.points.get(node.id)!);
    if (px < rect.left || px > rect.right || py < rect.top || py > rect.bottom) continue;
    labels.push({ id: node.id, san: node.san, px, py });
    if (labels.length >= limit) break;
  }
  return labels;
};

/** What of the drawing a view shows, in drawing coordinates, with a margin. */
export const visibleRect = (view: MapView, vw: number, vh: number, margin = 20) => ({
  left: (-view.x) / view.k - margin,
  top: (-view.y) / view.k - margin,
  right: (vw - view.x) / view.k + margin,
  bottom: (vh - view.y) / view.k + margin,
});
