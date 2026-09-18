import { Chess, type Square } from "chess.js";
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
 * ## Game mode: a move is judged before it is made
 *
 * With game mode on, a reader's move at one of *their* turns inside the
 * repertoire is marked right or wrong **before** it reaches the board
 * ({@link judgeDrop}): a move the repertoire has is a success, any other legal
 * move is a failure, and the module takes a failure back by refusing the drop.
 * So a wrong move never enters the tree and never becomes an extension. It is
 * judged by the squares the piece moves from and to (every node carries them),
 * with `chess.js` used only to *read* whether the drop is legal: an illegal drop
 * snaps back and is not a failure. What a verdict is worth is the screen's
 * business ({@link DrillScore}).
 *
 * What this module deliberately does not do: write anything back to the stored
 * repertoire (the screen never modifies the record).
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
) => pickUniform(repertoireMovesAt(repertoire, nodeId), random);

/** One of `moves`, each equally likely; `undefined` when there are none. */
export const pickUniform = (
  moves: readonly VariationNode[],
  random: () => number = Math.random,
): VariationNode | undefined => {
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

/**
 * What game mode makes of a drop, before the board applies it.
 *
 * - `unjudged` — nothing to judge: the repertoire has no move here (its line
 *   ended, or the reader left it), or the drop is not a legal move at all;
 * - `book` — one of the repertoire's moves; `nodes` are the repertoire's
 *   nodes it can be (several only for a promotion). For a promotion,
 *   `promotions` lists the pieces the repertoire promotes to (`"q"`, `"n"`,
 *   …), and the verdict waits for the picker;
 * - `wrong` — a legal move the repertoire does not have.
 */
export type DropJudgement =
  | { kind: "unjudged" }
  | {
      kind: "book";
      nodes: readonly VariationNode[];
      promotions?: ReadonlySet<string>;
    }
  | { kind: "wrong" };

/**
 * Judge a drop from `from` to `to` in `fen`, the position at `nodeId`, against
 * the repertoire's moves there. Whose turn it is, is the caller's question —
 * a drill judges only the reader's own moves.
 */
export const judgeDrop = (
  repertoire: GameTree,
  nodeId: string | null,
  fen: string,
  from: string,
  to: string,
): DropJudgement => {
  const book = repertoireMovesAt(repertoire, nodeId);
  if (book.length === 0) return { kind: "unjudged" };

  let legal: boolean;
  try {
    legal = new Chess(fen)
      .moves({ square: from as Square, verbose: true })
      .some((move) => move.to === to);
  } catch {
    return { kind: "unjudged" };
  }
  if (!legal) return { kind: "unjudged" };

  const matches = book.filter((node) => node.from === from && node.to === to);
  if (matches.length === 0) return { kind: "wrong" };

  const promotions = new Set(
    matches.flatMap((node) => {
      const piece = /=([QRBN])/.exec(node.san)?.[1];
      return piece === undefined ? [] : [piece.toLowerCase()];
    }),
  );
  return promotions.size > 0
    ? { kind: "book", nodes: matches, promotions }
    : { kind: "book", nodes: matches };
};

/** What one judged position came to. */
export type DrillVerdict = "success" | "fail";

/** A game-mode session's score: how many positions were got right, and wrong. */
export type DrillScore = { successes: number; failures: number };

export const EMPTY_DRILL_SCORE: DrillScore = { successes: 0, failures: 0 };

/** The score with one more verdict counted. */
export const withVerdict = (score: DrillScore, verdict: DrillVerdict): DrillScore =>
  verdict === "success"
    ? { ...score, successes: score.successes + 1 }
    : { ...score, failures: score.failures + 1 };

/** The share of positions got right, 0–100, or `undefined` before the first. */
export const drillAccuracy = (score: DrillScore): number | undefined => {
  const total = score.successes + score.failures;
  return total === 0 ? undefined : Math.round((score.successes / total) * 100);
};
