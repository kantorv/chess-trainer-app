import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Chip from "@mui/material/Chip";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import BookmarkAddRoundedIcon from "@mui/icons-material/BookmarkAddRounded";
import { useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { ChessboardOptions } from "react-chessboard";

import { parseFen } from "../../../lib/fen";
import AnalysisSettings from "../../tools/analysis/AnalysisSettings";
import VariationTree from "../../tools/analysis/VariationTree";
import CurrentOpening from "../../shared/CurrentOpening";
import BoardShell from "../core/BoardShell";
import TreeMoveList from "../core/TreeMoveList";
import { findDevSavedOpening } from "../core/devStores";
import { useOpeningsV2 } from "./useOpeningsV2";

/**
 * **Openings v2** (`/dev/openings`) — an opening explored on a board composed
 * from the unified core
 * ([`.claude/rules/chessboard-v2.md`](../../../../.claude/rules/chessboard-v2.md) §4).
 *
 * Two things are this screen's own, and both are in the slots rather than in a
 * hook of its own:
 *
 * - the **book continuations**, listed explorer-style in the panel's footer
 *   slot and drawn as arrows through the board-options slot — one arrow per
 *   known move, the hovered one recoloured, and the whole external set
 *   recomputed on every position and hover (`chessboard.md` §3.4);
 * - the **save**, a button in the header slot with a note beside it. Nothing
 *   here writes on its own: an opening is explored and discarded far more often
 *   than it is kept.
 *
 * Everything else — the eval bar, the captured strips, the pinned variations,
 * the merged move list with the engine's evals, the next-moves stepping, the
 * board controls — is the core's, which is how this screen came to have
 * CTA-51/53/54/55 without a line of its own for any of them.
 *
 * The variation tree stays available as a tab: a flowing line is what an
 * explorer reads when comparing two replies, and it is the one view the merged
 * list does not replace.
 */
function OpeningsV2() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();

  const requestedFen = searchParams.get("fen");
  const initialFen = useMemo(() => {
    if (requestedFen === null) return undefined;
    try {
      return parseFen(requestedFen);
    } catch {
      return undefined;
    }
  }, [requestedFen]);

  const resume = useMemo(
    () => findDevSavedOpening(searchParams.get("openings")),
    [searchParams],
  );

  const state = useOpeningsV2({ fen: initialFen, resume });

  const [tab, setTab] = useState("moves");
  const [note, setNote] = useState("");

  const boardOptions: ChessboardOptions = { arrows: state.arrows };
  const topLine = state.analysis.lines.find((line) => line !== undefined);

  /*
    The explorer: one row per known continuation, with its ECO code and name.
    Hovering a row recolours that move's arrow on the board — the green→red
    language `lib/openings.ts` owns — and clicking it plays the move, which at
    an earlier ply branches the tree there.
  */
  const explorer = (
    <Box data-testid="dev-openings-explorer" sx={{ display: "grid", gap: 0.25 }}>
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        {t("dev.book.title")}
      </Typography>
      {state.nextMoves.length === 0 ? (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {t("dev.book.empty")}
        </Typography>
      ) : (
        <Box sx={{ display: "grid", gap: 0.25, maxHeight: 160, overflowY: "auto" }}>
          {state.nextMoves.map((move) => (
            <ButtonBase
              key={move.san}
              data-testid={`dev-openings-move-${move.san}`}
              onClick={() => state.playMove(move.san)}
              onMouseEnter={() => state.setHoveredMove(move)}
              onMouseLeave={() => state.setHoveredMove(null)}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                justifyContent: "flex-start",
                px: 0.5,
                py: 0.25,
                borderRadius: 1,
                minWidth: 0,
                "&:hover": { bgcolor: "action.hover" },
              }}
            >
              <Typography
                component="span"
                dir="ltr"
                variant="body2"
                sx={{ fontWeight: 700, minWidth: 48 }}
              >
                {move.san}
              </Typography>
              <Chip size="small" dir="ltr" label={move.opening.eco} />
              <Typography
                component="span"
                variant="body2"
                dir="ltr"
                sx={{
                  color: "text.secondary",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {move.opening.name}
              </Typography>
            </ButtonBase>
          ))}
        </Box>
      )}
    </Box>
  );

  return (
    <BoardShell
      id="dev-openings"
      core={state}
      score={topLine?.score ?? null}
      showEvalBar={state.showEvalBar}
      boardOptions={boardOptions}
      panel={{
        header: (
          <>
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <CurrentOpening
                fen={state.fen}
                testId="dev-openings-current-opening"
              />
            </Box>
            <FormControlLabel
              sx={{ flexShrink: 0 }}
              control={
                <Switch
                  checked={state.engineOn}
                  data-testid="dev-openings-setting-engine"
                  onChange={(event) => state.setEngineOn(event.target.checked)}
                />
              }
              label={t("analysis.settings.engineOn")}
            />
          </>
        ),
        analysis: state.analysis,
        requestedMultiPv: state.settings.multiPv,
        engineOn: state.engineOn,
        onPlayVariation: state.playVariation,
        activeTab: tab,
        onTabChange: setTab,
        tabs: [
          {
            id: "moves",
            label: t("dev.tabs.moves"),
            content: (
              <TreeMoveList
                tree={state.tree}
                mainlineNodes={state.mainlineNodes}
                nodeId={state.nodeId}
                onSelectNode={state.goToNode}
                evalsByFen={state.evalsByFen}
              />
            ),
          },
          {
            id: "engine",
            label: t("dev.tabs.engine"),
            content: (
              <AnalysisSettings
                settings={state.settings}
                onChange={state.updateSettings}
                engineOptions={state.engineOptions}
                engineOn={state.engineOn}
                showEvalBar={state.showEvalBar}
                onShowEvalBarChange={state.setShowEvalBar}
                onClear={state.newGame}
              />
            ),
          },
          {
            id: "tree",
            label: t("dev.tabs.tree"),
            content: (
              <VariationTree
                tree={state.tree}
                currentId={state.nodeId}
                onSelectNode={state.goToNode}
              />
            ),
          },
        ],
        /*
          The footer is this screen's own half: the explorer, and the save.
          Button-triggered, because an opening is explored and discarded far
          more often than it is kept — see the hook's header note.
        */
        footer: (
          <Box sx={{ display: "grid", gap: 0.5 }}>
            {explorer}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <TextField
                size="small"
                fullWidth
                label={t("dev.controls.save")}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                slotProps={{
                  htmlInput: { "data-testid": "dev-openings-note" },
                }}
              />
              <Button
                size="small"
                variant="outlined"
                startIcon={<BookmarkAddRoundedIcon fontSize="small" />}
                data-testid="dev-openings-save"
                onClick={() => state.saveOpening(note)}
                sx={{ flexShrink: 0 }}
              >
                {t("dev.controls.save")}
              </Button>
            </Box>
            {state.savedNote !== null && (
              <Typography
                variant="caption"
                data-testid="dev-openings-saved"
                sx={{ color: "success.main" }}
              >
                {t("dev.controls.saved")}
              </Typography>
            )}
          </Box>
        ),
      }}
    />
  );
}

export default OpeningsV2;
