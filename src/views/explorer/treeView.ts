import type { ReactNode } from "react";
import type { Arrow } from "react-chessboard";
import type { GameTree, VariationNode } from "../../lib/gameTree";

/**
 * **The one seam between a board screen and a game-tree view** (CTA-72) —
 * the whole architecture is these two types. The spec, the mode set and the
 * recipe for a new mode are in
 * [`.claude/rules/tree-views.md`](../../../.claude/rules/tree-views.md).
 *
 * A screen hands a view a {@link TreeViewSource} — the game and where the
 * reader stands in it, which the v2 core's `useBoardCore` return already
 * *is*, structurally — plus the mode's own options, and gets back
 * {@link TreeViewParts}: ready-made pieces it places into its own slots
 * (`BoardPanel`'s tabs and footer, `BoardShell`'s `boardOptions.arrows` and
 * `overlay`). The view never renders a panel, a shell or a tab strip, and it
 * never learns what the screen is — no saved record, no trainer, no game:
 * those arrive as plain options (a set of ids to tint, a coverage, a list of
 * required moves) or stay the screen's.
 *
 * A **mode** is a hook from a source and its options to parts. The
 * variations explorer (`useVariationsExplorer`) is the one built; `flat` and
 * `puzzle` are specified in the rules file against these same two types, so
 * adding either is a new hook beside it and nothing else.
 */

/** The view modes. Only `explorer` is built; see the rules file for the others. */
export type TreeViewMode = "explorer";

/** What every tree view reads: the game, the reader's place in it, and the way to move them. */
export type TreeViewSource = {
  /** The game, side lines and all. */
  tree: GameTree;
  /** Its mainline, already walked (`useBoardCore`'s) — not re-walked by a view. */
  mainlineNodes: readonly VariationNode[];
  /** The node on screen; `null` is the start position. */
  nodeId: string | null;
  /** Navigation — every view that lets the reader pick a move goes through it. */
  goToNode: (id: string | null) => void;
  /** Which way the board faces — what an overlay over the board is drawn for. */
  orientation: "white" | "black";
};

/**
 * What a view hands back. Every part is optional but `moves`, `arrows` and
 * `overlay`: a part the mode or its options leave out is `undefined`, and the
 * screen simply has nothing to place.
 */
export type TreeViewParts = {
  /** The move list — a Moves tab's content. */
  moves: ReactNode;
  /** The tree drawn as a map — a Map tab's content. */
  map?: ReactNode;
  /** What the PGN says at the position on screen — a footer piece. */
  annotations?: ReactNode;
  /** The moves on offer from the position on screen — a footer piece. */
  nextMoves?: ReactNode;
  /** The board's `options.arrows` — the whole external set (`chessboard.md` §3.4). */
  arrows: Arrow[];
  /** Drawn over the board (`BoardShell`'s `overlay`); `null` for none. */
  overlay: ReactNode;
};
