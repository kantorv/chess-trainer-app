import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Checkbox from "@mui/material/Checkbox";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import ArticleRounded from "@mui/icons-material/ArticleRounded";
import SportsEsportsRounded from "@mui/icons-material/SportsEsportsRounded";
import { Link as RouterLink } from "react-router";
import { useTranslation } from "react-i18next";
import { Chessboard, type ChessboardOptions } from "react-chessboard";

import {
  ANALYSIS_REFERENCE_KEY,
  gameReferenceOf,
} from "../../../../lib/gameReference";
import { gameTag } from "../../../../lib/gameModel";
import { mainlineGame, type GameTree } from "../../../../lib/gameTree";
import type { LibraryGame } from "../../../../lib/libraryCatalog";
import {
  openingOfLine,
  type OpeningEntry,
} from "../../../../lib/openings";
import { downloadPgn } from "../../../../lib/pgnExport";
import {
  SAVED_ANALYSIS_PLAYER,
  savedAnalysisFen,
  savedAnalysisSummary,
  savedAnalysisToTree,
  type SavedAnalysis,
} from "../../../../lib/savedAnalyses";
import {
  removeSavedAnalysis,
  savedAnalysesCatalog,
} from "../../../../lib/savedAnalysisStore";
import { RightPanel } from "../../../main/rightPanel";
import SavedListExportBar from "../../../shared/SavedListExportBar";
import SavedListRemoveButton from "../../../shared/SavedListRemoveButton";
import SavedListViewToggle from "../../../shared/SavedListViewToggle";
import {
  SAVED_LIST_DEFAULT_VIEW,
  savedListDate,
  savedListGridSx,
  savedListLine,
  type SavedListView,
} from "../../../shared/savedList";
import { useOpeningBook } from "../../../shared/useOpeningBook";
import { useSavedAnalyses } from "./useSavedAnalyses";

/**
 * **Saved analyses** — every board the reader has worked on at the Analysis
 * Board, newest first, each with somewhere to take it.
 *
 * It is [`views/engine/saved/SavedGames.tsx`](../../../engine/saved/SavedGames.tsx)
 * again, in the Tools folder beside the screen whose output it lists: the same
 * three-way view toggle over the same two card sizes
 * ([`cardSize.ts`](../../../library/cardSize.ts)), the same delete control, the
 * same rule that a record the store has and the catalog cannot parse is still
 * listed so it can still be removed. What that screen's header comment says
 * about all of it holds here and is not repeated; only the two places an
 * analysis is **not** a game are written out below. The toggle, the export bar
 * and the delete control are the shared saved-list machinery
 * (`views/shared/savedList.ts` and the three `SavedList*.tsx` beside it), which
 * all three saved screens consume.
 *
 * ### 1. There is no result, and no side the reader was on
 *
 * A game against the engine is identified by which colour you had and how it
 * stands. An analysis has neither — both colours are yours and it never ends. So
 * a row is identified by *what is being analysed*: the players, when the board
 * was opened from a library game, and otherwise the generic name; and then how
 * far the mainline runs, how many side lines were tried, and where you stopped.
 *
 * ### 2. A card previews where you were standing, not where the line ends
 *
 * The saved-games screen previews a game's **final** position, because that is
 * where it would be picked up. A tree has no final position — the reader may
 * have been three moves deep inside a variation — so the record carries that
 * place as SAN from the root (`lib/savedAnalyses.ts`) and both the preview and
 * the reopened screen use it.
 *
 * ### 3. Taking them out again
 *
 * The list view carries a checkbox per row and, in the top bar, a select-all and
 * a download — the Saved games screen's export (`lib/pgnExport.ts`), and here
 * for the same reason and with the same two rules: only in the list view, so
 * switching view drops the selection; and a join of the stored PGN rather than a
 * re-write, so a record this build cannot read still exports intact. What a
 * reader gets out of here is one file holding the side lines too, which is the
 * one thing an analysis has to export.
 *
 * ### Where a row can go, and why those three
 *
 * | Destination | Carries | Because |
 * | --- | --- | --- |
 * | Analysis Board | `?analysis=<id>` | it is the only screen that can go on *working*, and the id is what restores the side lines, the place in them, the orientation and the engine settings |
 * | Load PGN | `?game=analysis/saved/<id>` | it replays the mainline, so the game has to cross — as the reference it already takes |
 * | Play with Engine | `?fen=` at the position it was left on | it replays nothing; what it wants is the position being looked at |
 *
 * The middle one is the section-agnostic hand-off (`lib/gameReference.ts`) and
 * not a transport of this screen's own: the saved analyses are presented to it
 * as a catalog, so Load PGN never learns that this screen exists.
 */

/**
 * A card's preview board. Read-only, and showing the position the reader was
 * standing on. Each board takes the analysis' own id, since `options.id` has to
 * be unique across the page and this screen shows many at once.
 */
const previewOptions = (
  saved: SavedAnalysis,
  tree: GameTree,
): ChessboardOptions => ({
  id: `saved-analyses-preview-${saved.id}`,
  position: savedAnalysisFen(saved, tree),
  boardOrientation: saved.orientation,
  allowDragging: false,
  allowDrawingArrows: false,
  showNotation: false,
});

/** The three links a readable analysis offers, or `undefined` when it is not one. */
const destinationsOf = (
  saved: SavedAnalysis,
  tree: GameTree | undefined,
  item: LibraryGame | undefined,
) => {
  if (tree === undefined || item === undefined) return undefined;
  const reference = encodeURIComponent(
    gameReferenceOf(ANALYSIS_REFERENCE_KEY, item),
  );
  return {
    resume: `/tools/analysis?analysis=${encodeURIComponent(saved.id)}`,
    loadPgn: `/games/load-pgn?game=${reference}`,
    play: `/engine/play?fen=${encodeURIComponent(savedAnalysisFen(saved, tree))}`,
  };
};

type EntryProps = {
  saved: SavedAnalysis;
  /** The record's PGN as a tree, or `undefined` for one that will not read. */
  tree: GameTree | undefined;
  /** The catalog's parse of it, or `undefined` for the same reason. */
  item: LibraryGame | undefined;
};

type CardProps = EntryProps & {
  /** What the mainline opened with, once the book has loaded and if it names one. */
  opening: OpeningEntry | undefined;
};

/**
 * The two lines that identify an analysis in either view: what is being looked
 * at, and then how big it is, how far in the reader got, and when.
 *
 * A hook rather than a pure helper because every part of it is translated, and
 * not exported because both callers are in this file — a non-component export
 * from a `.tsx` costs fast refresh. The `when` formatting and the join are the
 * shared `savedList.ts` helpers rather than a second copy of them.
 */
const useCaption = ({ saved, tree, item }: EntryProps) => {
  const { t, i18n } = useTranslation();
  const summary = savedAnalysisSummary(saved, tree);

  const when = savedListDate(saved.updatedAt, i18n.language);

  /*
    An analysis begun from a library game keeps that game's tag pairs, so it is
    named by its players. One begun from a position or from an empty board
    carries this screen's own placeholder tags (`savedAnalysisHeaders`), and
    those are not a name — a row saying "Analysis – Analysis" tells the reader
    nothing — so it falls back to the translated generic.
  */
  const headers = item?.game.headers ?? {};
  const white = gameTag(headers, "White");
  const black = gameTag(headers, "Black");
  const named =
    white !== undefined &&
    black !== undefined &&
    white !== SAVED_ANALYSIS_PLAYER &&
    black !== SAVED_ANALYSIS_PLAYER;

  return {
    primary: named ? `${white} – ${black}` : t("savedAnalyses.untitled"),
    secondary:
      tree === undefined || item === undefined
        ? t("savedAnalyses.unreadable")
        : savedListLine([
            t("savedAnalyses.moves", { count: summary.moves }),
            // Every node past the mainline is a move the reader tried and kept.
            // Zero of them is not a fact worth a slot on a two-line card.
            summary.variations > 0
              ? t("savedAnalyses.variations", {
                  count: summary.variations,
                })
              : "",
            summary.ply > 0 ? t("savedAnalyses.atPly", { ply: summary.ply }) : "",
            when,
          ]),
  };
};

type RowProps = EntryProps & {
  /** Whether this row is picked for export. */
  checked: boolean;
  onToggle: () => void;
};

function SavedAnalysisRow({ saved, tree, item, checked, onToggle }: RowProps) {
  const { t } = useTranslation();
  const { primary, secondary } = useCaption({ saved, tree, item });
  const to = destinationsOf(saved, tree, item);

  return (
    <ListItem
      disableGutters
      data-testid={`saved-analyses-item-${saved.id}`}
      sx={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 1.5,
        py: 1.25,
        borderBottom: "1px solid",
        borderColor: "divider",
      }}
    >
      <Box sx={{ minWidth: 0, flex: "1 1 12rem" }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
          {primary}
        </Typography>
        <Typography
          variant="caption"
          sx={{
            display: "block",
            color: "text.secondary",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {secondary}
        </Typography>
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
        {to !== undefined && (
          <>
            <Button
              component={RouterLink}
              to={to.resume}
              size="small"
              variant="contained"
              data-testid={`saved-analyses-continue-${saved.id}`}
            >
              {t("savedAnalyses.continue")}
            </Button>
            <Button
              component={RouterLink}
              to={to.loadPgn}
              size="small"
              variant="outlined"
              data-testid={`saved-analyses-loadpgn-${saved.id}`}
            >
              {t("savedAnalyses.openInLoadPgn")}
            </Button>
            <Button
              component={RouterLink}
              to={to.play}
              size="small"
              variant="outlined"
              data-testid={`saved-analyses-play-${saved.id}`}
            >
              {t("savedAnalyses.play")}
            </Button>
          </>
        )}
        <SavedListRemoveButton
          id={saved.id}
          onRemove={removeSavedAnalysis}
          labelKey="savedAnalyses"
          testIdPrefix="saved-analyses"
        />
        {/* Last in the row, as it is on the sites a reader will have exported a
            game from — and selectable even for a record that will not parse,
            since the export copies the stored PGN rather than re-writing it. */}
        <Checkbox
          size="small"
          checked={checked}
          onChange={onToggle}
          slotProps={{ input: { "aria-label": t("savedAnalyses.select") } }}
          data-testid={`saved-analyses-select-${saved.id}`}
        />
      </Box>
    </ListItem>
  );
}

function SavedAnalysisCard({ saved, tree, item, opening }: CardProps) {
  const { t } = useTranslation();
  const { primary, secondary } = useCaption({ saved, tree, item });
  const to = destinationsOf(saved, tree, item);

  return (
    <Card variant="outlined" data-testid={`saved-analyses-item-${saved.id}`}>
      {/* The board *is* the continue button — the primary action, and the one
          thing on the card big enough to be worth clicking. A record with no
          readable tree has no position to draw, so it gets the message in the
          same square instead. */}
      {to === undefined || tree === undefined ? (
        <Box
          sx={{
            m: 1,
            aspectRatio: "1 / 1",
            display: "grid",
            placeItems: "center",
            p: 1,
            borderRadius: 1,
            bgcolor: "action.hover",
          }}
        >
          <Typography
            variant="caption"
            sx={{ color: "text.secondary", textAlign: "center" }}
          >
            {t("savedAnalyses.unreadable")}
          </Typography>
        </Box>
      ) : (
        <CardActionArea
          component={RouterLink}
          to={to.resume}
          data-testid={`saved-analyses-continue-${saved.id}`}
          aria-label={t("savedAnalyses.continue")}
        >
          <Box sx={{ p: 1 }}>
            <Box sx={{ width: "100%", aspectRatio: "1 / 1" }}>
              <Chessboard options={previewOptions(saved, tree)} />
            </Box>
          </Box>
        </CardActionArea>
      )}

      {/* Outside the action area on purpose: a button inside a button is
          neither valid HTML nor reliably clickable. */}
      <Box sx={{ px: 1, pb: 1 }}>
        <Typography
          variant="caption"
          sx={{
            display: "block",
            fontWeight: 600,
            lineHeight: 1.3,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {primary}
        </Typography>
        <Typography
          variant="caption"
          sx={{
            display: "block",
            color: "text.secondary",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {secondary}
        </Typography>
        {/* The opening gets its own line, as it does on a saved game's card:
            the line above is already three facts wide, and this is the one a
            reader recognises a line by. Absent until the book has loaded, and
            for a line it does not name. */}
        {opening !== undefined && (
          <Typography
            variant="caption"
            dir="ltr"
            data-testid={`saved-analyses-opening-${saved.id}`}
            sx={{
              display: "block",
              color: "text.secondary",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {`${opening.name} · ${opening.eco}`}
          </Typography>
        )}

        <Box sx={{ display: "flex", alignItems: "center", mt: 0.5, ml: -0.5 }}>
          {to !== undefined && (
            <>
              <Tooltip title={t("savedAnalyses.openInLoadPgn")}>
                <IconButton
                  component={RouterLink}
                  to={to.loadPgn}
                  size="small"
                  aria-label={t("savedAnalyses.openInLoadPgn")}
                  data-testid={`saved-analyses-loadpgn-${saved.id}`}
                >
                  <ArticleRounded fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title={t("savedAnalyses.play")}>
                <IconButton
                  component={RouterLink}
                  to={to.play}
                  size="small"
                  aria-label={t("savedAnalyses.play")}
                  data-testid={`saved-analyses-play-${saved.id}`}
                >
                  <SportsEsportsRounded fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          )}
          <Box sx={{ marginInlineStart: "auto" }}>
            <SavedListRemoveButton
              id={saved.id}
              onRemove={removeSavedAnalysis}
              labelKey="savedAnalyses"
              testIdPrefix="saved-analyses"
            />
          </Box>
        </Box>
      </Box>
    </Card>
  );
}

function SavedAnalyses() {
  const { t } = useTranslation();

  const [view, setView] = useState<SavedListView>(SAVED_LIST_DEFAULT_VIEW);

  const analyses = useSavedAnalyses();
  /*
    Read after the subscription above, and memoised on the same snapshot the
    hook returned — so the parsed catalog is rebuilt when an analysis is saved
    or removed and at no other time. The list itself is the *store's* order,
    which is newest first.
  */
  const catalog = savedAnalysesCatalog();
  const itemById = new Map(
    catalog.items
      .filter((item): item is LibraryGame => item.kind === "game")
      .map((item) => [item.id, item]),
  );

  /*
    The trees, parsed once per snapshot. The catalog above holds each record's
    **mainline** — that is what a `LibraryGame` is — and this screen needs the
    side lines: to count them, and to find the node the reader was standing on.
    So the PGN is read a second way, and memoised for the same reason the
    catalog is.
  */
  const treeById = useMemo(() => {
    const found = new Map<string, GameTree>();
    for (const saved of analyses) {
      const tree = savedAnalysisToTree(saved);
      if (tree !== undefined) found.set(saved.id, tree);
    }
    return found;
  }, [analyses]);

  const entries = analyses.map((saved) => ({
    saved,
    tree: treeById.get(saved.id),
    item: itemById.get(saved.id),
  }));

  /*
    Which analyses are picked for export. Held as a set of ids rather than a
    flag per row, so one deleted — here or in another tab — simply falls out of
    the list without leaving a phantom in the count: everything below reads the
    selection *through* `analyses`, never on its own.
  */
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const selected = analyses.filter((saved) => picked.has(saved.id));

  const togglePicked = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  // The header box: all when some or none are picked, none when all are.
  const toggleAll = () =>
    setPicked(
      selected.length === analyses.length
        ? new Set()
        : new Set(analyses.map((saved) => saved.id)),
    );

  const downloadSelected = () =>
    downloadPgn(
      "chess-trainer-analyses",
      selected.map((saved) => saved.pgn),
    );

  const book = useOpeningBook();

  /*
    One walk per analysis, memoised on the trees and the book — both stable
    between changes, so thirty records are looked up once rather than on every
    render and every toggle of the view. The **mainline** is what is named: it
    is what the analysis is of, where a side line is one thing tried inside it.
  */
  const openings = useMemo(() => {
    const found = new Map<string, OpeningEntry>();
    if (book === null) return found;

    for (const [id, tree] of treeById) {
      const opening = openingOfLine(
        book.book,
        book.positions,
        mainlineGame(tree).moves.map((move) => move.fen),
      );
      if (opening !== undefined) found.set(id, opening);
    }
    return found;
  }, [treeById, book]);

  return (
    <>
      <Box
        data-testid="saved-analyses-screen"
        sx={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        <Box
          data-testid="saved-analyses-top-bar"
          sx={{
            flexShrink: 0,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 1.5,
            pb: 1.5,
            mb: 0.5,
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <Box sx={{ minWidth: 0, marginInlineEnd: "auto" }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
              {t("savedAnalyses.title")}
            </Typography>
            <Typography
              data-testid="saved-analyses-count"
              variant="caption"
              sx={{ display: "block", color: "text.secondary" }}
            >
              {t("savedAnalyses.count", { count: analyses.length })}
            </Typography>
          </Box>

          {/*
            The export controls, and only beside the view that has the
            checkboxes they drive — see the header comment.
          */}
          {view === "list" && analyses.length > 0 && (
            <SavedListExportBar
              testIdPrefix="saved-analyses"
              labelKey="savedAnalyses"
              checked={selected.length === analyses.length}
              indeterminate={
                selected.length > 0 && selected.length < analyses.length
              }
              onToggleAll={toggleAll}
              selectedCount={selected.length}
              onClearSelected={() => setPicked(new Set())}
              onDownload={downloadSelected}
            />
          )}

          {/*
            A real change drops the selection, because the checkboxes only
            exist in the list view — a count for rows nobody can see is a trap.
            The toggle itself is the shared one (`SavedListViewToggle`), which
            never calls back with the view already showing.
          */}
          <SavedListViewToggle
            value={view}
            onChange={(next) => {
              setView(next);
              setPicked(new Set());
            }}
            labelKey="savedAnalyses"
            testIdPrefix="saved-analyses"
          />
        </Box>

        {/*
          The one region that scrolls. The shell hands this screen a fixed-height
          box and scrolls nothing inside it, so whichever view is showing has to
          do it itself — the same flex column every screen filling the board
          square uses.
        */}
        {analyses.length === 0 ? (
          <Box
            data-testid="saved-analyses-body"
            sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}
          >
            <Typography
              data-testid="saved-analyses-empty"
              variant="body2"
              sx={{ color: "text.secondary", textAlign: "center", py: 4 }}
            >
              {t("savedAnalyses.empty")}
            </Typography>
          </Box>
        ) : view === "list" ? (
          <Box
            data-testid="saved-analyses-body"
            sx={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}
          >
            <List disablePadding>
              {entries.map((entry) => (
                <SavedAnalysisRow
                  key={entry.saved.id}
                  {...entry}
                  checked={picked.has(entry.saved.id)}
                  onToggle={() => togglePicked(entry.saved.id)}
                />
              ))}
            </List>
          </Box>
        ) : (
          <Box data-testid="saved-analyses-grid" sx={savedListGridSx(view)}>
            {entries.map((entry) => (
              <SavedAnalysisCard
                key={entry.saved.id}
                {...entry}
                opening={openings.get(entry.saved.id)}
              />
            ))}
          </Box>
        )}
      </Box>

      <RightPanel>
        <Box sx={{ color: "text.secondary" }}>
          <Typography variant="body2" sx={{ mb: 1 }}>
            {t("savedAnalyses.hint")}
          </Typography>
          <Typography variant="body2" data-testid="saved-analyses-storage-note">
            {t("savedAnalyses.storage")}
          </Typography>
        </Box>
      </RightPanel>
    </>
  );
}

export default SavedAnalyses;
