import { findNode, type GameTree, type VariationNode } from "./gameTree";

/**
 * **Playing a repertoire against a trainer** (CTA-63) — the trainer's policy
 * and the session model, as pure functions over {@link GameTree}s. No React,
 * no `chess.js`: the board core plays the move a policy picks
 * (`views/dev/core/useTrainerModule.ts`), and nothing here moves anything.
 *
 * ## The trainer answers from the repertoire, and only from it
 *
 * The trainer is a scripted opponent: at a position where it is its turn, it
 * plays one of the moves the **repertoire** has there — never one the reader
 * added this session, never an engine move. So a policy is always asked about
 * the *original* tree, the record as it was read, not the session's tree that
 * has the reader's extensions hung on it. A node the reader added is not in
 * the original tree at all, so the question "what does the repertoire have
 * here" answers *nothing* for it by construction — which is the whole of why
 * the trainer never moves inside an extension, with no flag to keep in sync.
 *
 * ## A policy is a function, not a mode
 *
 * {@link TrainerPolicy} is the seam every later trainer goes through: a
 * weighted pick, mainline-first, spaced repetition. Each is a new function of
 * this one type, handed to the module in place of {@link pickTrainerMove} —
 * never a branch inside it. The random source is a parameter for the same
 * reason the policy is: a test fixes it, and a later policy may not use one.
 *
 * ## An extension is a node the original tree does not hold
 *
 * Node ids are stable for the life of a tree and `addMove` mints each new node
 * a fresh one (`lib/gameTree.ts`), so "was this move added this session" is
 * one set lookup against the ids the repertoire arrived with —
 * {@link extensionIdsOf}. A fold over the tree, recomputed from values; there
 * is no second record of "what the reader added" to be maintained through
 * every move, and so nothing that can drift from the tree. Everything played
 * under an added node is itself added, so it is an extension too.
 *
 * What this module deliberately does not do: count a deviation as a mistake
 * (a drill mode is a callback on the module, later), or write anything back to
 * the stored repertoire (the screen never modifies the record).
 */

/**
 * Which move the trainer plays at `nodeId` of `repertoire` — `undefined` when
 * the repertoire has none there (its line ended, or the reader left it).
 * `random` returns a number in `[0, 1)`, as `Math.random` does.
 */
export type TrainerPolicy = (
  repertoire: GameTree,
  nodeId: string | null,
  random?: () => number,
) => VariationNode | undefined;

/**
 * The moves the repertoire has at `nodeId`; `null` is the start position.
 * Empty for a node the tree does not hold — an extension, asked about the
 * original tree — rather than falling back to the start position's moves.
 */
export const repertoireMovesAt = (
  repertoire: GameTree,
  nodeId: string | null,
): readonly VariationNode[] => {
  if (nodeId === null) return repertoire.moves;
  return findNode(repertoire, nodeId)?.children ?? [];
};

/**
 * The shipped policy: one of the repertoire's moves at the node, picked
 * **uniformly** — `children[0]` (the mainline) is not favoured, because a
 * drill that always plays the main line never drills the side lines.
 */
export const pickTrainerMove: TrainerPolicy = (
  repertoire,
  nodeId,
  random = Math.random,
) => {
  const moves = repertoireMovesAt(repertoire, nodeId);
  if (moves.length === 0) return undefined;
  // Clamped: a source that returns exactly 1 must not read past the end.
  const index = Math.min(moves.length - 1, Math.floor(random() * moves.length));
  return moves[Math.max(0, index)];
};

/** Every node id a tree holds — what "the repertoire as it arrived" is. */
export const nodeIdsOf = (tree: GameTree): ReadonlySet<string> => {
  const ids = new Set<string>();
  const stack: VariationNode[] = [...tree.moves];
  for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
    ids.add(node.id);
    stack.push(...node.children);
  }
  return ids;
};

/**
 * The nodes of `tree` that are not in `original` — the moves added this
 * session, and everything played under them. Walked iteratively: a
 * repertoire can be thousands of nodes and hundreds deep.
 */
export const extensionIdsOf = (
  tree: GameTree,
  original: ReadonlySet<string>,
): ReadonlySet<string> => {
  const added = new Set<string>();
  const stack: VariationNode[] = [...tree.moves];
  for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
    if (!original.has(node.id)) added.add(node.id);
    stack.push(...node.children);
  }
  return added;
};
