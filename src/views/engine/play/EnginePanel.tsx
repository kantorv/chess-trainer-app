import { useState } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import { formatScore } from "../../../lib/engineAnalysis";
import BestVariations from "../../shared/BestVariations";
import BoardControls from "../../shared/BoardControls";
import CurrentOpening from "../../shared/CurrentOpening";
import MoveList from "../../shared/MoveList";
import EngineSettings from "./EngineSettings";
import type { PlayWithEngineState } from "./usePlayWithEngine";

/**
 * The Play with Engine screen's whole right-hand panel: the live opening line,
 * a tab strip, the tab's content, and the board controls pinned to the foot —
 * the same three-region column the Load PGN panel uses, because it is the same
 * shell aside and the same non-scrolling flex column (`Layout.tsx`).
 *
 * ```
 * ┌──────────────────────────┐
 * │ King's Pawn Game    B00  │  current opening — fixed
 * ├──────────────────────────┤
 * │ Game │ Engine │ Lines    │  tab strip — fixed
 * ├──────────────────────────┤
 * │ the active tab           │  scrolls
 * ├──────────────────────────┤
 * │ |◀ ◀ ▶ ▶|          flip  │  controls — fixed
 * └──────────────────────────┘
 * ```
 *
 * One tab is rendered at a time rather than three with two hidden: the move list
 * scrolls the selected ply into view, and a hidden copy would be scrolling a
 * zero-height box on every ply change.
 *
 * The whole panel takes one object — the screen's state — rather than a dozen
 * props. There is exactly one caller, the pieces below it are the ones that take
 * narrow props and get tested against fixtures, and threading twenty parameters
 * through this level would buy nothing.
 */

const TAB_IDS = ["game", "engine", "lines"] as const;
type TabId = (typeof TAB_IDS)[number];

function EnginePanel({ state }: { state: PlayWithEngineState }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabId>("game");

  const topLine = state.analysis.lines.find((line) => line !== undefined);

  return (
    <Box
      data-testid="engine-panel"
      sx={{
        flexGrow: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        gap: 1,
      }}
    >
      {/* The opening at the ply on screen — it steps back with the board. */}
      <CurrentOpening fen={state.fen} testId="engine-current-opening" />

      <Tabs
        value={tab}
        onChange={(_event, next: TabId) => setTab(next)}
        variant="fullWidth"
        sx={{
          flexShrink: 0,
          minHeight: 36,
          borderBottom: "1px solid",
          borderColor: "divider",
          "& .MuiTab-root": { minHeight: 36, textTransform: "none" },
        }}
      >
        {TAB_IDS.map((id) => (
          <Tab
            key={id}
            value={id}
            label={t(`playEngine.tabs.${id}`)}
            data-testid={`engine-panel-tab-${id}`}
          />
        ))}
      </Tabs>

      {/*
        The one line of status that belongs above every tab: whose turn it is,
        and the current evaluation. Both describe the ply on screen, so stepping
        back changes them with the board.
      */}
      <Box
        data-testid="engine-status"
        sx={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
        }}
      >
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {state.isLive
            ? t(
                state.isEngineThinking
                  ? "playEngine.status.engineTurn"
                  : "playEngine.status.yourTurn",
              )
            : t("playEngine.status.reviewing")}
        </Typography>
        <Chip
          size="small"
          dir="ltr"
          data-testid="engine-status-score"
          label={formatScore(topLine?.score ?? null)}
        />
      </Box>

      <Box
        role="tabpanel"
        data-testid={`engine-panel-content-${tab}`}
        sx={{ flexGrow: 1, minHeight: 0, overflow: "auto" }}
      >
        {tab === "game" && (
          <MoveList
            game={state.game}
            currentPly={state.ply}
            onSelectPly={state.goToPly}
          />
        )}
        {tab === "engine" && (
          <EngineSettings
            settings={state.settings}
            onChange={state.updateSettings}
            engineOptions={state.engineOptions}
            showEvalBar={state.showEvalBar}
            onShowEvalBarChange={state.setShowEvalBar}
            onNewGame={state.newGame}
          />
        )}
        {tab === "lines" && (
          <BestVariations
            analysis={state.analysis}
            requested={state.settings.multiPv}
          />
        )}
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

export default EnginePanel;
