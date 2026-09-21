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
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArticleRounded from "@mui/icons-material/ArticleRounded";
import CreateNewFolderRoundedIcon from "@mui/icons-material/CreateNewFolderRounded";
import DriveFileMoveRoundedIcon from "@mui/icons-material/DriveFileMoveRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import SportsEsportsRounded from "@mui/icons-material/SportsEsportsRounded";
import { Link as RouterLink, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Chessboard, type ChessboardOptions } from "react-chessboard";

import {
  ANALYSIS_REFERENCE_KEY,
  gameReferenceOf,
} from "../../../../lib/gameReference";
import { mainlineGame, type GameTree } from "../../../../lib/gameTree";
import type { LibraryGame } from "../../../../lib/libraryCatalog";
import {
  openingOfLine,
  type OpeningEntry,
} from "../../../../lib/openings";
import { downloadPgn } from "../../../../lib/pgnExport";
import { slugify } from "../../../../lib/pgnLibrary";
import {
  savedAnalysisFen,
  savedAnalysisSummary,
  savedAnalysisToTree,
  type SavedAnalysis,
} from "../../../../lib/savedAnalyses";
import {
  analysesHere,
  analysesInFolder,
  analysesUnderFolder,
  analysisFolderChildren,
  analysisFolderPath,
  analysisFolderSubtree,
  type AnalysisFolder,
} from "../../../../lib/savedAnalysisFolders";
import {
  createAnalysisFolder,
  moveAnalysisFolder,
  removeAnalysisFolder,
  renameAnalysisFolder,
} from "../../../../lib/savedAnalysisFolderStore";
import {
  fileSavedAnalysis,
  removeSavedAnalysis,
  savedAnalysesCatalog,
} from "../../../../lib/savedAnalysisStore";
import FolderDeleteDialog from "../../../engine/saved/FolderDeleteDialog";
import FolderMoveDialog from "../../../engine/saved/FolderMoveDialog";
import FolderNameDialog from "../../../engine/saved/FolderNameDialog";
import GameMoveDialog from "../../../engine/saved/GameMoveDialog";
import { SavedFolderBreadcrumb } from "../../../engine/saved/SavedFolderBreadcrumb";
import { SavedFolderCard, SavedFolderRow } from "../../../engine/saved/SavedFolderViews";
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
import { useAnalysisFolders } from "./useAnalysisFolders";
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
 *
 * ### 4. Named, and filed in a tree of folders (CTA-73)
 *
 * The Analysis Board saves explicitly now, so a record has the reader's name
 * for it and a folder — both, with its description, side and arrows, edited
 * on its settings screen (`AnalysisSettingsScreen.tsx`, linked from every row
 * and card) — the Saved games screen's
 * nested tree over the analyses' own store (`lib/savedAnalysisFolders.ts`),
 * through that screen's folder rows, cards, breadcrumb and dialogs. Folders
 * first, then this folder's analyses; create under the folder the reader is
 * in, rename, move anywhere but its own subtree, delete keeping the contents
 * (an empty folder at once, otherwise after a confirmation); each analysis
 * moves between folders from its own row or card; each folder downloads its
 * whole subtree as one `.pgn`. The folder the reader is standing in is the
 * URL's `?folder=<id>` — the Analysis Board's split lands the reader there,
 * and Back walks back up. **The picks persist across folders**, the Saved
 * games semantics: select-all adds what is on screen, the chip counts the
 * whole picked set.
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
  /** File it under a folder — opens the move dialog. */
  onMove: (saved: SavedAnalysis) => void;
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
const useCaption = ({ saved, tree, item }: Omit<EntryProps, "onMove">) => {
  const { t, i18n } = useTranslation();
  const summary = savedAnalysisSummary(saved, tree);

  const when = savedListDate(saved.updatedAt, i18n.language);

  return {
    // The reader's name — a record from before names is named by its tags
    // (`savedAnalysisFrom`), which is the players of a game it was begun from.
    primary: saved.name || t("savedAnalyses.untitled"),
    secondary:
      tree === undefined || item === undefined
        ? t("savedAnalyses.unreadable")
        : savedListLine([
            t("savedAnalyses.moves", { count: summary.moves }),
            // Every distinct side line the reader tried and kept, however long
            // each one runs. Zero of them is not a fact worth a slot on a
            // two-line card.
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

/**
 * The two organising controls every row and card carries: its settings (the
 * title, description, side, arrows and folder — `AnalysisSettingsScreen`),
 * and a quick move between folders.
 */
function OrganiseButtons({ saved, onMove }: Pick<EntryProps, "saved" | "onMove">) {
  const { t } = useTranslation();
  return (
    <>
      <Tooltip title={t("analysis.settingsLink.open")}>
        <IconButton
          size="small"
          component={RouterLink}
          to={`/tools/analysis/saved/${encodeURIComponent(saved.id)}/settings`}
          // Back to this list, in this folder.
          state={{ from: `/tools/analysis/saved${saved.folderId === null ? "" : `?folder=${encodeURIComponent(saved.folderId)}`}` }}
          aria-label={t("analysis.settingsLink.open")}
          data-testid={`saved-analyses-settings-${saved.id}`}
        >
          <SettingsRoundedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title={t("savedAnalyses.folder.moveGame")}>
        <IconButton
          size="small"
          aria-label={t("savedAnalyses.folder.moveGame")}
          data-testid={`saved-analyses-move-${saved.id}`}
          onClick={() => onMove(saved)}
        >
          <DriveFileMoveRoundedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </>
  );
}

function SavedAnalysisRow({ saved, tree, item, checked, onToggle, onMove }: RowProps) {
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
        <OrganiseButtons saved={saved} onMove={onMove} />
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

function SavedAnalysisCard({ saved, tree, item, opening, onMove }: CardProps) {
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
          <Box sx={{ marginInlineStart: "auto", display: "flex", alignItems: "center" }}>
            <OrganiseButtons saved={saved} onMove={onMove} />
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

/** What the name dialog is open for — a folder made, or renamed. */
type NameDialogState =
  | { mode: "create"; parentId: string | null }
  | { mode: "rename"; folder: AnalysisFolder }
  | null;

/** A folder's download stem: its name slugified, else the fixed one. */
const folderStem = (folder: AnalysisFolder): string =>
  slugify(folder.name) || "saved-analyses";

function SavedAnalyses() {
  const { t } = useTranslation();

  const [view, setView] = useState<SavedListView>(SAVED_LIST_DEFAULT_VIEW);

  const analyses = useSavedAnalyses();
  const folders = useAnalysisFolders();

  /*
    Where the browser stands: `?folder=<id>`, so a split on the Analysis Board
    lands the reader in its folder and Back walks up. A folder that is not
    there (deleted, here or in another tab) reads as the top level.
  */
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedFolder = searchParams.get("folder");
  const currentFolder =
    requestedFolder === null
      ? undefined
      : folders.find((folder) => folder.id === requestedFolder);
  const browseId = currentFolder?.id ?? null;
  const openFolder = (id: string | null) =>
    setSearchParams(id === null ? {} : { folder: id });
  const foldersHere = analysisFolderChildren(folders, browseId);
  const crumbs =
    currentFolder === undefined ? [] : analysisFolderPath(folders, currentFolder.id);
  const rowsHere = analysesHere(analyses, folders, browseId);

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

  const [nameDialog, setNameDialog] = useState<NameDialogState>(null);
  const [moving, setMoving] = useState<AnalysisFolder | null>(null);
  const [filing, setFiling] = useState<SavedAnalysis | null>(null);
  const [deleting, setDeleting] = useState<AnalysisFolder | null>(null);

  const entriesHere = rowsHere.map((saved) => ({
    saved,
    tree: treeById.get(saved.id),
    item: itemById.get(saved.id),
    onMove: setFiling,
  }));

  /*
    Which analyses are picked for export. Held as a set of ids rather than a
    flag per row, so one deleted — here or in another tab — simply falls out of
    the count: everything below reads the selection *through* `analyses`. The
    picks persist across folders; select-all **adds** the rows on screen, and
    unchecking it removes just those.
  */
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const selected = analyses.filter((saved) => picked.has(saved.id));
  const selectedHere = rowsHere.filter((saved) => picked.has(saved.id));

  const togglePicked = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const toggleAllHere = () =>
    setPicked((current) => {
      const next = new Set(current);
      const allPicked = rowsHere.length > 0 && selectedHere.length === rowsHere.length;
      for (const saved of rowsHere) {
        if (allPicked) next.delete(saved.id);
        else next.add(saved.id);
      }
      return next;
    });

  const downloadSelected = () =>
    downloadPgn(
      "chess-trainer-analyses",
      selected.map((saved) => saved.pgn),
    );

  /** One `.pgn` of everything under the folder — the set its count stands for. */
  const downloadFolder = (folder: AnalysisFolder) =>
    downloadPgn(
      folderStem(folder),
      analysesInFolder(analyses, folders, folder.id).map((row) => row.pgn),
    );

  /*
    Delete keeps the contents (`removeAnalysisFolder`). Standing inside what is
    deleted, the reader moves to its parent — where its sub-folders went.
  */
  const confirmDelete = (folder: AnalysisFolder) => {
    if (browseId !== null && analysisFolderSubtree(folders, folder.id).has(browseId)) {
      openFolder(folder.parentId);
    }
    removeAnalysisFolder(folder.id);
  };

  const startDelete = (folder: AnalysisFolder) => {
    const isEmpty =
      analysesUnderFolder(analyses, folders, folder.id) === 0 &&
      analysisFolderChildren(folders, folder.id).length === 0;
    if (isEmpty) confirmDelete(folder);
    else setDeleting(folder);
  };

  const book = useOpeningBook();

  /*
    One walk per analysis, memoised on the trees and the book — both stable
    between changes. The **mainline** is what is named: it is what the analysis
    is of, where a side line is one thing tried inside it.
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

  const folderProps = (folder: AnalysisFolder) => ({
    folder,
    labelKey: "savedAnalyses",
    testIdPrefix: "saved-analyses",
    count: analysesUnderFolder(analyses, folders, folder.id),
    onOpen: openFolder,
    onDownload: downloadFolder,
    onRename: (renamed: AnalysisFolder) => setNameDialog({ mode: "rename", folder: renamed }),
    onMove: setMoving,
    onDelete: startDelete,
  });

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
            The board this screen's sidebar entry hides (CTA-58): the Analysis
            folder is a single entry to *this* screen, so a fresh board is
            reached from here. No query params — a blank Analysis Board.
          */}
          <Button
            size="small"
            variant="outlined"
            component={RouterLink}
            to="/tools/analysis"
            startIcon={<AddRoundedIcon fontSize="small" />}
            data-testid="saved-analyses-new"
          >
            {t("savedAnalyses.new")}
          </Button>

          <Button
            size="small"
            variant="outlined"
            startIcon={<CreateNewFolderRoundedIcon fontSize="small" />}
            data-testid="saved-analyses-new-folder"
            onClick={() => setNameDialog({ mode: "create", parentId: browseId })}
          >
            {t("savedAnalyses.folder.newFolder")}
          </Button>

          {/*
            The export controls, and only beside the view that has the
            checkboxes they drive — see the header comment.
          */}
          {view === "list" && analyses.length > 0 && (
            <SavedListExportBar
              testIdPrefix="saved-analyses"
              labelKey="savedAnalyses"
              checked={rowsHere.length > 0 && selectedHere.length === rowsHere.length}
              indeterminate={
                selectedHere.length > 0 && selectedHere.length < rowsHere.length
              }
              onToggleAll={toggleAllHere}
              selectedCount={selected.length}
              onClearSelected={() => setPicked(new Set())}
              onDownload={downloadSelected}
            />
          )}

          {/*
            A real change drops the selection, because the checkboxes only
            exist in the list view — a count for rows nobody can see is a trap.
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

        {crumbs.length > 0 && (
          <SavedFolderBreadcrumb
            crumbs={crumbs}
            onOpen={openFolder}
            labelKey="savedAnalyses"
            testIdPrefix="saved-analyses"
          />
        )}

        {/*
          The one region that scrolls. The shell hands this screen a fixed-height
          box and scrolls nothing inside it. Folders first, then this folder's
          analyses: the reader drills into a folder, they do not scroll past it.
        */}
        {foldersHere.length === 0 && rowsHere.length === 0 ? (
          <Box
            data-testid="saved-analyses-body"
            sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}
          >
            <Typography
              data-testid={
                browseId === null ? "saved-analyses-empty" : "saved-analyses-folder-empty"
              }
              variant="body2"
              sx={{ color: "text.secondary", textAlign: "center", py: 4 }}
            >
              {browseId === null
                ? t("savedAnalyses.empty")
                : t("savedAnalyses.folder.empty")}
            </Typography>
          </Box>
        ) : view === "list" ? (
          <Box
            data-testid="saved-analyses-body"
            sx={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}
          >
            <List disablePadding>
              {foldersHere.map((folder) => (
                <SavedFolderRow key={folder.id} {...folderProps(folder)} />
              ))}
              {entriesHere.map((entry) => (
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
            {foldersHere.map((folder) => (
              <SavedFolderCard key={folder.id} {...folderProps(folder)} />
            ))}
            {entriesHere.map((entry) => (
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

      <FolderNameDialog
        labelKey="savedAnalyses"
        idPrefix="analysis-folder"
        open={nameDialog !== null}
        title={
          nameDialog === null
            ? ""
            : nameDialog.mode === "create"
              ? t("savedAnalyses.folder.newFolder")
              : t("savedAnalyses.folder.renameFolder")
        }
        initial={
          nameDialog === null || nameDialog.mode === "create" ? "" : nameDialog.folder.name
        }
        onSave={(name) => {
          if (nameDialog === null) return;
          if (nameDialog.mode === "create") createAnalysisFolder(name, nameDialog.parentId);
          else renameAnalysisFolder(nameDialog.folder.id, name);
        }}
        onClose={() => setNameDialog(null)}
      />
      <FolderMoveDialog
        labelKey="savedAnalyses"
        idPrefix="analysis-folder"
        open={moving !== null}
        folders={folders}
        folder={moving}
        currentParentName={t("savedAnalyses.folder.topLevel")}
        onMove={(newParentId) => {
          if (moving !== null) moveAnalysisFolder(moving.id, newParentId);
          setMoving(null);
        }}
        onClose={() => setMoving(null)}
      />
      <GameMoveDialog
        labelKey="savedAnalyses"
        idPrefix="analysis-folder"
        open={filing !== null}
        folders={folders}
        game={filing === null ? null : { folderId: filing.folderId }}
        onFile={(folderId) => {
          if (filing !== null) fileSavedAnalysis(filing.id, folderId);
          setFiling(null);
        }}
        onClose={() => setFiling(null)}
      />
      <FolderDeleteDialog
        labelKey="savedAnalyses"
        idPrefix="analysis-folder"
        open={deleting !== null}
        folder={deleting}
        games={deleting === null ? 0 : analysesUnderFolder(analyses, folders, deleting.id)}
        subFolders={
          deleting === null ? 0 : analysisFolderChildren(folders, deleting.id).length
        }
        onConfirm={() => {
          if (deleting !== null) confirmDelete(deleting);
        }}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}

export default SavedAnalyses;
