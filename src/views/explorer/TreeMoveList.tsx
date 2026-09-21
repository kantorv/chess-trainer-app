import { useCallback, useMemo, useState } from "react";
import type { Score } from "../../lib/engineAnalysis";
import {
  hasComments,
  mainlineGame,
  type GameTree,
  type VariationNode,
} from "../../lib/gameTree";
import type { PieceMask } from "../../lib/pieceMask";
import MoveList from "../shared/MoveList";
import type { MenuAnchor } from "../shared/moveContextMenu";
import MoveContextMenu, { type MoveMenuTarget } from "./MoveContextMenu";

/**
 * **The variations explorer, for every v2 board** — the shared `MoveList`
 * over a {@link GameTree}, with each side line hanging as an indented run
 * under the mainline move it branches from. (It was "the merged move list"
 * when CTA-53 introduced it; CTA-64 gave it its move menu and its name;
 * CTA-72 moved it out of `views/dev/core/` into the shared explorer, whose
 * Moves part it is — `useVariationsExplorer` renders it, and a screen that
 * wants only the list may render it directly, as the dev boards do.)
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
 *
 * A move carrying a PGN comment is marked with the comment icon (CTA-69):
 * the mainline's by ply (`annotatedPlies`, built here), a side line's off its
 * own node (`markCommentedNodes`). And the engine's evals are printed on
 * the mainline's cells only (`mainlineEvalsOnly`): a side line reads as a
 * line of moves, not as a column of scores.
 *
 * The optional `extensionIds` (CTA-63) cross the same seam: the list tints
 * side-line tokens by node id and numbered cells by ply, so the mainline's
 * share of the set is translated to plies here, once per change.
 *
 * **It is also the variations explorer** (CTA-64): given `onEditTree`, a
 * right-click on any move opens `MoveContextMenu` — promote, make main line,
 * delete from here, copy the line's PGN — and an edit comes back out as a new
 * tree for the screen to hand its core (`replaceTree`). The seam again: a
 * numbered cell reports a ply, translated here to its mainline node. The two
 * handlers the list receives only set this component's menu state, so they
 * are stable across steps and the memoised list is not re-rendered by one; the
 * menu is a sibling of the list, outside its memo. Without `onEditTree` nothing
 * is bound and a right-click is the browser's — every consumer but the
 * repertoire player.
 */
function TreeMoveList({
  tree,
  mainlineNodes,
  nodeId,
  onSelectNode,
  evalsByFen,
  mask,
  extensionIds,
  onEditTree,
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
  /** Moves to tint as added this session — the Play repertoire screen's. */
  extensionIds?: ReadonlySet<string>;
  /** Opt-in: the move menu, and where its edits go (CTA-64). */
  onEditTree?: (next: GameTree) => void;
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

  const extensionPlies = useMemo(() => {
    if (extensionIds === undefined) return undefined;
    const plies = new Set<number>();
    mainlineNodes.forEach((node, index) => {
      if (extensionIds.has(node.id)) plies.add(index + 1);
    });
    return plies;
  }, [extensionIds, mainlineNodes]);

  // The mainline's commented moves, by ply — the seam again (CTA-69); a side
  // line's tokens read their own node.
  const annotatedPlies = useMemo(() => {
    const plies = new Set<number>();
    mainlineNodes.forEach((node, index) => {
      if (hasComments(node)) plies.add(index + 1);
    });
    return plies;
  }, [mainlineNodes]);

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

  const [menu, setMenu] = useState<MoveMenuTarget | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const editable = onEditTree !== undefined;

  const openMenuAtNode = useCallback((id: string, anchor: MenuAnchor) => {
    setMenu({ nodeId: id, anchor });
    setMenuOpen(true);
  }, []);

  const openMenuAtPly = useCallback(
    (ply: number, anchor: MenuAnchor) => {
      const node = mainlineNodes[ply - 1];
      if (node !== undefined) openMenuAtNode(node.id, anchor);
    },
    [mainlineNodes, openMenuAtNode],
  );

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const list = (
    <MoveList
      game={game}
      currentPly={mainlinePly}
      onSelectPly={selectPly}
      evalsByFen={evalsByFen}
      branches={branches}
      currentNodeId={nodeId}
      onSelectNode={onSelectNode}
      mask={mask}
      extensionIds={extensionIds}
      extensionPlies={extensionPlies}
      annotatedPlies={annotatedPlies}
      markCommentedNodes
      mainlineEvalsOnly
      onContextMenuPly={editable ? openMenuAtPly : undefined}
      onContextMenuNode={editable ? openMenuAtNode : undefined}
    />
  );

  if (!editable) return list;
  return (
    <>
      {list}
      <MoveContextMenu
        tree={tree}
        target={menu}
        open={menuOpen}
        onClose={closeMenu}
        onEditTree={onEditTree}
      />
    </>
  );
}

export default TreeMoveList;
