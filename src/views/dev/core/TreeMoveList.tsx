import { useCallback, useMemo } from "react";
import type { Score } from "../../../lib/engineAnalysis";
import {
  mainlineGame,
  type GameTree,
  type VariationNode,
} from "../../../lib/gameTree";
import type { PieceMask } from "../../../lib/pieceMask";
import MoveList from "../../shared/MoveList";

/**
 * **The merged move list, for every v2 board** (CTA-53) — the shared
 * `MoveList` over a {@link GameTree}, with each side line hanging as an
 * indented run under the mainline move it branches from.
 *
 * It exists because of the **ply↔node seam**. The list speaks plies over the
 * mainline; the navigation state is a node id, because a click inside a side
 * line changes *which line is current* and no number can say that
 * (`useTreeNavigation`). Something has to translate, and before CTA-60 that
 * translation lived inside `AnalysisPanel` — which is exactly why the merged
 * list reached one screen of five. Here it is one component, so the other four
 * get it by composing it.
 *
 * The three rules of the translation, all of them load-bearing:
 *
 * - **A selection that is the start, or a mainline node, is the ply it names.**
 * - **A selection inside a side line is no ply at all**, so `-1` is passed
 *   through and no numbered row of the list highlights. It must not fall back
 *   to 0, which would light the start position while the reader stands
 *   somewhere else entirely.
 * - **A click on a numbered row goes out as the mainline node it names**; a
 *   click on a side-line token goes out as the node *it* names.
 *
 * `children[0]` is the mainline at every level, so everything after it is a
 * side line — which is the whole of how `branches` is built.
 */
function TreeMoveList({
  tree,
  mainlineNodes,
  nodeId,
  onSelectNode,
  evalsByFen,
  mask,
}: {
  tree: GameTree;
  /** The mainline, already walked by the core — not re-walked here. */
  mainlineNodes: readonly VariationNode[];
  nodeId: string | null;
  onSelectNode: (id: string | null) => void;
  /** The engine's scores, keyed by the FEN they describe (CTA-50/51). */
  evalsByFen?: ReadonlyMap<string, Score>;
  /** A masked board prints coordinates for a hidden piece's move. */
  mask?: PieceMask;
}) {
  // Memoised on the tree: the walk reads the whole line, and stepping around
  // inside a side line re-renders the panel without touching it.
  const game = useMemo(() => mainlineGame(tree), [tree]);

  const branches = useMemo(() => {
    const map = new Map<number, readonly VariationNode[]>();
    const rootAlternatives = tree.moves.slice(1);
    if (rootAlternatives.length > 0) map.set(0, rootAlternatives);
    for (const node of mainlineNodes) {
      const alternatives = node.children.slice(1);
      if (alternatives.length > 0) map.set(node.ply, alternatives);
    }
    return map;
  }, [tree, mainlineNodes]);

  const mainlineIndex = mainlineNodes.findIndex((node) => node.id === nodeId);
  const mainlinePly =
    nodeId === null ? 0 : mainlineIndex === -1 ? -1 : mainlineIndex + 1;

  const selectPly = useCallback(
    (ply: number) => {
      if (ply === 0) {
        onSelectNode(null);
        return;
      }
      const node = mainlineNodes[ply - 1];
      // The list only renders rows for the moves it has, so a miss is a ply
      // from nowhere rather than one to clamp to the end.
      if (node === undefined) return;
      onSelectNode(node.id);
    },
    [mainlineNodes, onSelectNode],
  );

  return (
    <MoveList
      game={game}
      currentPly={mainlinePly}
      onSelectPly={selectPly}
      evalsByFen={evalsByFen}
      branches={branches}
      currentNodeId={nodeId}
      onSelectNode={onSelectNode}
      mask={mask}
    />
  );
}

export default TreeMoveList;
