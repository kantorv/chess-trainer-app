import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import SportsEsportsRoundedIcon from "@mui/icons-material/SportsEsportsRounded";
import { createSearchParams, useNavigate, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { Arrow, ChessboardOptions } from "react-chessboard";

import { parseFen } from "../../../lib/fen";
import { initialPlyOf, parseMoveParam } from "../../../lib/gameNavigation";
import { resolveGameReference } from "../../../lib/gameReference";
import { findNode, type VariationNode } from "../../../lib/gameTree";
import { parsePgnTree } from "../../../lib/pgn";
import AnalysisSettings from "../../tools/analysis/AnalysisSettings";
import NextMovesBar from "../../tools/analysis/NextMovesBar";
import { nextMoveArrowsOf } from "../../tools/analysis/nextMoveArrows";
import CopyableValue from "../../shared/CopyableValue";
import CurrentOpening from "../../shared/CurrentOpening";
import BoardShell from "../core/BoardShell";
import TreeMoveList from "../core/TreeMoveList";
import { findDevSavedAnalysis } from "../core/devStores";
import { useAnalysisBoardV2 } from "./useAnalysisBoardV2";

/**
 * **Analysis v2** (`/dev/analysis`) — the reference board of the unified core
 * ([`.claude/rules/chessboard-v2.md`](../../../../.claude/rules/chessboard-v2.md) §4).
 *
 * It is the shipped Analysis Board's feature set, assembled rather than
 * written: the tree and the node navigation are the base's, the engine and the
 * per-FEN evals are a capability's, the eval bar / captured strips / board
 * arithmetic and the whole panel skeleton are the shell's. What is left here —
 * and it is all that is left on any derived board — is the **arrivals**, the
 * **slots**, and the state the slots need.
 *
 * The three arrivals are the shipped screen's, verbatim in shape: `?fen=`
 * (a position), `?game=`+`?move=` (a whole game out of a library catalog) and
 * `?analysis=` (one of this screen's own dev records). Each is validated here
 * and handed to the hook as *initial* state, because arriving at the URL is
 * what mounts the screen. The game is re-read from its PGN with `parsePgnTree`
 * rather than taken from the catalog's parsed `Game`: the catalog holds a
 * mainline, and side lines are the one thing an analysis board is for.
 *
 * The next-moves bar (CTA-54) is two halves with one owner, the way it is on
 * the shipped screen: its tokens go into the panel's **footer** slot and its
 * arrows into the **board options** slot, so the open tab, the continuations
 * and the hovered move are this component's state.
 */
function AnalysisV2() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  /* The position handed over by a `?fen=`, parsed once. A link nobody can read
     opens on the starting position, as if the parameter had not been there. */
  const requestedFen = searchParams.get("fen");
  const initialFen = useMemo(() => {
    if (requestedFen === null) return undefined;
    try {
      return parseFen(requestedFen);
    } catch {
      return undefined;
    }
  }, [requestedFen]);

  /* A whole game out of a catalog. Resolved and parsed once; a reference that
     names nothing opens the screen empty rather than throwing on a bad link. */
  const arrived = useMemo(
    () => resolveGameReference(searchParams.get("game")),
    [searchParams],
  );
  const initialTree = useMemo(() => {
    if (arrived === undefined) return undefined;
    try {
      return parsePgnTree(arrived.pgn);
    } catch {
      return undefined;
    }
  }, [arrived]);

  /* The `?move=` that rode beside it, then the game's own `StartPly` tag. */
  const initialPly = useMemo(
    () =>
      parseMoveParam(searchParams.get("move")) ??
      (arrived === undefined ? undefined : initialPlyOf(arrived.game)),
    [searchParams, arrived],
  );

  /* One of this screen's own dev records, handed back by id. */
  const resume = useMemo(
    () => findDevSavedAnalysis(searchParams.get("analysis")),
    [searchParams],
  );

  const state = useAnalysisBoardV2({
    fen: initialFen,
    tree: initialTree,
    ply: initialPly,
    resume,
    // The one line that says this board's work outlives the tab — and it goes
    // to the dev key, never the shipped one (`core/devStores.ts`).
    persist: true,
  });

  const [tab, setTab] = useState("moves");
  const [hoveredNextMove, setHoveredNextMove] = useState<VariationNode | null>(
    null,
  );
  const [fenText, setFenText] = useState("");
  const [fenError, setFenError] = useState<string | null>(null);

  /*
    The continuations of the position on screen (CTA-54) — what the pinned bar
    offers and the board arrows draw. The children of the node the reader
    stands on, or the tree's own first moves at the start; the tree orders them
    (`children[0]` is the mainline at every level) and two or more of them is
    the fork the bar appears at.
  */
  const continuations = useMemo(
    () =>
      state.nodeId === null
        ? state.tree.moves
        : (findNode(state.tree, state.nodeId)?.children ?? []),
    [state.tree, state.nodeId],
  );

  /*
    External arrows are controlled: the board never clears or adds to them
    itself (`chessboard.md` §3.4), so this is the whole set, recomputed on
    every step, click and hover — and drawn only under the same
    Moves-tab-at-a-fork gate the bar renders under.
  */
  const arrows: Arrow[] =
    tab === "moves" && continuations.length >= 2
      ? nextMoveArrowsOf(continuations, hoveredNextMove?.id)
      : [];

  const boardOptions: ChessboardOptions = { arrows };

  const topLine = state.analysis.lines.find((line) => line !== undefined);

  /** Continue the position at the node on screen against the engine, in dev. */
  const onPlayFromHere = () =>
    navigate({
      pathname: "/dev/play",
      search: createSearchParams({ fen: state.fen }).toString(),
    });

  const onLoadFen = () => {
    try {
      state.loadFen(fenText);
      setFenError(null);
    } catch (cause) {
      setFenError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <BoardShell
      id="dev-analysis"
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
                testId="dev-analysis-current-opening"
              />
            </Box>
            <Button
              size="small"
              variant="outlined"
              startIcon={<SportsEsportsRoundedIcon fontSize="small" />}
              data-testid="dev-analysis-play-from-here"
              onClick={onPlayFromHere}
              sx={{ flexShrink: 0 }}
            >
              {t("analysis.playFromHere")}
            </Button>
            <FormControlLabel
              sx={{ flexShrink: 0 }}
              control={
                <Switch
                  checked={state.engineOn}
                  data-testid="dev-analysis-setting-engine"
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
        // Present, so the pinned lines are clickable (CTA-55).
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
                onClear={state.clearBoard}
              />
            ),
          },
          {
            id: "position",
            label: t("dev.tabs.position"),
            content: (
              <Box sx={{ display: "grid", gap: 2 }}>
                <CopyableValue
                  label={t("analysis.position.currentFen")}
                  value={state.fen}
                  testId="dev-analysis-fen"
                />
                <CopyableValue
                  label={t("analysis.position.currentPgn")}
                  value={state.pgn}
                  testId="dev-analysis-pgn"
                />
                <Box sx={{ display: "grid", gap: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {t("analysis.position.fenTitle")}
                  </Typography>
                  <TextField
                    size="small"
                    dir="ltr"
                    label={t("analysis.position.fenLabel")}
                    value={fenText}
                    onChange={(event) => setFenText(event.target.value)}
                    slotProps={{
                      htmlInput: { "data-testid": "dev-analysis-fen-input" },
                    }}
                  />
                  <Button
                    size="small"
                    variant="outlined"
                    data-testid="dev-analysis-load-fen"
                    onClick={onLoadFen}
                  >
                    {t("analysis.position.loadFen")}
                  </Button>
                  {fenError !== null && (
                    <Typography
                      variant="body2"
                      data-testid="dev-analysis-fen-error"
                      sx={{ color: "error.main" }}
                    >
                      {fenError}
                    </Typography>
                  )}
                </Box>
              </Box>
            ),
          },
        ],
        footer:
          tab === "moves" ? (
            <NextMovesBar
              nodes={continuations}
              onSelect={state.goToNode}
              onHover={setHoveredNextMove}
            />
          ) : undefined,
      }}
    />
  );
}

export default AnalysisV2;
