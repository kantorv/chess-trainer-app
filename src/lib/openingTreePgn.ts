import { DEFAULT_POSITION } from "chess.js";

import type { GameHeaders } from "./gameModel";
import { moveTreeToPgn, type PgnMove } from "./gameTree";
import type { OpeningTreeNode } from "./openingTree";

/**
 * **A collection's opening tree as PGN** (CTA-99) — what the Library's
 * opening-moves board saves as *Save tree as PGN*: the tree it draws its arrows
 * from, as one game whose side lines are the other moves the games played.
 *
 * - **What is written** is the subtree **below the position on the board**:
 *   the moves already played (`line`) lead to it, untagged, and every move the
 *   games played from there follows — the whole tree when `line` is empty.
 *   It is the tree the board draws (`openingTreeOf` over the rows the other
 *   filters leave), cut where the games stop branching (CTA-92).
 * - **`children[0]` is the mainline**: `openingTreeOf` sorts each node's
 *   continuations most played first, so the most played move is the line and
 *   the rest are its side lines.
 * - **The counts ride in the move's one comment** as PGN commands, games
 *   first: `[%games N]` — the games that played the move from that position
 *   (`node.count`) — and `[%prc P]` — the move's share of them,
 *   `round(child / parent × 100)`, the number the arrow's width shows and the
 *   play chance the repertoire trainer reads (`lib/playChance.ts`). Neither
 *   is written when neither is asked for.
 *
 * No `chess.js`: the tree holds SAN, and the moves are written by
 * `treeToPgn`'s own writer (`moveTreeToPgn`) from the standard start, which is
 * where every line in the tree begins. It runs only when the reader saves,
 * never per render, and is built with a loop and no spread over big arrays. Pure.
 */

/** Which counts each move below the board's position carries. */
export type OpeningTreePgnTags = {
  /** `[%games N]` — how many of the games played the move there. */
  games: boolean;
  /** `[%prc P]` — the move's share of its position's games, 0–100. */
  prc: boolean;
};

/** The comment carrying a move's counts, or none when no count is asked for. */
const countComment = (
  count: number,
  parentCount: number,
  tags: OpeningTreePgnTags,
): string[] | undefined => {
  const marks: string[] = [];
  if (tags.games) marks.push(`[%games ${count}]`);
  // A node with no games has no children, so `parentCount` is never 0 here.
  if (tags.prc) marks.push(`[%prc ${Math.round((count / parentCount) * 100)}]`);
  return marks.length === 0 ? undefined : [marks.join(" ")];
};

/**
 * The opening tree below `node` as a PGN game: `line` — the moves that reach
 * `node` from the standard start — then every continuation under it, each
 * carrying the counts `tags` asks for. `headers` are written as given, with
 * `Result "*"`: a tree of many games has no result of its own.
 */
export const openingTreeToPgn = (
  line: readonly string[],
  node: OpeningTreeNode,
  tags: OpeningTreePgnTags,
  headers: GameHeaders = {},
): string => {
  const below: PgnMove[] = [];
  const pending: { from: OpeningTreeNode; ply: number; into: PgnMove[] }[] = [
    { from: node, ply: line.length, into: below },
  ];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    const { from, ply, into } = next;
    for (const child of from.children) {
      const comments = countComment(child.count, from.count, tags);
      const move: PgnMove & { children: PgnMove[] } = {
        san: child.san,
        ply: ply + 1,
        children: [],
        ...(comments === undefined ? {} : { comments }),
      };
      into.push(move);
      pending.push({ from: child, ply: ply + 1, into: move.children });
    }
  }

  // The moves already played lead to it, one line, carrying nothing.
  let moves: readonly PgnMove[] = below;
  for (let index = line.length - 1; index >= 0; index -= 1) {
    moves = [{ san: line[index], ply: index + 1, children: moves }];
  }

  return moveTreeToPgn({ headers: { ...headers, Result: "*" }, startFen: DEFAULT_POSITION, moves });
};
