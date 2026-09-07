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
import SportsEsportsRoundedIcon from "@mui/icons-material/SportsEsportsRounded";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import BoardControls from "../../shared/BoardControls";
import CurrentOpening from "../../shared/CurrentOpening";
import VariationTree from "../analysis/VariationTree";
import type { OpeningsState } from "./useOpenings";

/**
 * The Openings screen's whole right-hand panel: the opening on screen, the
 * explorer-style list of the book continuations from here, a tab strip over
 * the variation tree, and the board controls pinned to the foot — the same
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
 * The explorer lists only the moves eco.json can name — an off-book move is
 * still playable (drag it), it simply is not a book continuation, so the list
 * does not pretend it is one. The list is clickable at **any** ply, live tip
 * or not: clicking a book move from an earlier position branches the tree
 * there, which is what exploring an opening means. The branches themselves
 * live in the Moves tab's variation tree.
 */

const TAB_IDS = ["nextMoves", "moves"] as const;
type TabId = (typeof TAB_IDS)[number];

function OpeningsPanel({
  state,
  onPlayFromHere,
}: {
  state: OpeningsState;
  /** Hand the position on screen to Play with Engine. */
  onPlayFromHere: () => void;
}) {
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
        sx={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 1,
        }}
      >
        {/*
          The shared "current opening" line every game screen carries — here it
          looks up the same book `useOpenings` already loaded (the promise is
          cached), and its ECO chip links back to this very screen with the
          position on screen as `?fen=`.
        */}
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <CurrentOpening fen={state.fen} testId="openings-current" />
        </Box>

        <Box
          sx={{
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            gap: 0.5,
          }}
        >
          <Button
            size="small"
            variant="outlined"
            startIcon={<RestartAltRoundedIcon fontSize="small" />}
            data-testid="openings-new-game"
            onClick={state.newGame}
          >
            {t("openings.controls.newGame")}
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<SportsEsportsRoundedIcon fontSize="small" />}
            data-testid="openings-play-from-here"
            onClick={onPlayFromHere}
          >
            {t("openings.controls.playFromHere")}
          </Button>
        </Box>
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
                  onClick={() => state.playMove(next.san)}
                  onMouseEnter={() => state.setHoveredMove(next)}
                  onMouseLeave={() => state.setHoveredMove(null)}
                  data-testid={`openings-next-move-${next.san}`}
                  sx={{ borderRadius: 0.5 }}
                >
                  <ListItemText
                    primary={<span dir="ltr">{next.san}</span>}
                    secondary={<span dir="ltr">{next.opening.name}</span>}
                  />
                  <Chip size="small" dir="ltr" label={next.opening.eco} />
                </ListItemButton>
              ))}
            </List>
          ))}
        {tab === "moves" && (
          <VariationTree
            tree={state.tree}
            currentId={state.nodeId}
            onSelectNode={state.goToNode}
            emptyText={t("openings.moves.empty")}
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

export default OpeningsPanel;
