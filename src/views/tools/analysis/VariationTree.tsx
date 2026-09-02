import { useEffect, useRef, type Ref } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import { plyLabel, type GameTree, type VariationNode } from "../../../lib/gameTree";

/**
 * The move list for a game that branches: the mainline as a run of numbered
 * moves, and every side line indented under the move it answers.
 *
 * ## Why this is not `MoveList`
 *
 * The shared list renders a game as a three-column grid — number, White, Black —
 * which works because a linear game has exactly one move per half-move slot. A
 * variation has nowhere to go in that grid: it is not a third column, it is a
 * *branch off one cell*. So this list flows moves inline instead, the way a book
 * or lichess prints them, and a side line becomes an indented block after the
 * move it replaces. `MoveList` is untouched and still serves the two linear
 * screens.
 *
 * Presentational, like its sibling: the selected node comes in as a prop and
 * goes out through `onSelectNode`, so `useTreeNavigation` owns the state and
 * this renders against a fixture tree.
 *
 * SAN is Latin text in a panel that mirrors under Hebrew, so every token carries
 * `dir="ltr"` — an **attribute**, never a CSS declaration, which the RTL emotion
 * cache would flip into the bug it is meant to prevent (see the root
 * `CLAUDE.md`). The indentation is `paddingInlineStart`, which follows the
 * reading direction on its own.
 */

type VariationTreeProps = {
  tree: GameTree;
  /** The selected node; `null` is the start position. */
  currentId: string | null;
  onSelectNode: (id: string | null) => void;
};

const sanTokenSx = {
  unicodeBidi: "isolate",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "0.8125rem",
} as const;

const moveSx = {
  paddingInline: 0.5,
  paddingBlock: 0.125,
  borderRadius: 0.5,
  minWidth: 0,
} as const;

const selectedMoveSx = {
  bgcolor: "primary.main",
  color: "primary.contrastText",
  fontWeight: 700,
} as const;

/** One clickable move, with its number when the numbering has to be restated. */
function MoveToken({
  node,
  startFen,
  forceNumber,
  isCurrent,
  onSelect,
  activeRef,
}: {
  node: VariationNode;
  startFen: string;
  forceNumber: boolean;
  isCurrent: boolean;
  onSelect: (id: string) => void;
  activeRef: Ref<HTMLButtonElement>;
}) {
  const { number, isWhiteMove } = plyLabel(startFen, node.ply);
  // White's move always carries its number; Black's carries one only at the head
  // of a line, or where a side line has just interrupted the reader's place.
  const prefix = isWhiteMove
    ? `${number}. `
    : forceNumber
      ? `${number}… `
      : "";

  return (
    <ButtonBase
      ref={isCurrent ? activeRef : undefined}
      dir="ltr"
      data-testid={`tree-move-${node.id}`}
      data-san={node.san}
      aria-current={isCurrent ? "true" : undefined}
      onClick={() => onSelect(node.id)}
      sx={{ ...moveSx, ...sanTokenSx, ...(isCurrent ? selectedMoveSx : {}) }}
    >
      {`${prefix}${node.san}`}
    </ButtonBase>
  );
}

/**
 * One run of alternatives: the first is the line, the rest are side lines drawn
 * under it. The same shape `treeToPgn` writes, and for the same reason — it is
 * how a branch reads.
 */
function Line({
  nodes,
  startFen,
  forceNumber,
  currentId,
  onSelectNode,
  activeRef,
}: {
  nodes: readonly VariationNode[];
  startFen: string;
  forceNumber: boolean;
  currentId: string | null;
  onSelectNode: (id: string) => void;
  activeRef: Ref<HTMLButtonElement>;
}) {
  const { t } = useTranslation();
  const [main, ...alternatives] = nodes;
  if (main === undefined) return null;

  return (
    <>
      <MoveToken
        node={main}
        startFen={startFen}
        forceNumber={forceNumber}
        isCurrent={main.id === currentId}
        onSelect={onSelectNode}
        activeRef={activeRef}
      />

      {alternatives.map((alternative) => (
        <Box
          key={alternative.id}
          data-testid={`tree-variation-${alternative.id}`}
          role="group"
          aria-label={t("analysis.tree.variation")}
          sx={{
            // A block in the middle of an inline flow: the side line gets its
            // own row, indented from the line it branches off.
            width: "100%",
            paddingInlineStart: 1.5,
            marginBlock: 0.25,
            borderInlineStart: "2px solid",
            borderColor: "divider",
            color: "text.secondary",
          }}
        >
          {/* A side line is a line of its own, so it restates its number. */}
          <Line
            nodes={[alternative]}
            startFen={startFen}
            forceNumber
            currentId={currentId}
            onSelectNode={onSelectNode}
            activeRef={activeRef}
          />
        </Box>
      ))}

      <Line
        nodes={main.children}
        startFen={startFen}
        // A side line between two moves breaks the reader's place, so the move
        // after it restates its number.
        forceNumber={alternatives.length > 0}
        currentId={currentId}
        onSelectNode={onSelectNode}
        activeRef={activeRef}
      />
    </>
  );
}

function VariationTree({ tree, currentId, onSelectNode }: VariationTreeProps) {
  const { t } = useTranslation();
  const activeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    // `block: "nearest"` scrolls the panel's own scrolling box and stops there.
    // Optional call: jsdom implements no scrolling and leaves this undefined.
    activeRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [currentId]);

  return (
    <Box data-testid="variation-tree">
      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
        {t("analysis.tree.title")}
      </Typography>

      <ButtonBase
        ref={currentId === null ? activeRef : undefined}
        data-testid="tree-move-start"
        aria-current={currentId === null ? "true" : undefined}
        onClick={() => onSelectNode(null)}
        sx={{
          ...moveSx,
          justifyContent: "flex-start",
          width: "100%",
          my: 0.5,
          fontSize: "0.8125rem",
          ...(currentId === null ? selectedMoveSx : {}),
        }}
      >
        {t("moveList.startPosition")}
      </ButtonBase>

      {tree.moves.length === 0 ? (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {t("analysis.tree.empty")}
        </Typography>
      ) : (
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            columnGap: 0.25,
            rowGap: 0.25,
          }}
        >
          <Line
            nodes={tree.moves}
            startFen={tree.startFen}
            forceNumber
            currentId={currentId}
            onSelectNode={onSelectNode}
            activeRef={activeRef}
          />
        </Box>
      )}
    </Box>
  );
}

export default VariationTree;
