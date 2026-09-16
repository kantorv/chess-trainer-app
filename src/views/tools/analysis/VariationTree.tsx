import { useEffect, useRef } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import type { GameTree } from "../../../lib/gameTree";
import { moveSx, selectedTokenSx } from "../../shared/moveTokenSx";
import { VariationLine } from "../../shared/VariationLine";

/**
 * The flowing move list for a game that branches: the mainline as a run of
 * numbered moves, and every side line indented under the move it answers —
 * the way a book or lichess prints a variation.
 *
 * The Analysis Board no longer renders this (CTA-53): its Moves tab is one
 * merged list — the shared `MoveList`, with each side line hanging under the
 * mainline move it branches from. The two screens that read a *flowing* line
 * still do: the Openings explorer and the Library repertoire viewer, where
 * the whole tree is the content and there is no numbered-pairs grid beside it.
 * The move pieces themselves live in `views/shared/VariationLine.tsx`, shared
 * with `MoveList`, so the two renderings cannot drift apart.
 *
 * Presentational, like its sibling: the selected node comes in as a prop and
 * goes out through `onSelectNode`, so `useTreeNavigation` owns the state and
 * this renders against a fixture tree in tests.
 *
 * SAN is Latin text in a panel that mirrors under Hebrew, so every token
 * carries `dir="ltr"` — an **attribute**, never a CSS declaration, which the
 * RTL emotion cache would flip into the bug it is meant to prevent (see the
 * root `CLAUDE.md`). The indentation is `paddingInlineStart`, which follows
 * the reading direction on its own.
 */

type VariationTreeProps = {
  tree: GameTree;
  /** The selected node; `null` is the start position. */
  currentId: string | null;
  onSelectNode: (id: string | null) => void;
  /**
   * What an empty tree says. Defaults to the Analysis Board's own hint, which
   * mentions its Position tab; a screen without one (the Openings explorer)
   * passes its own.
   */
  emptyText?: string;
};

function VariationTree({ tree, currentId, onSelectNode, emptyText }: VariationTreeProps) {
  const { t } = useTranslation();
  const activeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    // `block: "nearest"` scrolls the panel's own scrolling box and stops there.
    // Optional call: jsdom implements no scrolling and leaves this undefined.
    activeRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [currentId]);

  return (
    <Box data-testid="variation-tree">
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
          ...(currentId === null ? selectedTokenSx : {}),
        }}
      >
        {t("moveList.startPosition")}
      </ButtonBase>

      {tree.moves.length === 0 ? (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {emptyText ?? t("analysis.tree.empty")}
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
          <VariationLine
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
