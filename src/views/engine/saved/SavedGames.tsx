import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import List from "@mui/material/List";
import Typography from "@mui/material/Typography";
import CreateNewFolderRoundedIcon from "@mui/icons-material/CreateNewFolderRounded";
import { useTranslation } from "react-i18next";

import type { LibraryGame } from "../../../lib/libraryCatalog";
import {
  openingOfLine,
  type OpeningEntry,
} from "../../../lib/openings";
import { downloadPgn } from "../../../lib/pgnExport";
import { slugify } from "../../../lib/pgnLibrary";
import {
  gameFolderSubtree,
  gameFolderChildren,
  gamesUnderFolder,
  gamesInFolder,
  type GameFolder,
} from "../../../lib/savedGameFolders";
import { removeGameFolder } from "../../../lib/savedGameFolderStore";
import { savedGamesCatalog } from "../../../lib/savedGameStore";
import type { SavedGame } from "../../../lib/savedGames";
import { RightPanel } from "../../main/rightPanel";
import SavedListExportBar from "../../shared/SavedListExportBar";
import SavedListViewToggle from "../../shared/SavedListViewToggle";
import {
  SAVED_LIST_DEFAULT_VIEW,
  savedListGridSx,
  type SavedListView,
} from "../../shared/savedList";
import { useOpeningBook } from "../../shared/useOpeningBook";
import { SavedGameCard, SavedGameRow } from "./SavedGameViews";
import { SavedFolderCard, SavedFolderRow } from "./SavedFolderViews";
import { SavedFolderBreadcrumb } from "./SavedFolderBreadcrumb";
import SavedGamesDialogs, {
  type NameDialogState,
} from "./SavedGamesDialogs";
import { useFolderBrowser } from "./useFolderBrowser";
import { useGameFolders } from "./useGameFolders";
import { useSavedGames } from "./useSavedGames";

/**
 * **Saved games** — every game the reader has played against the engine, newest
 * first, filed into a tree of folders (CTA-46) and each with somewhere to take
 * it.
 *
 * It sits in the Engine folder beside Play with Engine, because these are that
 * screen's games: nothing was uploaded, imported or shipped, and there is no
 * catalog to browse. Play with Engine writes a row on every move
 * (`usePlayWithEngine`), so this screen has nothing to save and no form — it
 * is a list of games and three destinations.
 *
 * ### A tree of folders, the openings' one again
 *
 * Since CTA-46 the flat list is filed into folders — the Saved openings
 * screen's folder system (CTA-40, refactored in CTA-43) over the games' own
 * store. Folders are **display organisation only**: the catalog
 * (`savedGameCatalogOf`), the `?game=` hand-off and the `?saved=` resume are
 * untouched, and a game filed anywhere still opens everywhere it did. What is
 * this screen's own is the *filing*: an opening is filed when it is saved (the
 * save prompt carries the folder choice), but a game is written by an effect on
 * Play with Engine — nothing to click — so filing happens here, one game at a
 * time, through the move control on each row and card
 * (`fileSavedGame`, the store's in-place write).
 *
 * The one trap the openings do not have is the **autosave**: the record the
 * effect writes carries no folder knowledge, so the store carries the stored
 * `folderId` forward (`saveGame`) and the idempotent compare does not read it —
 * the first move after filing a game keeps its folder, and mounting a resumed
 * filed game re-orders nothing.
 *
 * The screen is split into debuggable pieces, the openings' split again: the
 * folder browsing is the [`useFolderBrowser`](./useFolderBrowser.ts) hook, the
 * game rows and cards are [`SavedGameViews.tsx`](./SavedGameViews.tsx) and the
 * folder rows and cards are [`SavedFolderViews.tsx`](./SavedFolderViews.tsx),
 * the breadcrumb and the dialog stack are their own files beside them, and this
 * file is the state and the wiring — the folder CRUD as the manager (create
 * under the folder the reader is standing in, rename, move anywhere but the
 * folder's own subtree, and delete, which keeps the contents: an empty folder
 * deletes at once, one with contents asks first, and its games become Unfiled
 * while its sub-folders re-parent to its own parent).
 *
 * ### Two ways to look at the same list
 *
 * A row says what a game *is*; a board says what it *looks like*, and for a
 * game you are coming back to that is often the faster way to recognise it. So
 * the top bar carries a three-way toggle — the list, small boards, big boards —
 * and the two board settings are the library list screen's own two, through
 * [`cardSize.ts`](../../library/cardSize.ts) rather than a second copy of the
 * grid track. The toggle, the export bar and the view-switch behaviour are the
 * shared saved-list machinery (`views/shared/savedList.ts` and the
 * `SavedList*.tsx` beside it), which all three saved screens consume.
 *
 * **A saved game's card previews the position it was left at**, not the one it
 * started from — which is where it deliberately parts company with
 * `LibraryList`, whose cards preview a game's *first* position because that is
 * where a replay begins. A saved game is not a game to replay from move one; it
 * is one to pick back up, so the board shows what the reader will be looking at
 * a click later. `libraryItemFen` is therefore not what this screen reads.
 *
 * ### Where a row can go, and why those three
 *
 * | Destination | Carries | Because |
 * | --- | --- | --- |
 * | Play with Engine | `?saved=<id>` | it is the only screen that can *play on*, and the id is what restores the side and the settings as well as the moves |
 * | Analysis Board, Load PGN | `?game=engine/saved/<id>` | they replay a game, so the game has to cross — and it crosses as the reference the two of them already take |
 *
 * The second is the section-agnostic hand-off (`lib/gameReference.ts`) and not a
 * transport of this screen's own: the saved games are presented to it as a
 * catalog, so neither destination learns that a game can come from here. The
 * first is `?saved=` rather than `?game=` for the one thing that reference
 * cannot carry — a `LibraryGame` is moves, and resuming needs the engine
 * settings too.
 *
 * Continuing is the **primary** action in both views: in the list it is the one
 * filled button, and on a card it is the board itself. The other two are text
 * buttons beside it in the list and icon buttons in the card's footer, because a
 * 160px card has no room for three words — and they sit *outside* the card's
 * action area, since a button inside a button is neither valid nor clickable.
 *
 * ### Taking games out again
 *
 * The list view carries a checkbox per row and, in the top bar, a select-all and
 * a download — pick some games, get one `.pgn` holding them
 * (`lib/pgnExport.ts`). It is the one thing this screen has that the library
 * sections do not, and it is here because these are the only games in the app
 * that exist **nowhere else**: a shipped study is already a file in the repo and
 * an uploaded one is already a file the reader has, but a game played against
 * the engine lives in this browser's `localStorage` and nothing but this button
 * gets it out. Beside it, each folder row and card carries a download of the
 * whole subtree — one `.pgn` of everything under that folder, the same set its
 * count stands for.
 *
 * Three decisions worth knowing:
 *
 * - **Only the list view has the checkboxes.** A checkbox on a card would sit
 *   beside the two icon buttons and the delete, in a footer that is already
 *   full at 160px — and the board views exist for *recognising* a game, where
 *   the list exists for working through one. Switching view therefore drops the
 *   selection, because a selection nothing on screen shows is a trap.
 * - **The exports are joins, not re-writes.** A saved game is stored as PGN
 *   already, so a file is those records with a blank line between them:
 *   nothing is re-parsed, and a record this build cannot read still exports
 *   intact. Which is also why a row that will not parse is still selectable.
 * - **The picks persist across folder navigation** — the Saved openings
 *   screen's semantics again: select-all in a folder *adds* that folder's
 *   games, the chip counts the whole picked set wherever the reader is
 *   standing, and each folder's download is the whole subtree, the set its
 *   count stands for.
 *
 * ### A row the store has and the catalog does not
 *
 * The list is built from the **store**, not from the catalog: a record whose PGN
 * will not parse is absent from the catalog, and building the list from that
 * would leave the reader with a row they can neither open nor delete because it
 * is not rendered at all. So such a row is listed, says so, and offers the two
 * actions that still mean something — filing (folders are organisation, not
 * readability) and the delete. It has no board either — there is no position to
 * draw — so in the board view it is a card with the message in it.
 */

/**
 * The folder export's file stem: the reader's own name for the folder,
 * slugified. A name that slugs to nothing — an empty one, or one written in a
 * non-Latin script (`slugify` keeps `[a-z0-9]` only) — falls back to the fixed
 * stem rather than producing `-2026-09-12.pgn`.
 */
const FOLDER_STEM_FALLBACK = "saved-games";

const folderStem = (folder: GameFolder): string =>
  slugify(folder.name) || FOLDER_STEM_FALLBACK;

function SavedGames() {
  const { t } = useTranslation();

  const [view, setView] = useState<SavedListView>(SAVED_LIST_DEFAULT_VIEW);

  const games = useSavedGames();
  const folders = useGameFolders();
  const {
    browseId,
    foldersHere,
    gamesHere,
    crumbs,
    open: openFolder,
  } = useFolderBrowser(games, folders);

  /*
    Read after the subscription above, and memoised on the same snapshot the
    hook returned — so the parsed games are rebuilt when a game is saved or
    removed and at no other time. The list itself is the *store's* order, which
    is newest first.
  */
  const catalog = savedGamesCatalog();
  const itemById = new Map(
    catalog.items
      .filter((item): item is LibraryGame => item.kind === "game")
      .map((item) => [item.id, item]),
  );

  const book = useOpeningBook();

  /*
    One walk per game, memoised on the snapshot and the book — both stable
    between changes, so fifty games are looked up once rather than on every
    render, every toggle of the view and every keystroke anywhere in the shell.
  */
  const openings = useMemo(() => {
    const found = new Map<string, OpeningEntry>();
    if (book === null) return found;

    for (const saved of games) {
      const item = itemById.get(saved.id);
      if (item === undefined) continue;
      const opening = openingOfLine(
        book.book,
        book.positions,
        item.game.moves.map((move) => move.fen),
      );
      if (opening !== undefined) found.set(saved.id, opening);
    }
    return found;
    // `games` is the store's stable snapshot, and `itemById` derives from the
    // same snapshot's catalog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [games, catalog, book]);

  /*
    Which games are picked for export. Held as a set of ids rather than a flag
    per row, so a game deleted — here or in another tab — simply falls out of
    the list without leaving a phantom in the count: everything below reads the
    selection *through* `games`, never on its own.
  */
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const selected = games.filter((saved) => picked.has(saved.id));

  const togglePicked = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  /*
    Select-all over the rows on screen. The picks persist across folder
    navigation — the Saved openings screen's semantics, and the one place this
    screen changed when the folders arrived — so this is an **add** of this
    folder's games rather than a replace: checking adds what is on screen,
    unchecking removes just these, and picks made elsewhere stay.
  */
  const selectedHere = gamesHere.filter((saved) => picked.has(saved.id));
  const toggleAllHere = () =>
    setPicked((current) => {
      const next = new Set(current);
      const allPicked =
        gamesHere.length > 0 && selectedHere.length === gamesHere.length;
      for (const saved of gamesHere) {
        if (allPicked) next.delete(saved.id);
        else next.add(saved.id);
      }
      return next;
    });

  const downloadSelected = () =>
    downloadPgn(
      "chess-trainer-games",
      selected.map((saved) => saved.pgn),
    );

  const [nameDialog, setNameDialog] = useState<NameDialogState>(null);
  const [moving, setMoving] = useState<GameFolder | null>(null);
  const [filing, setFiling] = useState<SavedGame | null>(null);
  const [deleting, setDeleting] = useState<GameFolder | null>(null);

  /** One `.pgn` of everything under the folder — the set its count stands for. */
  const downloadFolder = (folder: GameFolder) =>
    downloadPgn(
      folderStem(folder),
      gamesInFolder(games, folders, folder.id).map((row) => row.pgn),
    );

  /*
    The folder CRUD as the manager: the dialogs speak the stores directly, and
    this only decides the delete's wording — and where the reader lands. An
    **empty** folder (no games across its subtree, no direct sub-folders)
    deletes at once, the same way deleting nothing asks for nothing; anything
    else opens the confirmation, which states the rule before it runs.
  */
  const confirmDelete = (folder: GameFolder) => {
    /*
      Stand where the contents went: its sub-folders re-parent to this folder's
      own parent, so landing there keeps the reader beside what they kept — and
      it is also the only move that keeps the browser off a folder that no
      longer exists.
    */
    if (
      browseId !== null &&
      gameFolderSubtree(folders, folder.id).has(browseId)
    ) {
      openFolder(folder.parentId);
    }
    removeGameFolder(folder.id);
  };

  const startDelete = (folder: GameFolder) => {
    const isEmpty =
      gamesUnderFolder(games, folders, folder.id) === 0 &&
      gameFolderChildren(folders, folder.id).length === 0;
    if (isEmpty) confirmDelete(folder);
    else setDeleting(folder);
  };

  const entriesHere = gamesHere.map((saved) => ({
    saved,
    item: itemById.get(saved.id),
  }));

  return (
    <>
      <Box
        data-testid="saved-games-screen"
        sx={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        <Box
          data-testid="saved-games-top-bar"
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
              {t("savedGames.title")}
            </Typography>
            <Typography
              data-testid="saved-games-count"
              variant="caption"
              sx={{ display: "block", color: "text.secondary" }}
            >
              {t("savedGames.count", { count: games.length })}
            </Typography>
          </Box>

          <Button
            size="small"
            variant="outlined"
            startIcon={<CreateNewFolderRoundedIcon fontSize="small" />}
            data-testid="saved-games-new-folder"
            onClick={() => setNameDialog({ mode: "create", parentId: browseId })}
          >
            {t("savedGames.folder.newFolder")}
          </Button>

          {/*
            The export controls, and only beside the view that has the
            checkboxes they drive — see the header comment. `visibility` is not
            used to hide them: they are genuinely not there in the board views,
            and the selection is dropped with them.
          */}
          {view === "list" && games.length > 0 && (
            <SavedListExportBar
              testIdPrefix="saved-games"
              labelKey="savedGames"
              checked={
                gamesHere.length > 0 && selectedHere.length === gamesHere.length
              }
              indeterminate={
                selectedHere.length > 0 && selectedHere.length < gamesHere.length
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
            The toggle itself is the shared one (`SavedListViewToggle`), which
            never calls back with the view already showing.
          */}
          <SavedListViewToggle
            value={view}
            onChange={(next) => {
              setView(next);
              setPicked(new Set());
            }}
            labelKey="savedGames"
            testIdPrefix="saved-games"
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
          games: the reader drills into a folder, they do not scroll past it.
        */}
        {foldersHere.length === 0 && gamesHere.length === 0 ? (
          <Box
            data-testid="saved-games-body"
            sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}
          >
            <Typography
              data-testid={
                browseId === null
                  ? "saved-games-empty"
                  : "saved-games-folder-empty"
              }
              variant="body2"
              sx={{ color: "text.secondary", textAlign: "center", py: 4 }}
            >
              {browseId === null
                ? t("savedGames.empty")
                : t("savedGames.folder.empty")}
            </Typography>
          </Box>
        ) : view === "list" ? (
          <Box
            data-testid="saved-games-body"
            sx={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}
          >
            <List disablePadding>
              {foldersHere.map((folder) => (
                <SavedFolderRow
                  key={folder.id}
                  folder={folder}
                  count={gamesUnderFolder(games, folders, folder.id)}
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
                <SavedGameRow
                  key={entry.saved.id}
                  {...entry}
                  checked={picked.has(entry.saved.id)}
                  onToggle={() => togglePicked(entry.saved.id)}
                  onMove={setFiling}
                />
              ))}
            </List>
          </Box>
        ) : (
          <Box data-testid="saved-games-grid" sx={savedListGridSx(view)}>
            {foldersHere.map((folder) => (
              <SavedFolderCard
                key={folder.id}
                folder={folder}
                count={gamesUnderFolder(games, folders, folder.id)}
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
              <SavedGameCard
                key={entry.saved.id}
                {...entry}
                opening={openings.get(entry.saved.id)}
                onMove={setFiling}
              />
            ))}
          </Box>
        )}
      </Box>

      <RightPanel>
        <Box sx={{ color: "text.secondary" }}>
          <Typography variant="body2" sx={{ mb: 1 }}>
            {t("savedGames.hint")}
          </Typography>
          <Typography variant="body2" data-testid="saved-games-storage-note">
            {t("savedGames.storage")}
          </Typography>
        </Box>
      </RightPanel>

      <SavedGamesDialogs
        games={games}
        folders={folders}
        nameDialog={nameDialog}
        setNameDialog={setNameDialog}
        moving={moving}
        setMoving={setMoving}
        filing={filing}
        setFiling={setFiling}
        deleting={deleting}
        setDeleting={setDeleting}
        onDeleteFolder={confirmDelete}
      />
    </>
  );
}

export default SavedGames;
