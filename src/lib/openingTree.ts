import type { CollectionRow } from "./libraryCollections";

/**
 * **A collection's opening tree** (CTA-76) — every game's opening moves merged
 * into one tree, what the Library table's opening-moves board is drawn from:
 * the continuations of the position on it, each with the games that played it.
 *
 * It is built **in memory from the index's rows** — each row's `line`, the
 * first 30 plies of its mainline as SAN, written once when the collection came
 * in (`lib/collectionIndex.ts`) — so nothing is parsed and no `chess.js` runs:
 * 10,000 games merge in under 10 ms, so the table rebuilds it whenever its
 * other filters change. Keyed by SAN,
 * as `mergeTrees` (`lib/gameTree.ts`) merges a repertoire, but a node records
 * the games through it instead of annotations.
 *
 * **Which games pass through a node** is not stored as a list: they are the
 * rows whose `line` begins with the path to it — `filteredRows`' `line`
 * filter (`lib/libraryCollections.ts`), which the table runs anyway. So a node
 * carries only its counts, and an Update or a Save as copy (which renumber
 * nothing but the rows themselves) cannot leave it stale.
 *
 * A row with no `line` — unreadable, not from the standard start, or indexed
 * before the column existed — is left out; a tree with no games means the
 * board has nothing to offer. Pure.
 */

/** What the games through a node ended in — PGN's three decisive-or-drawn results; `*` counts in none. */
type OpeningResults = { white: number; draw: number; black: number };

export type OpeningTreeNode = {
  /** The move that reached this node; `""` at the root. */
  san: string;
  /** How many games passed through it. */
  count: number;
  results: OpeningResults;
  /** The continuations, the most played first (ties in the order they first appeared). */
  children: readonly OpeningTreeNode[];
};

type Building = {
  san: string;
  count: number;
  results: OpeningResults;
  children: Map<string, Building>;
};

const building = (san: string): Building => ({
  san,
  count: 0,
  results: { white: 0, draw: 0, black: 0 },
  children: new Map(),
});

const tally = (node: Building, result: string) => {
  node.count += 1;
  if (result === "1-0") node.results.white += 1;
  else if (result === "0-1") node.results.black += 1;
  else if (result === "1/2-1/2") node.results.draw += 1;
};

const finished = (node: Building): OpeningTreeNode => ({
  san: node.san,
  count: node.count,
  results: node.results,
  // A stable sort, and a Map iterates in insertion order — ties stay first-seen.
  children: [...node.children.values()].sort((a, b) => b.count - a.count).map(finished),
});

/** The rows' lines merged into one tree, from the standard start. */
export const openingTreeOf = (rows: readonly Pick<CollectionRow, "line" | "result">[]): OpeningTreeNode => {
  const root = building("");
  for (const row of rows) {
    if (row.line === undefined || row.line.length === 0) continue;
    tally(root, row.result);
    let node = root;
    for (const san of row.line) {
      let child = node.children.get(san);
      if (child === undefined) {
        child = building(san);
        node.children.set(san, child);
      }
      tally(child, row.result);
      node = child;
    }
  }
  return finished(root);
};

/**
 * Walk `sans` down from the root **as far as the tree follows them** — the
 * matched moves and the node they reach. A move no game played ends the walk,
 * so a stale link still lands on the last position it shares with the games.
 */
export const openingNodeAt = (
  tree: OpeningTreeNode,
  sans: readonly string[],
): { line: string[]; node: OpeningTreeNode } => {
  const line: string[] = [];
  let node = tree;
  for (const san of sans) {
    const child = node.children.find((candidate) => candidate.san === san);
    if (child === undefined) break;
    line.push(san);
    node = child;
  }
  return { line, node };
};

/** A position no game reached — what a line the tree does not hold leads to. */
const NO_GAMES: OpeningTreeNode = { san: "", count: 0, results: { white: 0, draw: 0, black: 0 }, children: [] };

/**
 * The node the **whole** of `sans` reaches, or a node of no games when the
 * tree does not hold all of it — a line kept as written over a tree of fewer
 * games (the table's other filters), which then has nothing to offer there.
 */
export const openingNodeOn = (tree: OpeningTreeNode, sans: readonly string[]): OpeningTreeNode => {
  const { line, node } = openingNodeAt(tree, sans);
  return line.length === sans.length ? node : NO_GAMES;
};

/** The URL parameter the board's line travels in — the `?at=` encoding, `lib/repertoireLink.ts`. */
export const OPENING_LINE_PARAM = "line";

/** A line as its parameter's value: SAN joined by commas (SAN never holds one). */
export const openingLineParamOf = (line: readonly string[]): string => line.join(",");

/** A parameter's moves, before they are matched against a tree. */
export const openingLineOfParam = (value: string | null | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map((san) => san.trim())
    .filter((san) => san !== "");
