import { useState, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import TravelExploreRoundedIcon from "@mui/icons-material/TravelExploreRounded";
import { useTranslation } from "react-i18next";
import { formatScore } from "../../../lib/engineAnalysis";
import BestVariations from "../../shared/BestVariations";
import BoardControls from "../../shared/BoardControls";
import AnalysisSettings from "./AnalysisSettings";
import VariationTree from "./VariationTree";
import type { AnalysisBoardState } from "./useAnalysisBoard";

/**
 * The Analysis Board's whole right-hand panel: a tab strip, the tab's content,
 * and the board controls pinned to the foot — the same three-region column the
 * other two screens use, because it is the same shell aside and the same
 * non-scrolling flex column (`Layout.tsx`).
 *
 * ```
 * ┌──────────────────────────────────┐
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
 * The Position tab arrives as a prop rather than being built here: it is bound
 * to the screen's ingestion state and its drop handling, which belong with the
 * screen (`AnalysisBoard.tsx`), not with a tab strip.
 */

const TAB_IDS = ["moves", "engine", "lines", "position"] as const;
type TabId = (typeof TAB_IDS)[number];

function AnalysisPanel({
  state,
  position,
  onOpenInOpenings,
}: {
  state: AnalysisBoardState;
  /** The Position tab's content — see the note above on why it comes in. */
  position: ReactNode;
  /** Open the Openings explorer on the position at the ply on screen. */
  onOpenInOpenings: () => void;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabId>("moves");

  const topLine = state.analysis.lines.find((line) => line !== undefined);

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
          <VariationTree
            tree={state.tree}
            currentId={state.nodeId}
            onSelectNode={state.goToNode}
          />
        )}
        {tab === "engine" && (
          <AnalysisSettings
            settings={state.settings}
            onChange={state.updateSettings}
            engineOptions={state.engineOptions}
            engineOn={state.engineOn}
            onEngineOnChange={state.setEngineOn}
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

      <Box sx={{ flexShrink: 0 }}>
        <Button
          size="small"
          variant="outlined"
          fullWidth
          startIcon={<TravelExploreRoundedIcon fontSize="small" />}
          data-testid="analysis-open-in-openings"
          onClick={onOpenInOpenings}
        >
          {t("analysis.controls.openInOpenings")}
        </Button>
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
