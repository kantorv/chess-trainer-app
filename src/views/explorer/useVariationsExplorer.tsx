import { useCallback, useMemo, useState } from "react";
import type { Arrow } from "react-chessboard";
import { useTranslation } from "react-i18next";

import type { Score } from "../../lib/engineAnalysis";
import {
  commentsAt,
  findNode,
  plyLabel,
  setComments,
  type CommentKind,
  type GameTree,
  type VariationNode,
} from "../../lib/gameTree";
import { annotationsAt } from "../../lib/moveAnnotations";
import { playChances, playChanceOf } from "../../lib/playChance";
import type { MapCoverage } from "../../lib/treeMap";
import NextMovesBar from "../tools/analysis/NextMovesBar";
import {
  nextMoveArrowsOf,
  REQUIRED_MOVE_ARROW_COLOR,
} from "../tools/analysis/nextMoveArrows";
import AnnotationsBar, { type CommentEditing } from "./AnnotationsBar";
import ChanceArrows from "./ChanceArrows";
import CommentDialog, { type CommentDraft } from "./CommentDialog";
import TreeMap from "./TreeMap";
import TreeMoveList from "./TreeMoveList";
import type { TreeViewParts, TreeViewSource } from "./treeView";

/** The map part's own options — what to draw it from, and what it may do. */
export type ExplorerMapOptions = {
  /** The tree to draw — `source.tree` by default. */
  tree?: GameTree;
  /** Where its marker sits, on that tree — `source.nodeId` by default. */
  nodeId?: string | null;
  /** How many lines are left under each position; none draws every line alike. */
  coverage?: MapCoverage;
  /** Moves to ring in the extension colour. */
  addedIds?: ReadonlySet<string>;
  /** A written move's dot goes to its position (`source.goToNode`). */
  linked?: boolean;
};

/** The arrows part's options. */
export type ExplorerArrowOptions = {
  /** Draw every continuation (`nextMoveArrowsOf`); off, only a hovered one. */
  show: boolean;
  /** Where the branch on screen carries `prc` marks, size the arrows by them (CTA-71). */
  chances?: boolean;
  /**
   * Moves the screen insists on, drawn whatever `show` says and in place of
   * everything else — an instruction, not a hint (a repertoire game's
   * required moves).
   */
  required?: readonly VariationNode[];
};

export type VariationsExplorerOptions = {
  /** The root of every test id the parts carry. */
  testId: string;
  source: TreeViewSource;
  /** The engine's scores by FEN — printed on the mainline's cells. */
  evalsByFen?: ReadonlyMap<string, Score>;
  /** Moves to tint as added this session. */
  extensionIds?: ReadonlySet<string>;
  /**
   * **Opt-in editing**: the right-click move menu on the list and the map,
   * and the comment block's add / edit / delete — every edit a new tree
   * handed here (the core's `replaceTree`). Absent, the explorer is read-only.
   */
  onEditTree?: (next: GameTree) => void;
  /**
   * Whether the move menu offers *Play chances…* (on by default) — a board
   * with no trainer to play by them (the Analysis Board, CTA-73) turns it off.
   */
  playChances?: boolean;
  /** Show the comment block. */
  annotations?: boolean;
  /** The arrows part; absent draws none but a hovered move's. */
  arrows?: ExplorerArrowOptions;
  /** The map part; absent, `parts.map` is `undefined`. */
  map?: ExplorerMapOptions;
};

const NO_ARROWS: ExplorerArrowOptions = { show: false };

/**
 * **The rich variations explorer, as a tree-view mode** (CTA-72) — the
 * repertoire player's Moves tab, Map tab, comment block, next-moves bar and
 * arrows, built from one {@link TreeViewSource} and handed back as
 * {@link TreeViewParts} for the screen to place. The spec — every feature,
 * required or opt-in — is `.claude/rules/tree-views.md` §2.
 *
 * What it owns is the state those parts share and no screen should repeat:
 * the hovered continuation (the bar sets it, the arrows read it), the
 * play chances at the branch on screen (the overlay's widths and the bar's
 * percentages, one array so they never disagree), and the comment being
 * edited (the block opens it, the dialog saves it). What it does not own is
 * anything a screen means: which tree the map draws, whose coverage, which
 * moves are required, whether editing is allowed — those are options.
 *
 * The performance rules stand (CTA-61): the list receives the source's own
 * stable `goToNode` and `onEditTree`, the move menus live outside its memo,
 * and nothing here walks the tree per step but the continuations lookup,
 * which reads the core's per-tree index.
 */
export function useVariationsExplorer({
  testId,
  source,
  evalsByFen,
  extensionIds,
  onEditTree,
  playChances: offerPlayChances,
  annotations: showAnnotations = false,
  arrows: arrowOptions = NO_ARROWS,
  map,
}: VariationsExplorerOptions): TreeViewParts {
  const { t } = useTranslation();
  const { tree, nodeId, goToNode } = source;

  const [hovered, setHovered] = useState<VariationNode | null>(null);
  const continuations = useMemo(
    () => (nodeId === null ? tree.moves : (findNode(tree, nodeId)?.children ?? [])),
    [tree, nodeId],
  );
  // The chances the overlay's arrows are sized by and the bar's percentages
  // print by — only where the branch on screen carries an explicit `prc`
  // mark; with none anywhere the green/blue pair stands. Read off the
  // source's tree, so a chance changed in the dialog counts before it is
  // saved.
  const chanceArrows = arrowOptions.chances === true;
  const chances = useMemo(() => {
    if (!chanceArrows || !continuations.some((node) => playChanceOf(node) !== undefined)) {
      return undefined;
    }
    return playChances(continuations);
  }, [chanceArrows, continuations]);

  // A required move is an instruction, so it is drawn whatever the switch
  // says. Where the chances are on, the library arrows stand down entirely —
  // colour is the only thing `options.arrows` can vary per arrow — and the
  // overlay draws them instead, sized by their chances.
  const arrows: Arrow[] =
    arrowOptions.required !== undefined
      ? arrowOptions.required.map((node) => ({
          startSquare: node.from,
          endSquare: node.to,
          color: REQUIRED_MOVE_ARROW_COLOR,
        }))
      : chances !== undefined
        ? []
        : arrowOptions.show
          ? nextMoveArrowsOf(continuations, hovered?.id ?? null)
          : hovered !== null
            ? nextMoveArrowsOf([hovered], hovered.id)
            : [];

  // The play-chance arrows themselves, over the board: white with a magenta
  // border, the wider the likelier the move (CTA-71).
  const overlay =
    chances === undefined ? null : (
      <ChanceArrows
        testId={`${testId}-chance-arrows-overlay`}
        nodes={continuations}
        chances={chances}
        hoveredId={hovered?.id ?? null}
        orientation={source.orientation}
      />
    );

  /*
    What the PGN says at the position on screen (CTA-69), and its editing:
    each add, edit and delete is a `setComments` edit handed to `onEditTree`,
    the path every other edit to the tree takes. The dialog's target names
    the node, so its save edits the tree as it is when it lands (the draft is
    built here, on each render).
  */
  const annotations = useMemo(
    () => (showAnnotations ? annotationsAt(tree, nodeId) : null),
    [showAnnotations, tree, nodeId],
  );
  const annotatedLabel = useMemo(() => {
    const node = findNode(tree, nodeId);
    if (node === null) return t("moveList.startPosition");
    const { number, isWhiteMove } = plyLabel(tree.startFen, node.ply);
    return `${number}${isWhiteMove ? "." : "…"} ${node.san}`;
  }, [tree, nodeId, t]);

  const [commentEdit, setCommentEdit] = useState<{
    nodeId: string | null;
    kind: CommentKind;
    /** `null` adds one after the move's others. */
    index: number | null;
  } | null>(null);
  const editComments = useCallback(
    (at: string | null, kind: CommentKind, next: (list: string[]) => string[]) => {
      if (onEditTree === undefined) return;
      const edited = setComments(tree, at, kind, next([...commentsAt(tree, at, kind)]));
      if (edited !== tree) onEditTree(edited);
    },
    [tree, onEditTree],
  );
  const commentDraft: CommentDraft | null =
    commentEdit === null
      ? null
      : {
          label: annotatedLabel,
          initial:
            commentEdit.index === null
              ? ""
              : (commentsAt(tree, commentEdit.nodeId, commentEdit.kind)[commentEdit.index] ?? ""),
          onSave: (text) =>
            editComments(commentEdit.nodeId, commentEdit.kind, (list) =>
              commentEdit.index === null
                ? [...list, text]
                : list.map((old, index) => (index === commentEdit.index ? text : old)),
            ),
        };
  const commentEditing: CommentEditing | undefined =
    onEditTree === undefined
      ? undefined
      : {
          onAdd: () => setCommentEdit({ nodeId, kind: "comments", index: null }),
          onEdit: (kind, index) => setCommentEdit({ nodeId, kind, index }),
          onDelete: (kind, index) =>
            editComments(nodeId, kind, (list) => list.filter((_, at) => at !== index)),
        };

  return {
    moves: (
      <TreeMoveList
        tree={tree}
        mainlineNodes={source.mainlineNodes}
        nodeId={nodeId}
        onSelectNode={goToNode}
        extensionIds={extensionIds}
        evalsByFen={evalsByFen}
        onEditTree={onEditTree}
        playChances={offerPlayChances}
      />
    ),
    map:
      map === undefined ? undefined : (
        <TreeMap
          testId={`${testId}-map`}
          tree={map.tree ?? tree}
          addedIds={map.addedIds}
          coverage={map.coverage}
          nodeId={map.nodeId === undefined ? nodeId : map.nodeId}
          onSelectNode={map.linked === true ? goToNode : undefined}
          onEditTree={onEditTree}
          playChances={offerPlayChances}
        />
      ),
    annotations: showAnnotations ? (
      <>
        {annotations !== null && (
          <AnnotationsBar
            testId={`${testId}-annotations`}
            label={annotatedLabel}
            annotations={annotations}
            editing={commentEditing}
          />
        )}
        <CommentDialog draft={commentDraft} onClose={() => setCommentEdit(null)} />
      </>
    ) : undefined,
    nextMoves: (
      <NextMovesBar
        nodes={continuations}
        onSelect={goToNode}
        onHover={setHovered}
        chances={chances}
      />
    ),
    arrows,
    overlay,
  };
}
