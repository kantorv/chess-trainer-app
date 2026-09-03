import { useState, type ReactNode } from "react";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Tooltip from "@mui/material/Tooltip";
import GridOnRoundedIcon from "@mui/icons-material/GridOnRounded";
import DeleteSweepRoundedIcon from "@mui/icons-material/DeleteSweepRounded";
import SwapVertRoundedIcon from "@mui/icons-material/SwapVertRounded";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import SportsEsportsRoundedIcon from "@mui/icons-material/SportsEsportsRounded";
import { useTranslation } from "react-i18next";
import PositionFields from "./PositionFields";
import type { BoardEditorState } from "./useBoardEditor";

/**
 * The Board Editor's whole right-hand panel: the legality report, a tab strip,
 * the tab's content, and the board controls pinned to the foot — the same
 * three-region column the other real screens use, because it is the same shell
 * aside and the same non-scrolling flex column (`Layout.tsx`).
 *
 * ```
 * ┌────────────────────────────────────────┐
 * │ ⚠ what is wrong with this board        │  report — only when there is something
 * ├────────────────────────────────────────┤
 * │ Position │ FEN │ PGN                   │  tab strip — fixed
 * ├────────────────────────────────────────┤
 * │ the active tab                         │  scrolls
 * ├────────────────────────────────────────┤
 * │ [start] [clear] [flip]  [play][analyse]│  controls — fixed
 * └────────────────────────────────────────┘
 * ```
 *
 * The report sits *above* the tabs rather than inside one: what is wrong with
 * the position is true whichever form you happen to have open, and the controls
 * it switches off are in two different regions.
 *
 * The two hand-offs are deliberately alike: each opens another screen on this
 * position, both are gated on the same validity, and both carry the FEN the same
 * way — so they are one list rather than two special cases.
 *
 * The FEN and PGN forms arrive as props for the same reason the Analysis
 * Board's Position tab does — they are bound to the screen's ingestion state and
 * its file dropping, which belong with the screen, not with a tab strip.
 */

const TAB_IDS = ["position", "fen", "pgn"] as const;
type TabId = (typeof TAB_IDS)[number];

type EditorPanelProps = {
  state: BoardEditorState;
  /** The FEN tab's content. */
  fen: ReactNode;
  /** The PGN tab's content. */
  pgn: ReactNode;
  /** Open the Analysis Board on this position — switched off while it is illegal. */
  onContinueToAnalysis: () => void;
  /** Start a game against the engine from this position, likewise. */
  onPlayFromHere: () => void;
};

function EditorPanel({
  state,
  fen,
  pgn,
  onContinueToAnalysis,
  onPlayFromHere,
}: EditorPanelProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabId>("position");

  const resets = [
    {
      key: "start",
      label: t("editor.controls.startingPosition"),
      icon: <GridOnRoundedIcon fontSize="small" />,
      onClick: state.setStartingPosition,
    },
    {
      key: "clear",
      label: t("editor.controls.clearBoard"),
      icon: <DeleteSweepRoundedIcon fontSize="small" />,
      onClick: state.clearBoard,
    },
    {
      key: "flip",
      label: t("editor.controls.flip"),
      icon: <SwapVertRoundedIcon fontSize="small" />,
      onClick: state.flipBoard,
    },
  ];

  /*
    Both take the position somewhere else, and neither can be trusted with a
    position that is not playable — so they share the gate and the reason given
    for it.
  */
  const handOffs = [
    {
      key: "play",
      label: t("editor.controls.play"),
      icon: <SportsEsportsRoundedIcon fontSize="small" />,
      testId: "editor-play-from-here",
      variant: "outlined" as const,
      onClick: onPlayFromHere,
    },
    {
      key: "analysis",
      label: t("editor.controls.analysis"),
      icon: <InsightsRoundedIcon fontSize="small" />,
      testId: "editor-continue-analysis",
      variant: "contained" as const,
      onClick: onContinueToAnalysis,
    },
  ];

  return (
    <Box
      data-testid="editor-panel"
      sx={{
        flexGrow: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        gap: 1,
      }}
    >
      {state.problems.length > 0 && (
        <Alert
          severity="warning"
          data-testid="editor-problems"
          sx={{ flexShrink: 0, py: 0.5 }}
        >
          <AlertTitle sx={{ mb: 0 }}>{t("editor.problems.title")}</AlertTitle>
          <Box component="ul" sx={{ m: 0, pl: 2 }}>
            {state.problems.map((problem) => (
              <li key={problem} data-testid={`editor-problem-${problem}`}>
                {t(`editor.problems.${problem}`)}
              </li>
            ))}
          </Box>
        </Alert>
      )}

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
            label={t(`editor.tabs.${id}`)}
            data-testid={`editor-panel-tab-${id}`}
          />
        ))}
      </Tabs>

      <Box
        role="tabpanel"
        data-testid={`editor-panel-content-${tab}`}
        sx={{ flexGrow: 1, minHeight: 0, overflow: "auto" }}
      >
        {tab === "position" && (
          <PositionFields
            fields={state.fields}
            onTurnChange={state.setTurn}
            onCastlingChange={state.setCastlingRight}
            onEnPassantChange={state.setEnPassant}
          />
        )}
        {tab === "fen" && fen}
        {tab === "pgn" && pgn}
      </Box>

      <Box
        data-testid="editor-controls"
        sx={{
          flexShrink: 0,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 1,
          pt: 1,
          borderTop: "1px solid",
          borderColor: "divider",
        }}
      >
        {resets.map((reset) => (
          <Button
            key={reset.key}
            size="small"
            variant="outlined"
            startIcon={reset.icon}
            data-testid={`editor-reset-${reset.key}`}
            onClick={reset.onClick}
          >
            {reset.label}
          </Button>
        ))}

        {handOffs.map((handOff, index) => (
          // A disabled button takes no pointer events, so the tooltip needs a
          // wrapper that still does — which is also where the reason lives.
          <Tooltip
            key={handOff.key}
            title={state.isValid ? handOff.label : t("editor.problems.blocked")}
          >
            <Box
              component="span"
              sx={{
                display: "inline-flex",
                // Only the first of them is pushed away from the resets; the
                // rest follow it as a group.
                marginInlineStart: index === 0 ? "auto" : 0,
              }}
            >
              <Button
                size="small"
                variant={handOff.variant}
                startIcon={handOff.icon}
                data-testid={handOff.testId}
                disabled={!state.isValid}
                onClick={handOff.onClick}
              >
                {handOff.label}
              </Button>
            </Box>
          </Tooltip>
        ))}
      </Box>
    </Box>
  );
}

export default EditorPanel;
