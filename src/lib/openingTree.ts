import type { CollectionRow } from "./libraryCollections";

/**
 * **A collection's opening tree** (CTA-76) — every game's opening moves merged
 * into one tree, what the Library table's opening-moves board is drawn from:
 * the continuations of the position on it, each with the games that played it.
 *
 * It is built **in memory from the index's rows** — each row's `line`, its
 * whole mainline as SAN (uncapped by CTA-92), written once when the collection
 * came in (`lib/collectionIndex.ts`) — so nothing is parsed and no `chess.js`
 * runs: 10,000 games of ~90-ply lines merge in about 150 ms (the 7,818-game
 * fixture measured), so the table rebuilds it whenever its other filters
 * change. Keyed by SAN,
 * as `mergeTrees` (`lib/gameTree.ts`) merges a repertoire, but a node records
 * the games through it instead of annotations.
 *
 * **The tree is cut where the games stop branching** (CTA-92): a node a single
 * game passed keeps no children, so the tree extends exactly as far as there
 * is a choice to offer and no further — a lone game's tail draws no lone
 * arrow. A tree holding one game — a one-game collection, or filters narrowed
 * to a single game — is kept whole, so the board stays walkable to its end.
 * The cut is why lines are stored whole: it is a rule over the collection's
 * branching, which no single row can know.
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
  /**
   * The continuations, the most played first (ties in the order they first
   * appeared) — **cut where the games stop branching** (CTA-92): a node a
   * single game passed keeps none, so the tree offers a choice exactly as
   * far as there is one, and a lone game's tail draws no lone arrow. A tree
   * holding one game is kept whole — see {@link openingTreeOf}.
   */
  children: readonly OpeningTreeNode[];
  /**
   * Where the cut landed: one game goes on past this position, alone, so the
   * tree stops here rather than drawing a lone arrow for the rest of it. The
   * board's caption says so. Present only on a leaf the cut made.
   */
  continues?: true;
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

/**
 * The building node as its finished shape. In a tree of more games than one,
 * a node a single game passed is the cut: it keeps no children, and
 * {@link OpeningTreeNode.continues} says where that stopped the walk. A tree
 * of one game (`single`) is kept whole — with nothing to branch from, the
 * walk is the game, and the board stays walkable to its end.
 */
const finished = (node: Building, single: boolean): OpeningTreeNode => {
  const cut = !single && node.count === 1 && node.children.size > 0;
  return {
    san: node.san,
    count: node.count,
    results: node.results,
    // A stable sort, and a Map iterates in insertion order — ties stay first-seen.
    children: cut
      ? []
      : [...node.children.values()].sort((a, b) => b.count - a.count).map((child) => finished(child, single)),
    ...(cut ? { continues: true } : {}),
  };
};

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
  return finished(root, root.count === 1);
};

/**
 * Walk `sans` down from the root **as far as the tree follows them** — the
 * matched moves and the node they reach. A move no game played ends the walk,
 * and so does the cut, past which the tree holds nothing although a game
 * continues — so a stale link still lands on the last position it shares
 * with the games.
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
