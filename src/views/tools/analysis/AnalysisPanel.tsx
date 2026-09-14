import { useCallback, useMemo, useState, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import SportsEsportsRoundedIcon from "@mui/icons-material/SportsEsportsRounded";
import { useTranslation } from "react-i18next";
import { formatScore } from "../../../lib/engineAnalysis";
import { mainline, mainlineGame } from "../../../lib/gameTree";
import BestVariations from "../../shared/BestVariations";
import BoardControls from "../../shared/BoardControls";
import CurrentOpening from "../../shared/CurrentOpening";
import MoveList from "../../shared/MoveList";
import AnalysisSettings from "./AnalysisSettings";
import VariationTree from "./VariationTree";
import type { AnalysisBoardState } from "./useAnalysisBoard";

/**
 * The Analysis Board's whole right-hand panel: the row above the tabs, a tab
 * strip, the tab's content, and the board controls pinned to the foot — the
 * same three-region column the other two screens use, because it is the same
 * shell aside and the same non-scrolling flex column (`Layout.tsx`).
 *
 * ```
 * ┌──────────────────────────────────┐
 * │ King's Pawn Game  B00  [≡] ▶ Play│  opening + switch + hand-off — fixed
 * ├──────────────────────────────────┤
 * │ Moves │ Engine │ Lines │ Position│  tab strip — fixed
 * ├──────────────────────────────────┤
 * │ the active tab                   │  scrolls
 * ├──────────────────────────────────┤
 * │ |◀ ◀ ▶ ▶|                  flip  │  controls — fixed
 * └──────────────────────────────────┘
 * ```
 *
 * One tab is rendered at a time rather than four with three hidden: the move
 * list scrolls the selection into view, and a hidden copy would be scrolling a
 * zero-height box on every move.
 *
 * The board controls step along **the line the reader is standing on**, which
 * inside a side line is that side line and not the mainline — `useTreeNavigation`
 * derives the ply from the node, so the controls need no notion of a tree.
 *
 * ## The Moves tab, and the ply↔node seam
 *
 * The tab is the shared `MoveList` over the **mainline** — the same
 * numbered-pairs list the linear screens use, with the engine's evals beside
 * each scored move (CTA-51) — and the variation tree **stays below it, in the
 * same scrolling region**: side lines are the one thing this screen is for, so
 * they stay visible and navigable under the list rather than moving to a tab
 * of their own.
 *
 * The list speaks plies and the navigation state is a node id (a click inside
 * a side line changes *which line is current* — a number cannot say that, see
 * `useTreeNavigation`), so this panel is where the two meet. A click on a ply
 * translates to the mainline node it names; a selection inside a side line is
 * no ply at all, so no row of the list highlights. The board controls, which
 * also speak plies, go the other way — through `state.goToPly`, which walks
 * the line the reader is standing on.
 *
 * The Position tab arrives as a prop rather than being built here: it is bound
 * to the screen's ingestion state and its drop handling, which belong with the
 * screen (`AnalysisBoard.tsx`), not with a tab strip.
 */

const TAB_IDS = ["moves", "engine", "lines", "position"] as const;
type TabId = (typeof TAB_IDS)[number];

function AnalysisPanel({
  state,
  position,
  onPlayFromHere,
}: {
  state: AnalysisBoardState;
  /** The Position tab's content — see the note above on why it comes in. */
  position: ReactNode;
  /**
   * Hand the position at the node on screen to Play with Engine. It sits above
   * the tab strip rather than inside the Position tab: continuing a position
   * against the engine is a thing the reader may want from any tab.
   */
  onPlayFromHere: () => void;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabId>("moves");

  const topLine = state.analysis.lines.find((line) => line !== undefined);

  /*
    The Moves tab is the shared `MoveList` over the mainline, so both shapes it
    needs are derived here from the tree — the one-line `Game` the list renders,
    and the mainline nodes a ply has to translate back into. Memoised on the
    tree: each walk reads the whole line, and a move landing in a side line
    re-renders the panel without touching either.
  */
  const mainlineNodes = useMemo(() => mainline(state.tree), [state.tree]);
  const game = useMemo(() => mainlineGame(state.tree), [state.tree]);

  /*
    The ply↔node seam (CTA-51). The move list speaks plies over the mainline;
    the navigation state is a node id, because a click inside a side line
    changes *which line is current* — a number cannot say that. So the panel is
    where the two meet: a selection that is the start, or a mainline node, is
    the ply it names; a selection inside a side line is no ply at all, and -1
    is passed through so no row of the list highlights. It must not fall back
    to 0, which would light the start position while standing somewhere else
    entirely.
  */
  const mainlineIndex = mainlineNodes.findIndex(
    (node) => node.id === state.nodeId,
  );
  const mainlinePly =
    state.nodeId === null
      ? 0
      : mainlineIndex === -1
        ? -1
        : mainlineIndex + 1;

  // Pulled out of `state` so the callback's dependencies name the stable
  // function itself, not the whole state object recreated every render.
  const { goToNode } = state;

  const selectPly = useCallback(
    (ply: number) => {
      if (ply === 0) {
        goToNode(null);
        return;
      }
      const node = mainlineNodes[ply - 1];
      // The list only renders rows for the moves it has, so the miss is a ply
      // from nowhere rather than one to clamp to the end.
      if (node === undefined) return;
      goToNode(node.id);
    },
    [goToNode, mainlineNodes],
  );

  return (
    <Box
      data-testid="analysis-panel"
      sx={{
        flexGrow: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        gap: 1,
      }}
    >
      {/*
        The row above the tab strip: the opening at the node on screen — it
        follows the reader down side lines, the way the evaluation line below
        it does — the hand-off to Play with Engine for that same position, and
        the engine's switch (CTA-51), which left the Engine tab for the same
        reason the hand-off lives here: both are wanted from any tab. The
        opening sits in a shrinking flex slot so a long name truncates rather
        than pushing the rest out of the panel.
      */}
      <Box
        sx={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 1,
          minWidth: 0,
        }}
      >
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <CurrentOpening fen={state.fen} testId="analysis-current-opening" />
        </Box>
        <Button
          size="small"
          variant="outlined"
          startIcon={<SportsEsportsRoundedIcon fontSize="small" />}
          data-testid="analysis-play-from-here"
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
              data-testid="analysis-setting-engine"
              onChange={(event) => state.setEngineOn(event.target.checked)}
            />
          }
          label={t("analysis.settings.engineOn")}
        />
      </Box>

      <Tabs
        value={tab}
        onChange={(_event, next: TabId) => setTab(next)}
        variant="fullWidth"
        sx={{
          flexShrink: 0,
          minHeight: 36,
          borderBottom: "1px solid",
          borderColor: "divider",
          "& .MuiTab-root": {
            minHeight: 36,
            textTransform: "none",
            minWidth: 0,
            px: 1,
          },
        }}
      >
        {TAB_IDS.map((id) => (
          <Tab
            key={id}
            value={id}
            label={t(`analysis.tabs.${id}`)}
            data-testid={`analysis-panel-tab-${id}`}
          />
        ))}
      </Tabs>

      {/*
        The one line of status that belongs above every tab: the evaluation of
        the position on screen. It is a dash while the engine is off, because
        that is honestly what is known about the position then.
      */}
      <Box
        data-testid="analysis-status"
        sx={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
        }}
      >
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {t(
            state.engineOn
              ? "analysis.settings.title"
              : "analysis.settings.engineOff",
          )}
        </Typography>
        <Chip
          size="small"
          dir="ltr"
          data-testid="analysis-status-score"
          label={formatScore(topLine?.score ?? null)}
        />
      </Box>

      <Box
        role="tabpanel"
        data-testid={`analysis-panel-content-${tab}`}
        sx={{ flexGrow: 1, minHeight: 0, overflow: "auto" }}
      >
        {tab === "moves" && (
          <>
            {/*
              The mainline as the shared numbered-pairs list — the linear
              reading of this tree, with the engine's evals beside each scored
              move (CTA-51) — and, still the point of the screen, the variation
              tree below it in the same scroll region. A click on the list
              selects the mainline node the ply names; the tree below navigates
              the branches.
            */}
            <MoveList
              game={game}
              currentPly={mainlinePly}
              onSelectPly={selectPly}
              evalsByFen={state.evalsByFen}
            />
            <VariationTree
              tree={state.tree}
              currentId={state.nodeId}
              onSelectNode={state.goToNode}
            />
          </>
        )}
        {tab === "engine" && (
          <AnalysisSettings
            settings={state.settings}
            onChange={state.updateSettings}
            engineOptions={state.engineOptions}
            engineOn={state.engineOn}
            showEvalBar={state.showEvalBar}
            onShowEvalBarChange={state.setShowEvalBar}
            onClear={state.clearBoard}
          />
        )}
        {tab === "lines" &&
          (state.engineOn ? (
            <BestVariations
              analysis={state.analysis}
              requested={state.settings.multiPv}
            />
          ) : (
            /*
              Not `BestVariations` with an empty set: "waiting for the engine"
              would be a lie about a switch the reader turned off themselves, and
              showing the last lines it produced would be a worse one.
            */
            <Typography
              variant="body2"
              data-testid="analysis-engine-off"
              sx={{ color: "text.secondary" }}
            >
              {t("analysis.settings.engineOff")}
            </Typography>
          ))}
        {tab === "position" && position}
      </Box>

      <BoardControls
        ply={state.ply}
        lastPly={state.lastPly}
        onSelectPly={state.goToPly}
        onFlip={state.flipBoard}
      />
    </Box>
  );
}

export default AnalysisPanel;
