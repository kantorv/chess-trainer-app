import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import QueryStatsRoundedIcon from "@mui/icons-material/QueryStatsRounded";
import MenuBookRoundedIcon from "@mui/icons-material/MenuBookRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import { createSearchParams, useNavigate, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Chessboard, type ChessboardOptions } from "react-chessboard";

import { asAppLanguage } from "../../i18n";
import { gameReferenceOf } from "../../lib/gameReference";
import { initialPlyOf, parseMoveParam } from "../../lib/gameNavigation";
import { parsePgnTree } from "../../lib/pgn";
import { emptyTree } from "../../lib/gameTree";
import {
  localizedText,
  type LibraryCategory,
  type LibraryGame,
} from "../../lib/libraryCatalog";
import BoardControls from "../shared/BoardControls";
import CopyableValue from "../shared/CopyableValue";
import CurrentOpening from "../shared/CurrentOpening";
import GameInfo from "../shared/GameInfo";
import VariationTree from "../tools/analysis/VariationTree";
import { useTreeNavigation } from "../tools/analysis/useTreeNavigation";
import { RightPanel } from "../main/rightPanel";
import LibrarySiblingNav from "./LibrarySiblingNav";
import type { LibrarySection } from "./section";

/**
 * One **repertoire line** from the Library, replayed with its **variation
 * tree** — the body `LibraryDetail` renders for a `game` item that the section
 * flagged as a repertoire line (`variationMode`).
 *
 * It is `LibraryGameDetail`'s sibling, not a mode of it: a repertoire line's
 * `( … )` side lines *are* the content, so it re-reads the PGN with
 * `parsePgnTree` (which keeps them, where `parsePgnGames` discards them) and
 * navigates it by **node** through `useTreeNavigation` — a different hook, and
 * hooks cannot live behind a condition, which is why `LibraryDetail` splits
 * here before either body runs, exactly as it splits `game` from `position`.
 *
 * Everything else is the game body's, verbatim: the read-only board, the four
 * hand-offs, the close button, and the shared `BoardControls` driven off the
 * ply `useTreeNavigation` derives from the line the reader is standing on.
 */

const TAB_IDS = ["moves", "info"] as const;
type TabId = (typeof TAB_IDS)[number];

/** The hand-offs, sized down to fit beside the close button in the head. */
const compactButtonSx = {
  fontSize: "0.6875rem",
  lineHeight: 1.2,
  paddingBlock: 0.25,
  paddingInline: 0.75,
  minWidth: 0,
  "& .MuiButton-startIcon": { marginInlineEnd: 0.5 },
} as const;

type Props = {
  section: LibrarySection;
  category: LibraryCategory;
  item: LibraryGame;
};

function LibraryVariationDetail({ section, category, item }: Props) {
  const { t, i18n } = useTranslation();
  const language = asAppLanguage(i18n.language);
  const navigate = useNavigate();

  const [tab, setTab] = useState<TabId>("moves");
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [searchParams, setSearchParams] = useSearchParams();

  /*
    The line, re-parsed with its side lines kept. A line that will not parse as
    a tree falls back to the empty tree rather than crashing the screen — the
    same "ignore what does not resolve" rule every arrival keeps.
  */
  const tree = useMemo(() => {
    try {
      return parsePgnTree(item.pgn);
    } catch {
      return emptyTree();
    }
  }, [item.pgn]);

  const { ply, lastPly, fen, arrows, nodeId, goToNode, goToPly } =
    useTreeNavigation(
      tree,
      parseMoveParam(searchParams.get("move")) ?? initialPlyOf(item.game),
    );

  /*
    The ply on screen, reflected into `?move=` with history REPLACE — one Back
    from a hand-off returns here at the move the reader left on. Ply 0 deletes
    the parameter. Other params are left alone. (`LibraryGameDetail` does this
    identically.)
  */
  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (ply === 0) next.delete("move");
        else next.set("move", String(ply));
        return next.toString() === prev.toString() ? prev : next;
      },
      { replace: true },
    );
  }, [ply, setSearchParams]);

  const name = localizedText(item.name, language);
  const description = localizedText(item.description, language);

  const boardOptions: ChessboardOptions = {
    id: `${section.itemTestId}-detail-${item.id}`,
    position: fen,
    boardOrientation: orientation,
    arrows,
    // Read-only: this page replays a line. Dragging here would desync the board
    // from the tree it is showing.
    allowDragging: false,
  };

  /** The line itself, to a screen that replays one — as a catalog reference. */
  const handOffGameTo = (pathname: string) => () =>
    navigate({
      pathname,
      search: createSearchParams(
        ply === 0
          ? { game: gameReferenceOf(section.gameReferenceKey ?? "", item) }
          : {
              game: gameReferenceOf(section.gameReferenceKey ?? "", item),
              move: String(ply),
            },
      ).toString(),
    });

  /** The position *at the ply on screen*, to a screen that takes a position. */
  const handOffFenTo = (pathname: string) => () =>
    navigate({ pathname, search: createSearchParams({ fen }).toString() });

  return (
    <>
      <LibrarySiblingNav section={section} category={category} activeId={item.id} />

      <Box data-testid={`${section.itemTestId}-detail-board`} sx={{ height: "100%" }}>
        <Chessboard options={boardOptions} />
      </Box>

      <RightPanel>
        <Box
          data-testid={`${section.itemTestId}-detail-panel`}
          sx={{
            flexGrow: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            gap: 1,
          }}
        >
          <Box sx={{ flexShrink: 0 }}>
            <Box
              sx={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 1,
              }}
            >
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<QueryStatsRoundedIcon sx={{ fontSize: "1rem" }} />}
                  onClick={handOffGameTo("/tools/analysis")}
                  data-testid={`${section.itemTestId}-open-analysis`}
                  sx={compactButtonSx}
                >
                  {t(`${section.chromeKey}.detail.openInAnalysis`)}
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<MenuBookRoundedIcon sx={{ fontSize: "1rem" }} />}
                  onClick={handOffGameTo("/games/load-pgn")}
                  data-testid={`${section.itemTestId}-open-load-pgn`}
                  sx={compactButtonSx}
                >
                  {t(`${section.chromeKey}.detail.openInLoadPgn`)}
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<PlayArrowRoundedIcon sx={{ fontSize: "1rem" }} />}
                  onClick={handOffFenTo("/engine/play")}
                  data-testid={`${section.itemTestId}-play-engine`}
                  sx={compactButtonSx}
                >
                  {t(`${section.chromeKey}.detail.playWithEngine`)}
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<EditRoundedIcon sx={{ fontSize: "1rem" }} />}
                  onClick={handOffFenTo("/tools/editor")}
                  data-testid={`${section.itemTestId}-open-editor`}
                  sx={compactButtonSx}
                >
                  {t(`${section.chromeKey}.detail.openInEditor`)}
                </Button>
              </Box>
              <IconButton
                size="small"
                onClick={() => navigate(`${section.routeBase}/${category.path}`)}
                aria-label={t(`${section.chromeKey}.detail.close`)}
                data-testid={`${section.itemTestId}-detail-close`}
                sx={{ mt: -0.5, mr: -0.5, flexShrink: 0 }}
              >
                <CloseRoundedIcon fontSize="small" />
              </IconButton>
            </Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mt: 1 }}>
              {name}
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.25 }}>
              {t(`${section.chromeKey}.list.moves`, {
                count: item.game.moves.length,
              })}
            </Typography>
            <Box sx={{ mt: 1 }}>
              <CurrentOpening
                fen={fen}
                testId={`${section.itemTestId}-current-opening`}
              />
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
                label={t(`gamePanel.tabs.${id}`)}
                data-testid={`${section.itemTestId}-tab-${id}`}
              />
            ))}
          </Tabs>

          <Box
            role="tabpanel"
            data-testid={`${section.itemTestId}-detail-content-${tab}`}
            sx={{ flexGrow: 1, minHeight: 0, overflow: "auto" }}
          >
            {tab === "moves" && (
              <>
                {description !== "" && (
                  <Typography variant="body2" sx={{ mb: 1.5 }}>
                    {description}
                  </Typography>
                )}
                <VariationTree
                  tree={tree}
                  currentId={nodeId}
                  onSelectNode={goToNode}
                  emptyText={t(`${section.chromeKey}.list.empty`)}
                />
                <Box sx={{ mt: 2 }}>
                  <CopyableValue
                    label={t(`${section.chromeKey}.detail.fen`)}
                    value={fen}
                    testId={`${section.itemTestId}-fen`}
                  />
                </Box>
              </>
            )}
            {tab === "info" && <GameInfo game={item.game} />}
          </Box>

          <BoardControls
            ply={ply}
            lastPly={lastPly}
            onSelectPly={goToPly}
            onFlip={() =>
              setOrientation((side) => (side === "white" ? "black" : "white"))
            }
          />
        </Box>
      </RightPanel>
    </>
  );
}

export default LibraryVariationDetail;
