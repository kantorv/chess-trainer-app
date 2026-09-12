import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import List from "@mui/material/List";
import Typography from "@mui/material/Typography";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CreateNewFolderRoundedIcon from "@mui/icons-material/CreateNewFolderRounded";
import { Link as RouterLink } from "react-router";
import { useTranslation } from "react-i18next";

import { mainlineGame, type GameTree } from "../../../../lib/gameTree";
import { openingOfLine, type OpeningEntry } from "../../../../lib/openings";
import { downloadPgn } from "../../../../lib/pgnExport";
import { slugify } from "../../../../lib/pgnLibrary";
import { savedOpeningToTree } from "../../../../lib/savedOpenings";
import {
  openingFolderChildren,
  openingFolderSubtree,
  openingsUnderFolder,
  openInFolder,
  type OpeningFolder,
} from "../../../../lib/savedOpeningFolders";
import { removeOpeningFolder } from "../../../../lib/savedOpeningFolderStore";
import { RightPanel } from "../../../main/rightPanel";
import SavedListExportBar from "../../../shared/SavedListExportBar";
import SavedListViewToggle from "../../../shared/SavedListViewToggle";
import {
  SAVED_LIST_DEFAULT_VIEW,
  savedListGridSx,
  type SavedListView,
} from "../../../shared/savedList";
import { useOpeningBook } from "../../../shared/useOpeningBook";
import { SavedOpeningCard, SavedOpeningRow } from "./SavedOpeningViews";
import { SavedFolderCard, SavedFolderRow } from "./SavedFolderViews";
import { SavedFolderBreadcrumb } from "./SavedFolderBreadcrumb";
import SavedOpeningsDialogs, {
  type EditingState,
  type NameDialogState,
} from "./SavedOpeningsDialogs";
import { useFolderBrowser } from "./useFolderBrowser";
import { useSavedOpenings } from "./useSavedOpenings";
import { useOpeningFolders } from "./useOpeningFolders";

/**
 * **Saved openings** — every position the reader has saved on the Openings
 * screen, newest first, filed into a tree of folders (CTA-40) and each with
 * somewhere to take it.
 *
 * It is [`views/tools/analysis/saved/SavedAnalyses.tsx`](../../analysis/saved/SavedAnalyses.tsx)
 * again, in the Tools folder beside the screen whose output it lists — the same
 * two views over the same caption shape, the same export, the same rule that a
 * record the store has and the PGN cannot parse is still listed so it can still
 * be removed. The view machinery is the shared saved-list module
 * (`views/shared/savedList.ts` and the `SavedList*` beside it), which all three
 * saved screens consume. What is written out below is the one place an opening
 * is **not** an analysis: the record carries a **note** instead of players, so
 * the note is what a row is named by and what is editable here (through the
 * shared `NoteDialog`), and a pick **persists across folder navigation** —
 * select-all in a folder *adds* that folder's openings, the chip counts the
 * whole picked set, and each folder row and card carries a download of the
 * whole subtree, the same set its count stands for.
 *
 * The screen is split into debuggable pieces: the folder browsing is the
 * [`useFolderBrowser`](./useFolderBrowser.ts) hook, the rows and cards are
 * [`SavedOpeningViews.tsx`](./SavedOpeningViews.tsx) and
 * [`SavedFolderViews.tsx`](./SavedFolderViews.tsx), the breadcrumb and the
 * dialog stack are their own files beside them, and this file is the state and
 * the wiring — the folder CRUD as the manager (create under the folder the
 * reader is standing in, rename, move anywhere but the folder's own subtree,
 * and delete, which keeps the contents: an empty folder deletes at once, one
 * with contents asks first, and its openings become Unfiled while its
 * sub-folders re-parent to its own parent).
 *
 * | Destination | Carries | Because |
 * | --- | --- | --- |
 * | Openings | `?openings=<id>` | it is the only screen that can go on *exploring* the tree, and the id is what restores the side lines, the orientation and the note |
 * | Play with Engine | `?fen=` at the end of the mainline | it replays nothing; what it wants is the position being looked at |
 */

/**
 * The selective export's file stem — the fixed one the saved-games screen uses
 * ("chess-trainer-games"), because a download of picks is not about any one
 * folder and the dated suffix is what keeps repeated downloads apart.
 */
const SELECTED_STEM = "chess-trainer-openings";

/** The folder export's fallback stem — for a name that slugs to nothing. */
const FOLDER_STEM_FALLBACK = "saved-openings";

/**
 * The folder export's file stem: the reader's own name for the folder,
 * slugified. A name that slugs to nothing — an empty one, or one written in a
 * non-Latin script (`slugify` keeps `[a-z0-9]` only) — falls back to the fixed
 * stem rather than producing `-2026-09-12.pgn`.
 */
const folderStem = (folder: OpeningFolder): string =>
  slugify(folder.name) || FOLDER_STEM_FALLBACK;

function SavedOpenings() {
  const { t } = useTranslation();

  const [view, setView] = useState<SavedListView>(SAVED_LIST_DEFAULT_VIEW);
  const [editing, setEditing] = useState<EditingState>(null);
  const [nameDialog, setNameDialog] = useState<NameDialogState>(null);
  const [moving, setMoving] = useState<OpeningFolder | null>(null);
  const [deleting, setDeleting] = useState<OpeningFolder | null>(null);

  const openings = useSavedOpenings();
  const folders = useOpeningFolders();
  const {
    browseId,
    foldersHere,
    openingsHere,
    crumbs,
    open: openFolder,
  } = useFolderBrowser(openings, folders);

  /*
    The trees, parsed once per snapshot. An opening's PGN is re-read as a tree
    (side lines and all) rather than taken from a catalog, because the side lines
    are the one thing an opening explorer keeps — the card counts them, and the
    preview board draws the end of the mainline from the same tree.
  */
  const treeById = useMemo(() => {
    const found = new Map<string, GameTree>();
    for (const saved of openings) {
      const tree = savedOpeningToTree(saved);
      if (tree !== undefined) found.set(saved.id, tree);
    }
    return found;
  }, [openings]);

  const book = useOpeningBook();

  /*
    One walk per opening, memoised on the trees and the book — both stable
    between changes, so thirty records are looked up once rather than on every
    render and every toggle of the view. The **mainline** is what is named: it
    is what the opening is of, where a side line is one thing tried inside it.
  */
  const openingNames = useMemo(() => {
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

  const entriesHere = openingsHere.map((saved) => ({
    saved,
    tree: treeById.get(saved.id),
  }));

  /*
    Which openings are picked for export. Held as a set of ids rather than a
    flag per row, so a deleted opening — here or in another tab — falls out of
    the list without leaving a phantom in the count: everything below reads the
    selection *through* `openings`, never on its own.
  */
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const selected = openings.filter((saved) => picked.has(saved.id));

  const togglePicked = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  /*
    Select-all over the rows on screen. The picks persist across folder
    navigation — the one place this screen parts company with the saved-games
    one, whose selection is scoped to a flat list — so this is an **add** of
    this folder's openings rather than a replace: checking adds what is on
    screen, unchecking removes just these, and picks made elsewhere stay.
  */
  const selectedHere = openingsHere.filter((saved) => picked.has(saved.id));
  const toggleAllHere = () =>
    setPicked((current) => {
      const next = new Set(current);
      const allPicked =
        openingsHere.length > 0 && selectedHere.length === openingsHere.length;
      for (const saved of openingsHere) {
        if (allPicked) next.delete(saved.id);
        else next.add(saved.id);
      }
      return next;
    });

  const downloadSelected = () =>
    downloadPgn(
      SELECTED_STEM,
      selected.map((saved) => saved.pgn),
    );

  /** One `.pgn` of everything under the folder — the set its count stands for. */
  const downloadFolder = (folder: OpeningFolder) =>
    downloadPgn(
      folderStem(folder),
      openInFolder(openings, folders, folder.id).map((row) => row.pgn),
    );

  const startEdit = (id: string) => {
    const found = openings.find((saved) => saved.id === id);
    if (found !== undefined) setEditing({ id, note: found.note });
  };

  /*
    Delete one folder, keeping its contents — the store's `removeOpeningFolder`
    is the operation; this only decides the wording. An **empty** folder (no
    openings across its subtree, no direct sub-folders) deletes at once, the
    same way deleting nothing asks for nothing; anything else opens the
    confirmation, which states the rule before it runs.
  */
  const confirmDelete = (folder: OpeningFolder) => {
    /*
      Stand where the contents went: its sub-folders re-parent to this folder's
      own parent, so landing there keeps the reader beside what they kept — and
      it is also the only move that keeps the browser off a folder that no
      longer exists.
    */
    if (
      browseId !== null &&
      openingFolderSubtree(folders, folder.id).has(browseId)
    ) {
      openFolder(folder.parentId);
    }
    removeOpeningFolder(folder.id);
  };

  const startDelete = (folder: OpeningFolder) => {
    const isEmpty =
      openingsUnderFolder(openings, folders, folder.id) === 0 &&
      openingFolderChildren(folders, folder.id).length === 0;
    if (isEmpty) confirmDelete(folder);
    else setDeleting(folder);
  };

  return (
    <>
      <Box
        data-testid="saved-openings-screen"
        sx={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        <Box
          data-testid="saved-openings-top-bar"
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
              {t("savedOpenings.title")}
            </Typography>
            <Typography
              data-testid="saved-openings-count"
              variant="caption"
              sx={{ display: "block", color: "text.secondary" }}
            >
              {t("savedOpenings.count", { count: openings.length })}
            </Typography>
          </Box>

          {/*
            The board this screen's sidebar entry hides (CTA-42): the Openings
            folder is a single entry to *this* screen, so the plain
            new-opening view is reached from here. No query params — the
            arrival is a fresh board.
          */}
          <Button
            size="small"
            variant="outlined"
            component={RouterLink}
            to="/openings"
            startIcon={<AddRoundedIcon fontSize="small" />}
            data-testid="saved-openings-new"
          >
            {t("savedOpenings.new")}
          </Button>

          <Button
            size="small"
            variant="outlined"
            startIcon={<CreateNewFolderRoundedIcon fontSize="small" />}
            data-testid="saved-openings-new-folder"
            onClick={() => setNameDialog({ mode: "create", parentId: browseId })}
          >
            {t("savedOpenings.folder.newFolder")}
          </Button>

          {view === "list" && openings.length > 0 && (
            <SavedListExportBar
              testIdPrefix="saved-openings"
              labelKey="savedOpenings"
              checked={
                openingsHere.length > 0 &&
                selectedHere.length === openingsHere.length
              }
              indeterminate={
                selectedHere.length > 0 &&
                selectedHere.length < openingsHere.length
              }
              onToggleAll={toggleAllHere}
              selectedCount={selected.length}
              onClearSelected={() => setPicked(new Set())}
              onDownload={downloadSelected}
            />
          )}

          <SavedListViewToggle
            value={view}
            onChange={(next) => {
              setView(next);
              setPicked(new Set());
            }}
            labelKey="savedOpenings"
            testIdPrefix="saved-openings"
          />
        </Box>

        {crumbs.length > 0 && (
          <SavedFolderBreadcrumb crumbs={crumbs} onOpen={openFolder} />
        )}

        {/*
          The one region that scrolls. The shell hands this screen a fixed-height
          box and scrolls nothing inside it, so whichever view is showing has to
          do it itself — the same flex column every screen filling the board
          square uses. Folders come first in both views, then this folder's
          openings: the reader drills into a folder, they do not scroll past it.
        */}
        {foldersHere.length === 0 && openingsHere.length === 0 ? (
          <Box
            data-testid="saved-openings-body"
            sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}
          >
            <Typography
              data-testid={
                browseId === null
                  ? "saved-openings-empty"
                  : "saved-openings-folder-empty"
              }
              variant="body2"
              sx={{ color: "text.secondary", textAlign: "center", py: 4 }}
            >
              {browseId === null
                ? t("savedOpenings.empty")
                : t("savedOpenings.folder.empty")}
            </Typography>
          </Box>
        ) : view === "list" ? (
          <Box
            data-testid="saved-openings-body"
            sx={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}
          >
            <List disablePadding>
              {foldersHere.map((folder) => (
                <SavedFolderRow
                  key={folder.id}
                  folder={folder}
                  count={openingsUnderFolder(openings, folders, folder.id)}
                  onOpen={openFolder}
                  onDownload={downloadFolder}
                  onRename={(renamed) =>
                    setNameDialog({ mode: "rename", folder: renamed })
                  }
                  onMove={setMoving}
                  onDelete={startDelete}
                />
              ))}
              {entriesHere.map((entry) => (
                <SavedOpeningRow
                  key={entry.saved.id}
                  {...entry}
                  checked={picked.has(entry.saved.id)}
                  onToggle={() => togglePicked(entry.saved.id)}
                  onEdit={startEdit}
                />
              ))}
            </List>
          </Box>
        ) : (
          <Box data-testid="saved-openings-grid" sx={savedListGridSx(view)}>
            {foldersHere.map((folder) => (
              <SavedFolderCard
                key={folder.id}
                folder={folder}
                count={openingsUnderFolder(openings, folders, folder.id)}
                onOpen={openFolder}
                onDownload={downloadFolder}
                onRename={(renamed) =>
                  setNameDialog({ mode: "rename", folder: renamed })
                }
                onMove={setMoving}
                onDelete={startDelete}
              />
            ))}
            {entriesHere.map((entry) => (
              <SavedOpeningCard
                key={entry.saved.id}
                {...entry}
                opening={openingNames.get(entry.saved.id)}
                onEdit={startEdit}
              />
            ))}
          </Box>
        )}
      </Box>

      <RightPanel>
        <Box sx={{ color: "text.secondary" }}>
          <Typography variant="body2" sx={{ mb: 1 }}>
            {t("savedOpenings.hint")}
          </Typography>
          <Typography variant="body2" data-testid="saved-openings-storage-note">
            {t("savedOpenings.storage")}
          </Typography>
        </Box>
      </RightPanel>

      <SavedOpeningsDialogs
        folders={folders}
        openings={openings}
        nameDialog={nameDialog}
        setNameDialog={setNameDialog}
        moving={moving}
        setMoving={setMoving}
        deleting={deleting}
        setDeleting={setDeleting}
        editing={editing}
        setEditing={setEditing}
        onDeleteFolder={confirmDelete}
      />
    </>
  );
}

export default SavedOpenings;
