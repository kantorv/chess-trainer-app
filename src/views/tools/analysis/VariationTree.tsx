import { useMemo } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import type { GameTree } from "../../../lib/gameTree";
import {
  MoveSelectionContext,
  useMoveSelectionStore,
  useScrollWhenCurrent,
} from "../../shared/moveSelection";
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
 *
 * The tokens are rendered **once per tree**: which one is current is read by
 * each token from a selection store (`views/shared/moveSelection.ts`), so a
 * step re-renders the two tokens whose highlight changed, not the tree.
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
  const selection = useMoveSelectionStore({
    nodeId: currentId,
    ply: -1,
    evalsByFen: undefined,
  });

  // The structure, once per tree — see the header note.
  const body = useMemo(
    () =>
      tree.moves.length === 0 ? (
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
            onSelectNode={onSelectNode}
            groupLabel={t("moveList.variation")}
          />
        </Box>
      ),
    [tree, emptyText, t, onSelectNode],
  );

  return (
    <MoveSelectionContext.Provider value={selection}>
      <Box data-testid="variation-tree">
        <StartToken
          isCurrent={currentId === null}
          onSelect={() => onSelectNode(null)}
        />
        {body}
      </Box>
    </MoveSelectionContext.Provider>
  );
}

/** The start-position row. Current when nothing else is. */
function StartToken({
  isCurrent,
  onSelect,
}: {
  isCurrent: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const ref = useScrollWhenCurrent<HTMLButtonElement>(isCurrent);
  return (
    <ButtonBase
      ref={ref}
      data-testid="tree-move-start"
      aria-current={isCurrent ? "true" : undefined}
      onClick={onSelect}
      sx={{
        ...moveSx,
        justifyContent: "flex-start",
        width: "100%",
        my: 0.5,
        fontSize: "0.8125rem",
        ...(isCurrent ? selectedTokenSx : {}),
      }}
    >
      {t("moveList.startPosition")}
    </ButtonBase>
  );
}

export default VariationTree;
