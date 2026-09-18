import { DEFAULT_POSITION, type Square } from "chess.js";
import {
  gameTag,
  initialFenOf,
  type Game,
  type GameHeaders,
} from "./gameModel";
import { startNumbering } from "./gameNavigation";
import { TreeManager } from "./treeManager";

/**
 * The **variation tree**: a game where more than one move can follow a
 * position.
 *
 * `Game` in {@link ./gameModel} is one line of play — a move array. That is the
 * right shape for a game read out of a PGN or grown against the engine, and both
 * shipped screens keep reading it. It cannot express what an analysis board is
 * for: stepping back to move 8 and playing something else has to *keep* both
 * continuations, which is a tree.
 *
 * So this module holds the tree, and a `Game` becomes a **walk over one** —
 * {@link mainlineGame} is the first-child walk, and it is what lets the shared
 * move list, the ply navigation and the board controls keep working against a
 * tree-shaped game with no branching of their own. The two directions are both
 * available: {@link treeFromGame} lifts a linear game into a tree,
 * {@link mainlineGame} flattens one back.
 *
 * ## Shape
 *
 * The tree is plain data and every node carries the FEN of the position *after*
 * its move, exactly as `GameMove` does — so jumping to a node is reading a
 * string, and nothing re-simulates a game. `moves` is the list of alternatives
 * at the very first half-move, and `moves[0]` is the mainline the way
 * `children[0]` is at every deeper level: **the first child is the mainline, the
 * rest are variations.**
 *
 * ## Identity
 *
 * Nodes carry an `id` minted from the tree's own counter rather than derived
 * from their position, because the screen's "where am I" state is a node id and
 * it has to survive moves being added elsewhere in the tree. Ids are stable for
 * the life of a tree and every operation here returns a new tree rather than
 * mutating one, so React state can hold one directly.
 */

/** One half-move, and everything that can follow it. */
export type VariationNode = {
  /** Unique within its tree, and stable — see the module note on identity. */
  id: string;
  /** Standard algebraic notation, as it is printed — `"Nf3"`, `"O-O"`, `"e8=Q"`. */
  san: string;
  from: Square;
  to: Square;
  /** The position *after* this move. */
  fen: string;
  /** 1-based half-move index from the tree's start position. */
  ply: number;
  /**
   * The piece type this move took, as `chess.js` writes it — `"p"`, `"q"`, …
   * `undefined` when nothing was captured, which a promotion without a capture
   * also is.
   */
  captured?: string;
  /** Continuations. `children[0]` is the mainline; the rest are variations. */
  children: VariationNode[];
};

/** A game that may branch: its tags, the position it starts from, and its moves. */
export type GameTree = {
  headers: GameHeaders;
  /** The position ply 0 shows. Every node's `ply` counts from here. */
  startFen: string;
  /** The alternatives at the first half-move; `moves[0]` is the mainline. */
  moves: VariationNode[];
  /** Source of the next node id. Part of the value so ids stay deterministic. */
  nextId: number;
};

/**
 * The tags a tree carries when it is read as a linear game or written back out
 * as PGN. A non-standard start position is stated in the tags, the way both
 * `Game` producers already state it, so move numbering survives the round trip.
 */
const headersWithStart = (tree: GameTree): GameHeaders =>
  tree.startFen === DEFAULT_POSITION
    ? { ...tree.headers }
    : { SetUp: "1", FEN: tree.startFen, ...tree.headers };

/** An empty tree at `startFen` — the state a fresh analysis board opens in. */
export const emptyTree = (
  startFen: string = DEFAULT_POSITION,
  headers: GameHeaders = {},
): GameTree => ({ headers: { ...headers }, startFen, moves: [], nextId: 1 });

/** Walks over one tree's nodes. The `TreeManager` seam, never a hand-rolled walk. */
const walker = (tree: GameTree) => new TreeManager<VariationNode>(tree.moves);

/** Where one node sits: itself, and the move it answers (`null` at the root). */
type Indexed = { node: VariationNode; parent: VariationNode | null };

/**
 * Every node of a tree by id, built **once per tree** and then read in O(1).
 *
 * A board asks "which node is this id" and "how did the game get here" several
 * times per render — the navigation, the captured strips, the continuations —
 * and each used to be a walk of the whole tree, `pathTo`'s copying an ancestor
 * array at every node it passed. On a 9,146-node repertoire that was most of
 * the cost of a step (CTA-61). Trees are immutable values (the module note),
 * so the index is cached against the tree's `moves` array: any operation that
 * changes the tree hands back a new array, and so a new index, while one that
 * does not (`addMove` replaying a move already there) keeps the old one.
 * A `WeakMap`, so a tree nobody holds takes its index with it.
 */
const indexes = new WeakMap<readonly VariationNode[], Map<string, Indexed>>();

const indexOf = (tree: GameTree): Map<string, Indexed> => {
  const cached = indexes.get(tree.moves);
  if (cached !== undefined) return cached;

  const index = new Map<string, Indexed>();
  for (const root of tree.moves) index.set(root.id, { node: root, parent: null });
  walker(tree).traverse((node) => {
    for (const child of node.children) index.set(child.id, { node: child, parent: node });
  });
  indexes.set(tree.moves, index);
  return index;
};

/** The node with this id, or `null` — including for `null`, which is ply 0. */
export const findNode = (
  tree: GameTree,
  id: string | null,
): VariationNode | null =>
  id === null ? null : (indexOf(tree).get(id)?.node ?? null);

/**
 * The chain of moves from the start position down to `id`, inclusive. Empty for
 * `null` (the start position itself) and for an id the tree does not hold.
 */
export const pathTo = (tree: GameTree, id: string | null): VariationNode[] => {
  if (id === null) return [];
  const index = indexOf(tree);
  const path: VariationNode[] = [];
  for (let at = index.get(id); at !== undefined; ) {
    path.push(at.node);
    at = at.parent === null ? undefined : index.get(at.parent.id);
  }
  return path.reverse();
};

/**
 * Where a node sits, written as the SAN of every move that leads to it —
 * `["e4", "e5", "Nf3"]`. Empty for the start position.
 *
 * **A node id is not portable and this is.** Ids are minted per tree
 * (`nextId`), so the id a reader was standing on means nothing once the same
 * game has been round-tripped through PGN and re-parsed — which is exactly what
 * a saved analysis does (`lib/savedAnalyses.ts`). SAN, on the other hand,
 * identifies a move uniquely within its position, which is the property
 * {@link addMove} already rests on. So a saved analysis records where the reader
 * was as this path and {@link nodeAtSanPath} finds it again.
 */
export const sanPathTo = (tree: GameTree, id: string | null): string[] =>
  pathTo(tree, id).map((node) => node.san);

/**
 * The node a {@link sanPathTo} path names, or `null` for the start position.
 *
 * Non-throwing, and **as far as the path goes**: a path whose next move the tree
 * does not hold stops at the last node that matched, so a record written against
 * a game that has since been edited reopens somewhere real rather than nowhere.
 */
export const nodeAtSanPath = (
  tree: GameTree,
  path: readonly string[] | undefined,
): string | null => {
  let children = tree.moves;
  let found: string | null = null;

  for (const san of path ?? []) {
    const node = children.find((child) => child.san === san);
    if (node === undefined) break;
    found = node.id;
    children = node.children;
  }

  return found;
};

/**
 * How many side lines branch off the tree — not how many moves are in them.
 *
 * `children[0]` is the mainline continuation at every node (the module note
 * above), so every alternative past it is one side line, however many moves
 * long it runs. Counted at every point that can branch, including the very
 * first half-move (`tree.moves` is the alternatives there, the way a deeper
 * node's `children` is everywhere else) — so the total is the sum over every
 * point in the tree of `max(0, alternatives.length - 1)`.
 *
 * The shared home for a count `savedAnalyses.ts` and `savedOpenings.ts` both
 * need for their "N variations" caption: a single 18-move side line is one
 * variation, not eighteen.
 */
export const countVariations = (tree: GameTree): number => {
  const walk = (nodes: readonly VariationNode[]): number =>
    nodes.reduce(
      (total, node) => total + walk(node.children),
      Math.max(0, nodes.length - 1),
    );
  return walk(tree.moves);
};

/** The first-child chain from a starting list — the mainline of that subtree. */
const firstChildChain = (from: VariationNode[]): VariationNode[] => {
  const chain: VariationNode[] = [];
  let next = from[0];
  while (next !== undefined) {
    chain.push(next);
    next = next.children[0];
  }
  return chain;
};

/** The tree's mainline: the first move, its first child, and so on. */
export const mainline = (tree: GameTree): VariationNode[] =>
  firstChildChain(tree.moves);

/**
 * The whole line a node sits on: how the game got to it, plus how it naturally
 * continues (each next move's first child).
 *
 * This is what the board controls step through and what the arrow keys walk, so
 * that "next move" from inside a variation follows *that* variation rather than
 * jumping back to the mainline.
 */
export const lineOf = (tree: GameTree, id: string | null): VariationNode[] => {
  const path = pathTo(tree, id);
  const last = path.at(-1);
  return [...path, ...firstChildChain(last === undefined ? tree.moves : last.children)];
};

/** The position at a node — the tree's start position for `null`. */
export const fenAtNode = (tree: GameTree, id: string | null): string =>
  findNode(tree, id)?.fen ?? tree.startFen;

/**
 * Add a move under `parentId` (`null` for the first half-move) and say which
 * node the game is now at.
 *
 * **Playing a move that is already there is not a new variation.** Stepping back
 * and replaying the same move follows the line that exists — the returned id is
 * the existing node's and the tree comes back unchanged (identical by reference,
 * so nothing re-renders). Only a move that is genuinely new to this position
 * appends a node, and appending is what branches the tree: the first child is
 * the mainline and everything after it is a side line.
 */
export const addMove = (
  tree: GameTree,
  parentId: string | null,
  move: {
    san: string;
    from: Square;
    to: Square;
    fen: string;
    /** The piece type this move took, as `chess.js` writes it. */
    captured?: string;
  },
): { tree: GameTree; nodeId: string } => {
  const parent = findNode(tree, parentId);
  if (parentId !== null && parent === null) {
    // A move under a node this tree does not hold: nothing sensible to append
    // it to, so the tree is left exactly as it was.
    return { tree, nodeId: parentId };
  }

  const siblings = parent === null ? tree.moves : parent.children;
  // SAN identifies a move uniquely within one position, so it is the whole test.
  const existing = siblings.find((node) => node.san === move.san);
  if (existing !== undefined) return { tree, nodeId: existing.id };

  const node: VariationNode = {
    id: `n${tree.nextId}`,
    ...move,
    ply: (parent?.ply ?? 0) + 1,
    children: [],
  };

  const insert = (nodes: VariationNode[]): VariationNode[] =>
    nodes.map((current) =>
      current.id === parentId
        ? { ...current, children: [...current.children, node] }
        : { ...current, children: insert(current.children) },
    );

  return {
    tree: {
      ...tree,
      nextId: tree.nextId + 1,
      moves: parent === null ? [...tree.moves, node] : insert(tree.moves),
    },
    nodeId: node.id,
  };
};

/**
 * Fold several trees into **one** — the "merge" a repertoire file of many
 * games is offered (CTA-61), where each game is one line of the same opening.
 *
 * The first tree is the spine: its mainline stays the mainline, and every
 * later tree is walked in and hung on it — a move already there is followed
 * (SAN identifies a move within a position, `addMove`'s own rule), a move that
 * is not is appended after the moves already under that position, so it
 * becomes a side line there. Every tree's own side lines come along the same
 * way. Ids are minted fresh, `n1`… in the order nodes are first met, and the
 * headers are the caller's.
 *
 * Built **in place** with a flat walk rather than one `addMove` per node,
 * which copies the tree each time — a 310-game file would be quadratic.
 *
 * Every tree must start from `startFen`; a tree that does not is skipped, not
 * forced (its moves mean nothing from another position). The caller decides
 * whether merging is offered at all.
 */
export const mergeTrees = (
  trees: readonly GameTree[],
  startFen: string,
  headers: GameHeaders = {},
): GameTree => {
  const moves: VariationNode[] = [];
  let nextId = 1;

  const into = (target: VariationNode[], source: readonly VariationNode[], ply: number) => {
    for (const node of source) {
      let existing = target.find((candidate) => candidate.san === node.san);
      if (existing === undefined) {
        existing = {
          id: `n${nextId}`,
          san: node.san,
          from: node.from,
          to: node.to,
          fen: node.fen,
          ply,
          captured: node.captured,
          children: [],
        };
        nextId += 1;
        target.push(existing);
      }
      into(existing.children, node.children, ply + 1);
    }
  };

  for (const tree of trees) {
    if (tree.startFen === startFen) into(moves, tree.moves, 1);
  }

  return { headers: { ...headers }, startFen, moves, nextId };
};

/** Lift a linear {@link Game} into a tree with that game as its only line. */
export const treeFromGame = (game: Game): GameTree => {
  const startFen = initialFenOf(game);
  const nodes = game.moves.map((move, index) => ({
    id: `n${index + 1}`,
    san: move.san,
    from: move.from,
    to: move.to,
    fen: move.fen,
    ply: index + 1,
    captured: move.captured,
    children: [] as VariationNode[],
  }));

  nodes.forEach((node, index) => {
    const next = nodes[index + 1];
    if (next !== undefined) node.children.push(next);
  });

  return {
    headers: { ...game.headers },
    startFen,
    moves: nodes.length === 0 ? [] : [nodes[0]],
    nextId: nodes.length + 1,
  };
};

/**
 * Flatten the tree's mainline back into a linear {@link Game}.
 *
 * The bridge the rest of the app reads a tree through: `MoveList`,
 * `useGameNavigation` and `gameNavigation.ts` all speak `Game`, and this is the
 * walk that lets them do it without knowing a tree exists.
 */
export const mainlineGame = (tree: GameTree): Game => ({
  headers: headersWithStart(tree),
  moves: mainline(tree).map((node) => ({
    san: node.san,
    from: node.from,
    to: node.to,
    fen: node.fen,
    ply: node.ply,
    captured: node.captured,
  })),
});

/** The same walk, but down one particular line — the path to `id`. */
export const lineGame = (tree: GameTree, id: string | null): Game => ({
  headers: headersWithStart(tree),
  moves: pathTo(tree, id).map((node) => ({
    san: node.san,
    from: node.from,
    to: node.to,
    fen: node.fen,
    ply: node.ply,
    captured: node.captured,
  })),
});

/**
 * Where a half-move sits in the printed numbering: `1. e4` is
 * `{ number: 1, isWhiteMove: true }`.
 *
 * Read off the tree's start position rather than off the ply alone, because a
 * tree set up from a FEN can begin on Black's move, or at move 24 — the same
 * rule `moveRowsOf` follows for a linear game, through the same helper.
 */
export const plyLabel = (
  startFen: string,
  ply: number,
): { number: number; isWhiteMove: boolean } => {
  const { whiteFirst, firstNumber } = startNumbering(startFen);
  const slot = ply - 1 + (whiteFirst ? 0 : 1);
  return {
    number: firstNumber + Math.floor(slot / 2),
    isWhiteMove: slot % 2 === 0,
  };
};

/**
 * One move as PGN prints it: `"12. Nf3"`, `"Nc6"`, or `"12... Nc6"` when the
 * number has to be restated — at the head of a variation, and again on the
 * first move after one closes.
 */
const writeMove = (
  startFen: string,
  node: VariationNode,
  forceNumber: boolean,
): string => {
  const { number, isWhiteMove } = plyLabel(startFen, node.ply);
  if (isWhiteMove) return `${number}. ${node.san}`;
  return forceNumber ? `${number}... ${node.san}` : node.san;
};

/**
 * Render a list of alternatives: the first as the line, the rest in parentheses
 * behind it, each recursing the same way.
 */
const writeNodes = (
  startFen: string,
  nodes: readonly VariationNode[],
  forceNumber: boolean,
): string => {
  const [main, ...alternatives] = nodes;
  if (main === undefined) return "";

  const parts = [writeMove(startFen, main, forceNumber)];
  for (const alternative of alternatives) {
    // A variation is a complete line of its own, so it always restates the
    // number it starts on.
    parts.push(`(${writeNodes(startFen, [alternative], true)})`);
  }

  // A variation between two moves of the line breaks the reader's place, so the
  // move after it restates its number.
  const rest = writeNodes(startFen, main.children, alternatives.length > 0);
  if (rest !== "") parts.push(rest);

  return parts.join(" ");
};

/**
 * The tree as PGN, side lines included — the export half of the round trip
 * `parsePgnTree` (`lib/pgn.ts`) is the import half of.
 *
 * Written in the export format: the tag pairs, a blank line, then the movetext
 * ending in the result. A non-standard start position is stated as
 * `SetUp`/`FEN`, which is what makes a position set up from a FEN reload as
 * itself.
 */
export const treeToPgn = (tree: GameTree): string => {
  const headers = headersWithStart(tree);
  const tags = Object.entries(headers)
    .map(([key, value]) => `[${key} "${value}"]`)
    .join("\n");

  const result = gameTag(headers, "Result") ?? "*";
  const movetext = writeNodes(tree.startFen, tree.moves, true);

  return `${tags}${tags === "" ? "" : "\n\n"}${
    movetext === "" ? result : `${movetext} ${result}`
  }`;
};

/**
 * A **linear** {@link Game} as PGN — the writer the shared game model was
 * missing, and the one a saved engine game is serialised through
 * (`lib/savedGames.ts`).
 *
 * It is `treeToPgn` over the one-line tree, not a second writer: the move
 * numbering of a game that starts from a FEN, the `SetUp`/`FEN` tags that make
 * it reload as itself and the result terminator are all rules that already live
 * up there, and a copy of them here would be a copy that drifts. A `Game` has no
 * side lines to lose, so lifting it into a tree and writing that back out
 * round-trips through `parsePgnGame` exactly.
 */
export const gameToPgn = (game: Game): string => treeToPgn(treeFromGame(game));
