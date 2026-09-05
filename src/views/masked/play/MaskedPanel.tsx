import { useState } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import { formatScore } from "../../../lib/engineAnalysis";
import type { PieceMask } from "../../../lib/pieceMask";
import BestVariations from "../../shared/BestVariations";
import BoardControls from "../../shared/BoardControls";
import CurrentOpening from "../../shared/CurrentOpening";
import MoveList from "../../shared/MoveList";
import EngineSettings from "../../engine/play/EngineSettings";
import type { PlayWithEngineState } from "../../engine/play/usePlayWithEngine";
import MaskEditor from "./MaskEditor";

/**
 * The Masked Pieces screen's right-hand panel: Play with Engine's three tabs
 * plus a fourth, Masking.
 *
 * ```
 * ┌──────────────────────────────────┐
 * │ King's Pawn Game           B00   │  current opening — fixed
 * ├──────────────────────────────────┤
 * │ Game │ Engine │ Lines │ Masking  │  tab strip — fixed
 * ├──────────────────────────────────┤
 * │ the active tab                   │  scrolls
 * ├──────────────────────────────────┤
 * │ |◀ ◀ ▶ ▶|                  flip  │  controls — fixed
 * └──────────────────────────────────┘
 * ```
 *
 * Deliberately a sibling of `EnginePanel` rather than a mode of it: the two
 * differ by a tab and by what the move list and the variations are allowed to
 * say, and a flag threaded through both would leave the unmasked screen
 * carrying a mask it never uses. The pieces below the tab strip *are* shared —
 * `MoveList`, `BestVariations`, `EngineSettings` and `BoardControls` are the
 * same components, and the mask reaches the first two as an ordinary prop.
 *
 * The tab and status strings are `playEngine.*`, because this is that screen:
 * the same three tabs, the same turn and evaluation line, the same meaning.
 * Only what the mask adds is under `masking.*`.
 */

const TAB_IDS = ["game", "engine", "lines", "masking"] as const;
type TabId = (typeof TAB_IDS)[number];

type MaskedPanelProps = {
  state: PlayWithEngineState;
  mask: PieceMask;
  onMaskChange: (mask: PieceMask) => void;
  maskNotation: boolean;
  onMaskNotationChange: (next: boolean) => void;
};

function MaskedPanel({
  state,
  mask,
  onMaskChange,
  maskNotation,
  onMaskNotationChange,
}: MaskedPanelProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabId>("game");

  const topLine = state.analysis.lines.find((line) => line !== undefined);

  /*
    What the notation switch actually controls: the mask the two SAN readers are
    given. Switched off, they are handed nothing and print ordinary SAN — which
    is the reveal the setting exists to offer, not a second code path.
  */
  const notationMask = maskNotation ? mask : undefined;

  return (
    <Box
      data-testid="masked-panel"
      sx={{
        flexGrow: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        gap: 1,
      }}
    >
      {/*
        The opening at the ply on screen. It names the *real* line — the mask
        disguises how pieces are drawn, never what the game is.
      */}
      <CurrentOpening fen={state.fen} testId="masked-current-opening" />

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
            label={t(
              id === "masking" ? "masking.tab" : `playEngine.tabs.${id}`,
            )}
            data-testid={`masked-panel-tab-${id}`}
          />
        ))}
      </Tabs>

      {/*
        Whose turn it is and the current evaluation, above every tab — both
        describe the ply on screen, so stepping back changes them with the
        board. Neither says anything about a piece's identity.
      */}
      <Box
        data-testid="masked-status"
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
          data-testid="masked-status-score"
          label={formatScore(topLine?.score ?? null)}
        />
      </Box>

      <Box
        role="tabpanel"
        data-testid={`masked-panel-content-${tab}`}
        sx={{ flexGrow: 1, minHeight: 0, overflow: "auto" }}
      >
        {tab === "game" && (
          <MoveList
            game={state.game}
            currentPly={state.ply}
            onSelectPly={state.goToPly}
            mask={notationMask}
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
            mask={notationMask}
          />
        )}
        {tab === "masking" && (
          <MaskEditor
            mask={mask}
            onMaskChange={onMaskChange}
            maskNotation={maskNotation}
            onMaskNotationChange={onMaskNotationChange}
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

export default MaskedPanel;
