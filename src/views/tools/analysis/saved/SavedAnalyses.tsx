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
import CreateNewFolderRoundedIcon from "@mui/icons-material/CreateNewFolderRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import { Link as RouterLink, useLocation, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Chessboard, type ChessboardOptions } from "react-chessboard";

import { mainlineGame, type GameTree } from "../../../../lib/gameTree";
import {
  openingOfLine,
  type OpeningEntry,
} from "../../../../lib/openings";
import { downloadPgn } from "../../../../lib/pgnExport";
import { slugify } from "../../../../lib/pgnText";
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
import { removeSavedAnalyses } from "../../../../lib/savedAnalysisStore";
import FolderDeleteDialog from "../../../shared/folders/FolderDeleteDialog";
import FolderMoveDialog from "../../../shared/folders/FolderMoveDialog";
import FolderNameDialog from "../../../shared/folders/FolderNameDialog";
import { SavedFolderBreadcrumb } from "../../../shared/folders/SavedFolderBreadcrumb";
import { SavedFolderCard, SavedFolderRow } from "../../../shared/folders/SavedFolderViews";
import { RightPanel } from "../../../main/rightPanel";
import { RepertoireBulkDeleteDialog } from "../../../repertoires/RepertoireFolderDialogs";
import SavedListExportBar from "../../../shared/SavedListExportBar";
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
 * **Saved analyses** (`/tools/analysis/saved`) — the analyses the reader has
 * saved on the Analysis Board, newest first, filed into a nested tree of
 * folders, as rows or as preview boards at the saved lists' two card sizes.
 *
 * Since CTA-73 it is laid out as the **Repertoires list**
 * (`views/repertoires/Repertoires.tsx`), without that list's Games menu:
 *
 * - **One destination.** An analysis opens on the Analysis Board
 *   (`?analysis=<id>`) — the Open button on a row, the board itself on a card.
 *   There is no Play with Engine button here: the board has Play
 *   from here and its Export tab, and the `?game=analysis/saved/<id>`
 *   reference still resolves for any screen that hands one on.
 * - **Its settings, from a gear** on every row and card
 *   (`AnalysisSettingsScreen.tsx`: title, description, side, next-move arrows
 *   and the folder it is filed under — which is where an analysis moves
 *   between folders).
 * - **Deleting is in bulk, and in every view.** No row or card deletes itself:
 *   each carries a checkbox — the cards too — so the export bar (select-all,
 *   the count, the download and a delete that asks first) shows in all three
 *   views, and switching view keeps the picks.
 *
 * What is the analyses' own:
 *
 * - **A row is named by the reader's name**, then how far the mainline runs,
 *   how many side lines were tried, where the reader stopped and when — and
 *   the description beneath, as the repertoires print theirs.
 * - **A card previews where the reader was standing** — a tree has no final
 *   position, so the record carries that place as SAN from the root
 *   (`lib/savedAnalyses.ts`) — facing the analysis' own side, with the opening
 *   the mainline reached beneath it.
 * - **Folders nest** (`lib/savedAnalysisFolders.ts`, the saved games' model,
 *   through that screen's folder rows, cards, breadcrumb and dialogs): folders
 *   first, then this folder's analyses; create under the folder the reader is
 *   in, rename, move anywhere but its own subtree, delete keeping the contents
 *   (an empty folder at once, otherwise after a confirmation), and download a
 *   folder's whole subtree as one `.pgn`. The folder the reader is standing in
 *   is `?folder=<id>` — the board's split lands there. **The picks persist
 *   across folders**: select-all adds what is on screen, and the chip counts
 *   the whole picked set.
 * - **A record the store has and cannot parse is still listed**, says so and
 *   can still be picked — to delete it, or to export its stored PGN intact.
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

const boardPath = (saved: SavedAnalysis) =>
  `/tools/analysis?analysis=${encodeURIComponent(saved.id)}`;

type ItemProps = {
  saved: SavedAnalysis;
  /** The record's PGN as a tree, or `undefined` for one that will not read. */
  tree: GameTree | undefined;
  /** Whether it is picked. */
  checked: boolean;
  onToggle: () => void;
};

type CardProps = ItemProps & {
  /** What the mainline opened with, once the book has loaded and if it names one. */
  opening: OpeningEntry | undefined;
};

/**
 * The lines that identify an analysis in either view: its name, then how big
 * it is, how far in the reader got, and when. A hook because every part of it
 * is translated.
 */
const useCaption = ({ saved, tree }: Pick<ItemProps, "saved" | "tree">) => {
  const { t, i18n } = useTranslation();
  const summary = savedAnalysisSummary(saved, tree);

  return {
    // The reader's name — a record from before names is named by its tags
    // (`savedAnalysisFrom`), which is the players of a game it was begun from.
    primary: saved.name || t("savedAnalyses.untitled"),
    secondary:
      tree === undefined
        ? t("savedAnalyses.unreadable")
        : savedListLine([
            t("savedAnalyses.moves", { count: summary.moves }),
            // Zero side lines is not a fact worth a slot on a two-line card.
            summary.variations > 0
              ? t("savedAnalyses.variations", { count: summary.variations })
              : "",
            summary.ply > 0 ? t("savedAnalyses.atPly", { ply: summary.ply }) : "",
            savedListDate(saved.updatedAt, i18n.language),
          ]),
  };
};

const ellipsis = {
  display: "block",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

/**
 * The settings link — a gear on the row and the card. It hands the list as it
 * stands as `from`, so Save and Cancel come back here, inside this folder.
 */
function SettingsLink({ saved }: { saved: SavedAnalysis }) {
  const { t } = useTranslation();
  const location = useLocation();
  return (
    <Tooltip title={t("analysis.settingsLink.open")}>
      <IconButton
        size="small"
        component={RouterLink}
        to={`/tools/analysis/saved/${encodeURIComponent(saved.id)}/settings`}
        state={{ from: `${location.pathname}${location.search}` }}
        aria-label={t("analysis.settingsLink.open")}
        data-testid={`saved-analyses-settings-${saved.id}`}
      >
        <SettingsRoundedIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
}

/** The pick — on the row and the card, over the list's one picked set. */
function SelectBox({ saved, checked, onToggle }: ItemProps) {
  const { t } = useTranslation();
  return (
    <Checkbox
      size="small"
      checked={checked}
      onChange={onToggle}
      slotProps={{ input: { "aria-label": t("savedAnalyses.select") } }}
      data-testid={`saved-analyses-select-${saved.id}`}
    />
  );
}

function SavedAnalysisRow(props: ItemProps) {
  const { saved, tree } = props;
  const { t } = useTranslation();
  const { primary, secondary } = useCaption(props);

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
        <Typography variant="subtitle2" dir="auto" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
          {primary}
        </Typography>
        <Typography variant="caption" sx={{ ...ellipsis, color: "text.secondary" }}>
          {secondary}
        </Typography>
        {saved.description !== "" && (
          <Typography
            variant="caption"
            dir="auto"
            data-testid={`saved-analyses-description-${saved.id}`}
            sx={{ ...ellipsis, color: "text.secondary", fontStyle: "italic" }}
          >
            {saved.description}
          </Typography>
        )}
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
        {/* A record that will not read has nothing to open — only a pick. */}
        {tree !== undefined && (
          <Button
            component={RouterLink}
            to={boardPath(saved)}
            size="small"
            variant="contained"
            data-testid={`saved-analyses-open-${saved.id}`}
          >
            {t("savedAnalyses.open")}
          </Button>
        )}
        <SettingsLink saved={saved} />
        <SelectBox {...props} />
      </Box>
    </ListItem>
  );
}

function SavedAnalysisCard(props: CardProps) {
  const { saved, tree, opening } = props;
  const { t } = useTranslation();
  const { primary, secondary } = useCaption(props);

  return (
    <Card variant="outlined" data-testid={`saved-analyses-item-${saved.id}`}>
      {/* The board *is* the open button. A record with no readable tree has no
          position to draw, so it gets the message in the same square. */}
      {tree === undefined ? (
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
          <Typography variant="caption" sx={{ color: "text.secondary", textAlign: "center" }}>
            {t("savedAnalyses.unreadable")}
          </Typography>
        </Box>
      ) : (
        <CardActionArea
          component={RouterLink}
          to={boardPath(saved)}
          data-testid={`saved-analyses-open-${saved.id}`}
          aria-label={t("savedAnalyses.open")}
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
      <Box sx={{ px: 1, pb: 1, display: "flex", alignItems: "center", gap: 0.5 }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            variant="caption"
            dir="auto"
            sx={{ ...ellipsis, fontWeight: 600, lineHeight: 1.3 }}
          >
            {primary}
          </Typography>
          <Typography variant="caption" sx={{ ...ellipsis, color: "text.secondary" }}>
            {secondary}
          </Typography>
          {/* The one fact a reader recognises a line by. Absent until the book
              has loaded, and for a line it does not name. */}
          {opening !== undefined && (
            <Typography
              variant="caption"
              dir="ltr"
              data-testid={`saved-analyses-opening-${saved.id}`}
              sx={{ ...ellipsis, color: "text.secondary" }}
            >
              {`${opening.name} · ${opening.eco}`}
            </Typography>
          )}
        </Box>
        <SettingsLink saved={saved} />
        <SelectBox {...props} />
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
    The trees, parsed once per snapshot (the store's, which is newest first):
    the side lines are counted and the node the reader was standing on found
    in them, and a record that will not parse has none.
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
  const [deleting, setDeleting] = useState<AnalysisFolder | null>(null);
  const [deletingPicked, setDeletingPicked] = useState(false);
  // The count asked about, held past the confirm so the dialog's closing
  // transition does not read "Delete 0".
  const [askedCount, setAskedCount] = useState(0);

  const entriesHere = rowsHere.map((saved) => ({
    saved,
    tree: treeById.get(saved.id),
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

          {/* The export bar, in every view: the cards carry checkboxes too. */}
          {analyses.length > 0 && (
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
              onDelete={() => {
                setAskedCount(selected.length);
                setDeletingPicked(true);
              }}
            />
          )}

          {/* Switching view keeps the picks: every view has the checkboxes. */}
          <SavedListViewToggle
            value={view}
            onChange={setView}
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
                checked={picked.has(entry.saved.id)}
                onToggle={() => togglePicked(entry.saved.id)}
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
      <RepertoireBulkDeleteDialog
        labelKey="savedAnalyses"
        testIdPrefix="saved-analyses"
        open={deletingPicked}
        count={askedCount}
        onConfirm={() => {
          // One write for the lot; the picks go with them.
          removeSavedAnalyses(selected.map((saved) => saved.id));
          setPicked(new Set());
        }}
        onClose={() => setDeletingPicked(false)}
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
