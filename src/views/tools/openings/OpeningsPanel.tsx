import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import RestartAltRoundedIcon from "@mui/icons-material/RestartAltRounded";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import BoardControls from "../../shared/BoardControls";
import MoveList from "../../shared/MoveList";
import type { OpeningsState } from "./useOpenings";

/**
 * The Openings screen's whole right-hand panel: the opening on screen, the
 * explorer-style list of what each legal move here is called, a tab strip
 * over the move list, and the board controls pinned to the foot — the same
 * three-region column the other screens use (`Layout.tsx`).
 *
 * ```
 * ┌──────────────────────────────────┐
 * │ King's Pawn Opening      B00     │  current opening — fixed
 * ├──────────────────────────────────┤
 * │ Next moves │ Moves               │  tab strip — fixed
 * ├──────────────────────────────────┤
 * │ the active tab                   │  scrolls
 * ├──────────────────────────────────┤
 * │ |◀ ◀ ▶ ▶|         flip  New game │  controls — fixed
 * └──────────────────────────────────┘
 * ```
 *
 * The explorer list looks up **every** legal move from the position on
 * screen, live or not: stepping back through a line already played is exactly
 * when a reader wants to see the branches eco.json knows about, not only the
 * one they took. A move is only clickable while the game is at its tip
 * (`state.isLive`) — the same restriction `onPieceDrop` observes, for the same
 * reason: a click on an earlier ply would apply to a position nobody is
 * looking at, and this screen keeps one line rather than a tree.
 */

const TAB_IDS = ["nextMoves", "moves"] as const;
type TabId = (typeof TAB_IDS)[number];

function OpeningsPanel({ state }: { state: OpeningsState }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabId>("nextMoves");

  return (
    <Box
      data-testid="openings-panel"
      sx={{
        flexGrow: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        gap: 1,
      }}
    >
      <Box
        data-testid="openings-current"
        sx={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 1,
        }}
      >
        <Box sx={{ flexGrow: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 1 }}>
          {state.currentOpening ? (
            <>
              <Typography
                variant="subtitle2"
                dir="ltr"
                sx={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}
              >
                {state.currentOpening.name}
              </Typography>
              <Chip size="small" dir="ltr" label={state.currentOpening.eco} />
            </>
          ) : (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              {t(
                state.bookLoaded
                  ? "openings.current.unknown"
                  : "openings.current.loading",
              )}
            </Typography>
          )}
        </Box>

        <Button
          size="small"
          variant="outlined"
          startIcon={<RestartAltRoundedIcon fontSize="small" />}
          data-testid="openings-new-game"
          onClick={state.newGame}
          sx={{ flexShrink: 0 }}
        >
          {t("openings.controls.newGame")}
        </Button>
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
          "& .MuiTab-root": { minHeight: 36, textTransform: "none" },
        }}
      >
        {TAB_IDS.map((id) => (
          <Tab
            key={id}
            value={id}
            label={t(`openings.tabs.${id}`)}
            data-testid={`openings-panel-tab-${id}`}
          />
        ))}
      </Tabs>

      <Box
        role="tabpanel"
        data-testid={`openings-panel-content-${tab}`}
        sx={{ flexGrow: 1, minHeight: 0, overflow: "auto" }}
      >
        {tab === "nextMoves" &&
          (state.nextMoves.length === 0 ? (
            <Typography
              variant="body2"
              data-testid="openings-next-moves-empty"
              sx={{ color: "text.secondary" }}
            >
              {t("openings.nextMoves.empty")}
            </Typography>
          ) : (
            <List dense disablePadding data-testid="openings-next-moves-list">
              {state.nextMoves.map((next) => (
                <ListItemButton
                  key={next.san}
                  disabled={!state.isLive}
                  onClick={() => state.playMove(next.san)}
                  data-testid={`openings-next-move-${next.san}`}
                  sx={{ borderRadius: 0.5 }}
                >
                  <ListItemText
                    primary={<span dir="ltr">{next.san}</span>}
                    secondary={
                      <span dir="ltr">
                        {next.opening?.name ?? t("openings.nextMoves.unknown")}
                      </span>
                    }
                  />
                  {next.opening && (
                    <Chip size="small" dir="ltr" label={next.opening.eco} />
                  )}
                </ListItemButton>
              ))}
            </List>
          ))}
        {tab === "moves" && (
          <MoveList game={state.game} currentPly={state.ply} onSelectPly={state.goToPly} />
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

export default OpeningsPanel;
