import { findNode, pathTo, type GameTree, type VariationNode } from "./gameTree";
import { pickUniform, repertoireMovesAt, type TrainerPolicy } from "./repertoireTrainer";

/**
 * **The repertoire games** (CTA-63) — what a game played over a repertoire is,
 * as pure functions. The screen (`views/repertoires/RepertoirePlayer.tsx`) and
 * the trainer module (`views/dev/core/useTrainerModule.ts`) do the playing;
 * this file only answers questions about the repertoire and what has been
 * covered of it.
 *
 * Two games, both played with game mode's rules (every move of the reader's
 * inside the repertoire judged before it is made, a wrong one taken back —
 * `judgeDrop` in `lib/repertoireTrainer.ts`):
 *
 * - **Get to the end** (`end`) — the trainer picks among its moves at random,
 *   as in the player; the reader's goal is to reach the end of a line.
 * - **Backtracking** (`backtrack`) — the goal is to cover **every** line. A
 *   *line* is a leaf of the repertoire as it arrived (a node with no
 *   children), and it is *covered* once play reaches it. Three things follow,
 *   and each is one function here:
 *   - the trainer steers towards lines not yet covered
 *     ({@link backtrackingPolicy});
 *   - at the reader's turn, where only some of their repertoire moves still
 *     lead to uncovered lines, those moves are **required**
 *     ({@link requiredMovesAt}) — the screen marks them with an arrow and says
 *     so, and the module refuses the others (not a failure: they are the
 *     repertoire's moves, just finished ones);
 *   - when a line ends, play goes back to the deepest position on the way that
 *     still has an uncovered line under it ({@link backtrackTarget}).
 *
 * Coverage is keyed by leaf id — the repertoire's own ids, which the session
 * tree keeps (`addMove` only mints ids for new moves), so a leaf reached in the
 * session is a leaf of the original.
 */

export type RepertoireGameId = "end" | "backtrack";

/** Every game, in the order the menu lists them. */
export const REPERTOIRE_GAMES: readonly RepertoireGameId[] = ["end", "backtrack"];

/** Where a repertoire's game lives. */
export const repertoireGamePath = (id: string, game: RepertoireGameId) =>
  `/repertoires/${encodeURIComponent(id)}/games/${game}`;

/** Whether a URL segment names a game. */
export const isRepertoireGameId = (value: unknown): value is RepertoireGameId =>
  typeof value === "string" && (REPERTOIRE_GAMES as readonly string[]).includes(value);

/** Whether `nodeId` is the end of one of the repertoire's lines. */
export const isRepertoireLeaf = (repertoire: GameTree, nodeId: string | null): boolean => {
  if (nodeId === null) return false;
  const node = findNode(repertoire, nodeId);
  return node !== null && node.children.length === 0;
};

/**
 * How many uncovered lines lie under each position — the one walk every
 * Backtracking question reads. `under(null)` is the whole repertoire.
 */
export type Coverage = {
  /** Every line of the repertoire. */
  total: number;
  /** Lines not yet covered under `nodeId` (itself included, when it is a leaf). */
  under: (nodeId: string | null) => number;
};

/**
 * The coverage of `repertoire` given the covered leaf ids. One post-order walk,
 * iterative — a repertoire can be thousands of nodes and hundreds deep.
 */
export const coverageOf = (
  repertoire: GameTree,
  covered: ReadonlySet<string>,
): Coverage => {
  const open = new Map<string, number>();
  let total = 0;
  // Parents before children on the way in; counted children-first on the way out.
  const order: VariationNode[] = [];
  const stack: VariationNode[] = [...repertoire.moves];
  for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
    order.push(node);
    stack.push(...node.children);
  }
  for (let index = order.length - 1; index >= 0; index -= 1) {
    const node = order[index];
    if (node.children.length === 0) {
      total += 1;
      open.set(node.id, covered.has(node.id) ? 0 : 1);
    } else {
      open.set(
        node.id,
        node.children.reduce((sum, child) => sum + (open.get(child.id) ?? 0), 0),
      );
    }
  }
  const root = repertoire.moves.reduce((sum, node) => sum + (open.get(node.id) ?? 0), 0);
  return {
    total,
    under: (nodeId) => (nodeId === null ? root : (open.get(nodeId) ?? 0)),
  };
};

/**
 * The Backtracking trainer: one of its moves that still leads to an uncovered
 * line, uniformly — or, where everything under here is covered, any of them
 * (the reader walked into finished territory; the line still has to be
 * answered from the book).
 */
export const backtrackingPolicy =
  (coverage: Coverage): TrainerPolicy =>
  (repertoire, nodeId, random = Math.random) => {
    const moves = repertoireMovesAt(repertoire, nodeId);
    const open = moves.filter((node) => coverage.under(node.id) > 0);
    return pickUniform(open.length > 0 ? open : moves, random);
  };

/**
 * The moves the reader must choose from at `nodeId`: the repertoire's moves
 * there that still lead to an uncovered line — but only when that is **some**
 * of them. When all of them do, or none, there is nothing to require.
 */
export const requiredMovesAt = (
  repertoire: GameTree,
  nodeId: string | null,
  coverage: Coverage,
): readonly VariationNode[] | undefined => {
  const moves = repertoireMovesAt(repertoire, nodeId);
  const open = moves.filter((node) => coverage.under(node.id) > 0);
  return open.length > 0 && open.length < moves.length ? open : undefined;
};

/**
 * Where play goes back to once the line ending at `leafId` is covered: the
 * deepest position on the way to it that still has an uncovered line under it
 * — `null` for the start position — or `undefined` when every line is covered.
 * `coverage` must already count `leafId` as covered.
 */
export const backtrackTarget = (
  repertoire: GameTree,
  leafId: string,
  coverage: Coverage,
): string | null | undefined => {
  const path = pathTo(repertoire, leafId);
  for (let index = path.length - 2; index >= 0; index -= 1) {
    if (coverage.under(path[index].id) > 0) return path[index].id;
  }
  return coverage.under(null) > 0 ? null : undefined;
};
