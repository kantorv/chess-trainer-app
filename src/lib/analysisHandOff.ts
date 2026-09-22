import { Chess } from "chess.js";

import { addMove, emptyTree, treeToPgn, type GameTree } from "./gameTree";
import { parsePgnTree } from "./pgn";

/**
 * **A whole tree handed to the Analysis Board** (CTA-78) — the third arrival
 * beside `?fen=` (a position) and `?game=` (a reference into a store).
 *
 * The Openings explorer hands over what the reader explored — every side line
 * and comment — and a tree does not fit in a query parameter, nor is it in any
 * store `?game=` could name. So it travels in the **router's location state**:
 * `navigate("/tools/analysis?at=…", { state: analysisHandOffState(…) })`. The
 * tree goes as PGN (`treeToPgn`, comments and side lines kept) so the state is
 * plain, structured-cloneable text, and comes back through `parsePgnTree`; the
 * position on screen rides as the usual `?at=` beside it, and the orientation
 * in the state.
 *
 * The Analysis Board reads it once, on arrival, as a **new unsaved board** —
 * the way a PGN loaded in its Load tab arrives. The browser keeps a history
 * entry's state across a reload, so the board keeps it on its own URL writes
 * until the reader loads or saves something else.
 *
 * Non-throwing: a state that is not a hand-off, or whose PGN will not parse,
 * reads as no hand-off at all, and the board opens as if it were not there.
 *
 * The reference, trade-offs and gotchas:
 * [`.claude/rules/openings-explorer.md`](../../.claude/rules/openings-explorer.md) §5.
 */

export type AnalysisHandOff = {
  tree: GameTree;
  orientation: "white" | "black";
};

/** The location state the Analysis Board reads a hand-off from. */
export type AnalysisHandOffState = {
  analysisHandOff: { pgn: string; orientation: "white" | "black" };
};

export const analysisHandOffState = (
  tree: GameTree,
  orientation: "white" | "black",
): AnalysisHandOffState => ({
  analysisHandOff: { pgn: treeToPgn(tree), orientation },
});

export const analysisHandOffOf = (state: unknown): AnalysisHandOff | undefined => {
  if (typeof state !== "object" || state === null) return undefined;
  const handOff = (state as { analysisHandOff?: unknown }).analysisHandOff;
  if (typeof handOff !== "object" || handOff === null) return undefined;
  const { pgn, orientation } = handOff as { pgn?: unknown; orientation?: unknown };
  if (typeof pgn !== "string") return undefined;
  try {
    return {
      tree: parsePgnTree(pgn),
      orientation: orientation === "black" ? "black" : "white",
    };
  } catch {
    return undefined;
  }
};

/**
 * One line from a start position, played SAN by SAN — how a board with
 * nothing behind it but a position (the Openings explorer) turns its own
 * `?at=` link back into the moves it names. Stops at the first SAN that is
 * not legal there, so a stale link goes as far as it still reads.
 */
export const lineTreeOf = (startFen: string, sans: readonly string[]): GameTree => {
  let tree = emptyTree(startFen);
  let nodeId: string | null = null;
  let chess: Chess;
  try {
    chess = new Chess(startFen);
  } catch {
    return tree;
  }
  for (const san of sans) {
    let move;
    try {
      move = chess.move(san);
    } catch {
      break;
    }
    ({ tree, nodeId } = addMove(tree, nodeId, {
      san: move.san,
      from: move.from,
      to: move.to,
      fen: chess.fen(),
      ...(move.captured === undefined ? {} : { captured: move.captured }),
    }));
  }
  return tree;
};
