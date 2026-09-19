import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { lastMoveSquareStyles } from "../../../lib/gameNavigation";
import {
  fenAtNode,
  findNode,
  lineOf,
  mainline,
  pathTo,
  type GameTree,
  type VariationNode,
} from "../../../lib/gameTree";
import { isTextEntry } from "../../shared/useGameNavigation";

/**
 * Where the analysis board is standing in a {@link GameTree}: which node is
 * selected, the position and highlight that follow from it, the line it sits
 * on, and the keyboard stepping that walks it.
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
 *
 * ## The keys
 *
 * ← / → step along the line; **Home / End** jump to its start and end; and
 * **↑ / ↓ cycle through the sibling moves** of the move on screen — the other
 * continuations from the same position, in `children` order, wrapping around
 * (CTA-69; they used to be a second Home / End). Nothing happens at the start
 * position or on a move with no alternatives. What it is for: with the
 * repertoire player's Autoplay on, the reader swaps the trainer's reply for
 * another of the file's, and moving from there sets the trainer going again
 * — navigation drops nothing it owes, since a reply is owed only after the
 * reader's own move (`useTrainerModule`).
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
  /** The last-move highlight for this position, to hand `options.squareStyles`. */
  squareStyles: Record<string, CSSProperties>;
  /** Select a node directly — how a click in the variation tree navigates. */
  goToNode: (id: string | null) => void;
  /** Select by position along the current line. Out-of-range values clamp. */
  goToPly: (ply: number) => void;
};

/**
 * The move beside `id` among its siblings — `step` 1 the next, -1 the
 * previous, wrapping around; `null` when it has none, or for the start.
 */
export const siblingOf = (tree: GameTree, id: string | null, step: 1 | -1): string | null => {
  if (id === null) return null;
  const path = pathTo(tree, id);
  const siblings = path.length <= 1 ? tree.moves : (path.at(-2)?.children ?? []);
  if (siblings.length < 2) return null;
  const at = siblings.findIndex((node) => node.id === id);
  if (at === -1) return null;
  return siblings[(at + step + siblings.length) % siblings.length].id;
};

export const useTreeNavigation = (
  tree: GameTree,
  initialPly?: number,
  initialNodeId?: string | null,
): TreeNavigation => {
  /*
    Two ways to seed the selection, both read once and never again.

    `initialNodeId` is a **reopened analysis**: the node the reader was standing
    on, already resolved against this tree by `useAnalysisBoard` (a stored path
    of SAN, not an id — see `lib/savedAnalyses.ts`). It wins, because it can name
    a place inside a side line, which is the one thing a ply cannot say.

    `initialPly` is a `?move=` arrival: the mainline ply the URL named. The state
    is a node id (see above), so the ply is walked to its mainline node here;
    past the end of the mainline it clamps to the last node, exactly as
    `goToPly` would clamp it.
  */
  const [nodeId, setNodeId] = useState<string | null>(() => {
    if (initialNodeId !== undefined && initialNodeId !== null) {
      return initialNodeId;
    }
    if (initialPly === undefined || initialPly <= 0) return null;
    const line = mainline(tree);
    if (line.length === 0) return null;
    return line[Math.min(Math.trunc(initialPly), line.length) - 1].id;
  });

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
          goToPly(0);
          break;
        case "End":
          goToPly(lastPly);
          break;
        case "ArrowUp":
        case "ArrowDown": {
          // No alternative: nothing moves, but the key is still ours, so the
          // panel does not scroll under the reader instead.
          const next = siblingOf(tree, selected, event.key === "ArrowDown" ? 1 : -1);
          if (next !== null) setNodeId(next);
          break;
        }
        default:
          // Not ours: no preventDefault, so the panel's own scrolling and every
          // browser shortcut survive.
          return;
      }

      event.preventDefault();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [goToPly, lastPly, ply, tree, selected]);

  const current = findNode(tree, selected);

  return {
    nodeId: selected,
    line,
    ply,
    lastPly,
    fen: fenAtNode(tree, selected),
    /*
      A fresh map every render, and the whole set for this position. Styles
      passed through `options.squareStyles` are external and the board never
      clears them itself (`.claude/rules/chessboard.md` §3.3).
    */
    squareStyles:
      current === null ? {} : lastMoveSquareStyles(current.from, current.to),
    goToNode,
    goToPly,
  };
};
