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

/** The node with this id, or `null` — including for `null`, which is ply 0. */
export const findNode = (
  tree: GameTree,
  id: string | null,
): VariationNode | null =>
  id === null ? null : walker(tree).findBy((node) => node.id === id);

/**
 * The chain of moves from the start position down to `id`, inclusive. Empty for
 * `null` (the start position itself) and for an id the tree does not hold.
 */
export const pathTo = (tree: GameTree, id: string | null): VariationNode[] =>
  id === null ? [] : (walker(tree).getPath((node) => node.id === id) ?? []);

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
  move: { san: string; from: Square; to: Square; fen: string },
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
