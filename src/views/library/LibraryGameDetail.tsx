import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { createSearchParams, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Chessboard, type ChessboardOptions } from "react-chessboard";

import { asAppLanguage } from "../../i18n";
import { gameReferenceOf } from "../../lib/gameReference";
import { initialFenOf } from "../../lib/gameModel";
import { startNumbering } from "../../lib/gameNavigation";
import { extractPgnComments, hasPgnComments } from "../../lib/pgnComments";
import {
  localizedText,
  type LibraryCategory,
  type LibraryGame,
} from "../../lib/libraryCatalog";
import BoardControls from "../shared/BoardControls";
import CopyableValue from "../shared/CopyableValue";
import GameInfo from "../shared/GameInfo";
import MoveList from "../shared/MoveList";
import { useGameNavigation } from "../shared/useGameNavigation";
import { RightPanel } from "../main/rightPanel";
import BackToCategory from "./BackToCategory";
import type { LibrarySection } from "./section";

/**
 * One **game** from a library, replayed — the body `LibraryDetail` renders for
 * an item of that kind, and the whole of what the User PGNs section adds to the
 * two shared screens.
 *
 * **It writes no move list and no ply navigation.** A game out of a `.pgn` file
 * is the same `Game` the Load PGN screen parses out of a paste, so it goes
 * straight to `useGameNavigation`, `MoveList` and `BoardControls` and the
 * numbered pairs, the current-ply highlight, the jump targets and the keyboard
 * stepping all come with it. That is the payoff of the one game model, and it is
 * why a game-shaped library item cost a screen rather than a subsystem.
 *
 * ### The board does not turn
 *
 * A *position* that arrives faces the side to move, because a position is
 * something you are about to answer. A **game** deliberately does not: a PGN
 * opens at ply 0, where the side to move says nothing about which side is being
 * studied. The flip control is there for a reader who wants the other view, the
 * same way it is on Load PGN.
 *
 * ### Two hand-offs, two carriers
 *
 * | Destination | Carries | Why |
 * | --- | --- | --- |
 * | `/tools/analysis`, `/games/load-pgn` | `?game=<reference>` | they replay the *game*, so the whole game has to cross — as a catalog reference, since the PGN itself is far too long for a URL (`lib/gameReference.ts`) |
 * | `/engine/play`, `/tools/editor` | `?fen=<position at the current ply>` | neither replays anything; what they want is the position on screen, which is exactly what the existing hand-off already carries |
 *
 * The second row is the point: `?fen=` was not extended, wrapped or replaced. A
 * reader who steps to move 24 and hits "Play with Engine" gets move 24, through
 * the same mechanism the Board Editor has always used.
 */

const TAB_IDS = ["moves", "info", "description"] as const;
type TabId = (typeof TAB_IDS)[number];

type Props = {
  section: LibrarySection;
  category: LibraryCategory;
  item: LibraryGame;
};

function LibraryGameDetail({ section, category, item }: Props) {
  const { t, i18n } = useTranslation();
  const language = asAppLanguage(i18n.language);
  const navigate = useNavigate();

  const [tab, setTab] = useState<TabId>("moves");
  const [orientation, setOrientation] = useState<"white" | "black">("white");

  const { ply, lastPly, fen, arrows, goToPly } = useGameNavigation(item.game);

  const name = localizedText(item.name, language);
  const description = localizedText(item.description, language);

  /**
   * The annotation text the PGN carries — the preamble and every mainline move
   * comment, re-flowed. Read from the raw chunk rather than the parsed `Game`
   * because `chess.js` has already flattened the paragraph breaks out of the
   * latter (see `lib/pgnComments.ts`).
   */
  const comments = useMemo(() => extractPgnComments(item.pgn), [item.pgn]);
  const gameHasComments = hasPgnComments(comments);

  /** Plies that carry a move comment — the marker set for the move list. */
  const annotatedPlies = useMemo(
    () => new Set(comments.moves.map((entry) => entry.ply)),
    [comments],
  );

  /** The comment on the move currently on screen, if it has one. */
  const activeComment = comments.moves.find((entry) => entry.ply === ply);

  /** `"27. h5"` / `"27... Rf6"` for the move a comment belongs to. */
  const moveLabel = (targetPly: number): string => {
    const move = item.game.moves[targetPly - 1];
    if (move === undefined) return `#${targetPly}`;
    const { whiteFirst, firstNumber } = startNumbering(initialFenOf(item.game));
    const slot = targetPly - 1 + (whiteFirst ? 0 : 1);
    const number = firstNumber + Math.floor(slot / 2);
    return `${number}${slot % 2 === 0 ? "." : "..."} ${move.san}`;
  };

  const boardOptions: ChessboardOptions = {
    id: `${section.itemTestId}-detail-${item.id}`,
    position: fen,
    boardOrientation: orientation,
    /*
      The move that produced this position. External arrows are never cleared by
      the board itself (`.claude/rules/chessboard.md` §3.4), so this is the whole
      set for the current ply, recomputed on every change.
    */
    arrows,
    // Read-only: this page replays a game. Dragging here would desync the board
    // from the PGN it is showing.
    allowDragging: false,
  };

  /**
   * The game itself, to a screen that replays one. A reference rather than the
   * PGN: the destination resolves it through the same catalog.
   */
  const handOffGameTo = (pathname: string) => () =>
    navigate({
      pathname,
      search: createSearchParams({
        game: gameReferenceOf(section.gameReferenceKey ?? "", item),
      }).toString(),
    });

  /** The position *at the ply on screen*, to a screen that takes a position. */
  const handOffFenTo = (pathname: string) => () =>
    navigate({ pathname, search: createSearchParams({ fen }).toString() });

  return (
    <>
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
          {/* Fixed head: where the reader came from, and what they are looking at. */}
          <Box sx={{ flexShrink: 0 }}>
            <Box
              sx={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 1,
              }}
            >
              <BackToCategory section={section} category={category} />
              {/*
                A second, terser way out — top-right, the conventional close
                corner — to the same destination `BackToCategory` links: the
                folder this game sits in, i.e. the parent PGN index page.
              */}
              <IconButton
                size="small"
                onClick={() => navigate(`${section.routeBase}/${category.path}`)}
                aria-label={t(`${section.chromeKey}.detail.close`)}
                data-testid={`${section.itemTestId}-detail-close`}
                sx={{ mt: -0.5, mr: -0.5 }}
              >
                <CloseRoundedIcon fontSize="small" />
              </IconButton>
            </Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {name}
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.25 }}>
              {t(`${section.chromeKey}.list.moves`, {
                count: item.game.moves.length,
              })}
            </Typography>
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

          {/*
            The one region that scrolls — the shell's aside is a non-scrolling
            flex column so that the head above and the controls below stay put
            (see `Layout.tsx`). Rendered one tab at a time, because the move list
            scrolls the selected ply into view and a hidden copy would be
            scrolling a zero-height box on every ply change.
          */}
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
                <MoveList
                  game={item.game}
                  currentPly={ply}
                  onSelectPly={goToPly}
                  annotatedPlies={annotatedPlies}
                />
                <Box sx={{ mt: 2 }}>
                  <CopyableValue
                    label={t(`${section.chromeKey}.detail.fen`)}
                    value={fen}
                    testId={`${section.itemTestId}-fen`}
                  />
                </Box>
                <Box
                  sx={{
                    mt: 2,
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 1,
                  }}
                >
                  <Button
                    size="small"
                    variant="contained"
                    onClick={handOffGameTo("/tools/analysis")}
                    data-testid={`${section.itemTestId}-open-analysis`}
                  >
                    {t(`${section.chromeKey}.detail.openInAnalysis`)}
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={handOffGameTo("/games/load-pgn")}
                    data-testid={`${section.itemTestId}-open-load-pgn`}
                  >
                    {t(`${section.chromeKey}.detail.openInLoadPgn`)}
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={handOffFenTo("/engine/play")}
                    data-testid={`${section.itemTestId}-play-engine`}
                  >
                    {t(`${section.chromeKey}.detail.playWithEngine`)}
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={handOffFenTo("/tools/editor")}
                    data-testid={`${section.itemTestId}-open-editor`}
                  >
                    {t(`${section.chromeKey}.detail.openInEditor`)}
                  </Button>
                </Box>
              </>
            )}
            {tab === "info" && <GameInfo game={item.game} />}
            {tab === "description" && (
              <Box data-testid={`${section.itemTestId}-description`}>
                {!gameHasComments && (
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    {t(`${section.chromeKey}.detail.noDescription`)}
                  </Typography>
                )}

                {comments.preamble.length > 0 && (
                  <Box
                    data-testid={`${section.itemTestId}-description-preamble`}
                    sx={{ mb: comments.moves.length > 0 ? 2 : 0 }}
                  >
                    {comments.preamble.map((paragraph, index) => (
                      <Typography key={index} variant="body2" sx={{ mb: 1 }}>
                        {paragraph}
                      </Typography>
                    ))}
                  </Box>
                )}

                <Stack spacing={1}>
                  {comments.moves.map((entry) => {
                    const current = entry.ply === ply;
                    return (
                      <Box
                        key={entry.ply}
                        component="button"
                        type="button"
                        onClick={() => goToPly(entry.ply)}
                        aria-current={current ? "true" : undefined}
                        data-testid={`${section.itemTestId}-description-entry-${entry.ply}`}
                        sx={{
                          display: "block",
                          width: "100%",
                          textAlign: "start",
                          font: "inherit",
                          color: "inherit",
                          cursor: "pointer",
                          p: 1,
                          borderRadius: 1,
                          border: "1px solid",
                          borderColor: current ? "primary.main" : "divider",
                          bgcolor: current ? "action.selected" : "transparent",
                          "&:hover": { bgcolor: "action.hover" },
                        }}
                      >
                        <Typography
                          variant="caption"
                          sx={{ display: "block", fontWeight: 700, mb: 0.5 }}
                        >
                          {moveLabel(entry.ply)}
                        </Typography>
                        {entry.paragraphs.map((paragraph, index) => (
                          <Typography
                            key={index}
                            variant="body2"
                            sx={{
                              mb:
                                index < entry.paragraphs.length - 1 ? 0.75 : 0,
                            }}
                          >
                            {paragraph}
                          </Typography>
                        ))}
                      </Box>
                    );
                  })}
                </Stack>
              </Box>
            )}
          </Box>

          {/*
            Pinned above the controls, outside the scrolling region above — a
            long game's comment on a move buried deep in the list would
            otherwise sit off-screen until the reader scrolled the move list
            down to find it. `flexShrink: 0` keeps it fixed the same way
            `BoardControls` is.
          */}
          {tab === "moves" && activeComment && (
            <Box
              data-testid={`${section.itemTestId}-move-comment`}
              sx={{
                flexShrink: 0,
                p: 1,
                borderRadius: 1,
                border: "1px solid",
                borderColor: "divider",
                bgcolor: "action.hover",
                maxHeight: "30%",
                overflowY: "auto",
              }}
            >
              <Typography
                variant="caption"
                sx={{ display: "block", fontWeight: 700, mb: 0.5 }}
              >
                {moveLabel(activeComment.ply)}
              </Typography>
              {activeComment.paragraphs.map((paragraph, index) => (
                <Typography
                  key={index}
                  variant="body2"
                  sx={{
                    mb: index < activeComment.paragraphs.length - 1 ? 0.75 : 0,
                  }}
                >
                  {paragraph}
                </Typography>
              ))}
            </Box>
          )}

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

export default LibraryGameDetail;
