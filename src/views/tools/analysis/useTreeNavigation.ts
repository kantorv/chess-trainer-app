import { useCallback, useEffect, useMemo, useState } from "react";
import type { Arrow } from "react-chessboard";
import { MOVE_ARROW_COLOR } from "../../../lib/gameNavigation";
import {
  fenAtNode,
  findNode,
  lineOf,
  type GameTree,
  type VariationNode,
} from "../../../lib/gameTree";
import { isTextEntry } from "../../shared/useGameNavigation";

/**
 * Where the analysis board is standing in a {@link GameTree}: which node is
 * selected, the position and arrow that follow from it, the line it sits on, and
 * the keyboard stepping that walks it.
 *
 * ## Why this is not `useGameNavigation`
 *
 * That hook's state is a **ply** — an index into one move array — which is the
 * right answer for a game that cannot branch. Here the state has to be a **node
 * id**, because clicking a move inside a side line does not move along the
 * current line, it *changes which line is current*. A ply number cannot express
 * that: ply 3 of which line?
 *
 * So the id is the state and the ply is derived from it — the reverse of the
 * linear hook. What that buys, and what the shared board controls need, is that
 * everything ply-shaped still comes out: {@link TreeNavigation.ply} and
 * `lastPly` index into {@link TreeNavigation.line}, and `goToPly` walks it. The
 * controls and the arrow keys therefore behave exactly as they do on the other
 * two screens, while "the line" quietly follows the reader into a variation.
 */

export type TreeNavigation = {
  /** The selected node; `null` is the start position. */
  nodeId: string | null;
  /** The whole line the selection sits on — its path, and its continuation. */
  line: VariationNode[];
  /** Where the selection sits in `line`: 0 is the start position. */
  ply: number;
  /** The end of that line — what End jumps to. */
  lastPly: number;
  /** The FEN to hand `options.position`. */
  fen: string;
  /** The whole arrow set for this position, to hand `options.arrows`. */
  arrows: Arrow[];
  /** Select a node directly — how a click in the variation tree navigates. */
  goToNode: (id: string | null) => void;
  /** Select by position along the current line. Out-of-range values clamp. */
  goToPly: (ply: number) => void;
};

export const useTreeNavigation = (tree: GameTree): TreeNavigation => {
  const [nodeId, setNodeId] = useState<string | null>(null);

  /*
    Resolved against the tree on read, the way `useGameNavigation` clamps its ply
    on read and for the same reason: a load replaces the tree and the selection
    in one batch, and a selection checked against the tree still on screen would
    be judged against the wrong one. A node the current tree does not hold —
    anything left over from a tree that has been replaced — reads as the start
    position rather than as a crash.
  */
  const selected = findNode(tree, nodeId)?.id ?? null;

  const line = useMemo(() => lineOf(tree, selected), [tree, selected]);
  const ply =
    selected === null ? 0 : line.findIndex((node) => node.id === selected) + 1;
  const lastPly = line.length;

  const goToNode = useCallback((id: string | null) => setNodeId(id), []);

  const goToPly = useCallback(
    (next: number) => {
      const at = Math.min(Math.max(Math.trunc(next), 0), line.length);
      setNodeId(at === 0 ? null : line[at - 1].id);
    },
    [line],
  );

  useEffect(() => {
    /*
      Bound on `document` but tied to this hook's mount, exactly as the linear
      hook's is — this screen is a route, so only one navigation hook is ever
      mounted and there is no second listener to collide with.
    */
    const onKeyDown = (event: KeyboardEvent) => {
      // Leave the browser's own shortcuts (Ctrl+Home, Alt+Left, …) alone.
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTextEntry(event.target)) return;

      switch (event.key) {
        case "ArrowLeft":
          goToPly(ply - 1);
          break;
        case "ArrowRight":
          goToPly(ply + 1);
          break;
        case "Home":
        case "ArrowUp":
          goToPly(0);
          break;
        case "End":
        case "ArrowDown":
          goToPly(lastPly);
          break;
        default:
          // Not ours: no preventDefault, so the panel's own scrolling and every
          // browser shortcut survive.
          return;
      }

      event.preventDefault();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [goToPly, lastPly, ply]);

  const current = findNode(tree, selected);

  return {
    nodeId: selected,
    line,
    ply,
    lastPly,
    fen: fenAtNode(tree, selected),
    /*
      A fresh array every render, and the whole set for this position. Arrows
      passed through `options.arrows` are external and the board never clears
      them itself (`.claude/rules/chessboard.md` §3.4).
    */
    arrows:
      current === null
        ? []
        : [
            {
              startSquare: current.from,
              endSquare: current.to,
              color: MOVE_ARROW_COLOR,
            },
          ],
    goToNode,
    goToPly,
  };
};
