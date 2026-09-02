import { useState, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import { useTranslation } from "react-i18next";
import type { ParsedGame } from "../../../lib/pgn";
import BoardControls from "./BoardControls";
import GameInfo from "./GameInfo";
import MoveList from "./MoveList";

/**
 * The screen's whole right-hand panel: a tab strip, the tab's content, and the
 * board controls pinned to the foot.
 *
 * Three regions stacked in a column that fills the shell's aside — the aside is
 * a non-scrolling flex column for exactly this (see `Layout.tsx`), so the tab
 * strip and the controls stay put while only the content between them scrolls.
 *
 * ```
 * ┌──────────────────────────┐
 * │ Moves │ Info │ Load PGN  │  tab strip — fixed
 * ├──────────────────────────┤
 * │ the active tab           │  scrolls
 * ├──────────────────────────┤
 * │ |◀ ◀ ▶ ▶|          flip  │  controls — fixed
 * └──────────────────────────┘
 * ```
 *
 * The tabs are rendered one at a time rather than all three with the inactive
 * ones hidden: the move list scrolls the selected ply into view on mount, and a
 * hidden copy would be scrolling a zero-height box on every ply change.
 */

const TAB_IDS = ["moves", "info", "load"] as const;
type TabId = (typeof TAB_IDS)[number];

type GamePanelProps = {
  /** The game on screen, or `undefined` before one is loaded. */
  game: ParsedGame | undefined;
  ply: number;
  lastPly: number;
  onSelectPly: (ply: number) => void;
  onFlip: () => void;
  /** The Load PGN tab's contents — owned by the screen, which holds the ingestion state. */
  ingest: ReactNode;
};

function GamePanel({
  game,
  ply,
  lastPly,
  onSelectPly,
  onFlip,
  ingest,
}: GamePanelProps) {
  const { t } = useTranslation();

  /*
    Opens on Load PGN, because with no game the other two tabs have nothing to
    show; the first game to arrive switches to Moves, which is what the reader
    wants to look at next.
  */
  const [tab, setTab] = useState<TabId>("load");

  /*
    Adjusting state during render against the previous value, rather than in an
    effect — the pattern `Sidebar.tsx` uses to re-open the active folder, and
    the one `react-hooks/set-state-in-effect` leaves alone. Keyed on the game
    object, so picking a different game out of a multi-game file counts too.
  */
  const [shownGame, setShownGame] = useState<ParsedGame | undefined>(undefined);
  if (game !== shownGame) {
    setShownGame(game);
    if (game !== undefined) setTab("moves");
  }

  return (
    <Box
      data-testid="game-panel"
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
          "& .MuiTab-root": { minHeight: 36, textTransform: "none" },
        }}
      >
        {TAB_IDS.map((id) => (
          <Tab
            key={id}
            value={id}
            label={t(`gamePanel.tabs.${id}`)}
            data-testid={`game-panel-tab-${id}`}
          />
        ))}
      </Tabs>

      <Box
        role="tabpanel"
        data-testid={`game-panel-content-${tab}`}
        sx={{ flexGrow: 1, minHeight: 0, overflow: "auto" }}
      >
        {tab === "moves" && game !== undefined && (
          <MoveList game={game} currentPly={ply} onSelectPly={onSelectPly} />
        )}
        {tab === "info" && <GameInfo game={game} />}
        {tab === "load" && ingest}
      </Box>

      <BoardControls
        ply={ply}
        lastPly={lastPly}
        onSelectPly={onSelectPly}
        onFlip={onFlip}
      />
    </Box>
  );
}

export default GamePanel;
