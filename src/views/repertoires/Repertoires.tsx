import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Checkbox from "@mui/material/Checkbox";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Typography from "@mui/material/Typography";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import CreateNewFolderRoundedIcon from "@mui/icons-material/CreateNewFolderRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import DriveFileRenameOutlineRoundedIcon from "@mui/icons-material/DriveFileRenameOutlineRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import { Link as RouterLink, useLocation, useNavigate, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Chessboard, type ChessboardOptions } from "react-chessboard";

import { downloadPgn } from "../../lib/pgnExport";
import {
  isMultiGameRepertoire,
  type SavedRepertoire,
} from "../../lib/savedRepertoires";
import {
  createRepertoireFolder,
  removeRepertoireFolder,
  renameRepertoireFolder,
} from "../../lib/savedRepertoireFolderStore";
import {
  repertoiresInFolder,
  sortedRepertoireFolders,
  type RepertoireFolder,
} from "../../lib/savedRepertoireFolders";
import { removeSavedRepertoires } from "../../lib/savedRepertoireStore";
import { slugify } from "../../lib/pgnText";
import { RightPanel } from "../main/rightPanel";
import SavedListExportBar from "../shared/SavedListExportBar";
import SavedListViewToggle from "../shared/SavedListViewToggle";
import {
  SAVED_LIST_DEFAULT_VIEW,
  savedListDate,
  savedListGridSx,
  savedListLine,
  type SavedListView,
} from "../shared/savedList";
import {
  RepertoireBulkDeleteDialog,
  RepertoireFolderDeleteDialog,
  RepertoireFolderNameDialog,
} from "./RepertoireFolderDialogs";
import { RepertoireFolderCard, RepertoireFolderRow } from "./RepertoireFolderViews";
import { ReadingRepertoires } from "./RepertoireBoard";
import RepertoireGamesMenu from "./RepertoireGamesMenu";
import { useRepertoireFolders } from "./useRepertoireFolders";
import { useSavedRepertoires } from "./useSavedRepertoires";

/**
 * **Repertoires** (`/repertoires`) — the reader's own repertoires, newest
 * first, as rows or as preview boards at the saved lists' two card sizes (CTA-61).
 *
 * It is `views/tools/analysis/saved/SavedAnalyses.tsx` again, over the same
 * saved-list machinery (`views/shared/savedList.ts` and the `SavedList*.tsx`
 * beside it): the same toggle, the same export bar, the same scrolling
 * region. What that screen's header says holds here and is not repeated; the
 * differences:
 *
 * - **Deleting is in bulk, and in every view** (CTA-68). No row or card
 *   carries a delete of its own: each carries a checkbox — the cards too, so
 *   the export bar (select-all, the count, the download and a delete that
 *   asks first) shows in all three views, and switching view keeps the picks.
 *
 * - **One destination, and its games.** A repertoire opens on its own view
 *   (`/repertoires/<id>`, the player) — there is no single position to hand
 *   Play with Engine and no single game to hand on, since a repertoire is
 *   many lines — and each row and card carries the Games menu
 *   (`RepertoireGamesMenu.tsx`, CTA-63) beside it.
 * - **Folders, one level deep.** The top level lists the folders, then the
 *   Unfiled repertoires; `?folder=<id>` opens one — its repertoires, with its
 *   rename and delete in the top bar and the way back beside its name. A
 *   split lands the reader inside the folder it made. A repertoire moves
 *   between folders from its settings screen (CTA-68); a folder deleted keeps its
 *   repertoires (they go back to Unfiled). See `lib/savedRepertoireFolders.ts`.
 * - **A card previews where the repertoire branches.** Not the start, which
 *   every 1.e4 repertoire shares, and not any one line's end: the position the
 *   record's check found every line still agreeing on
 *   (`SavedRepertoire.previewFen`), so no card parses a move to draw itself.
 */

const previewOptions = (saved: SavedRepertoire): ChessboardOptions => ({
  id: `repertoires-preview-${saved.id}`,
  position: saved.previewFen,
  // The side the reader plays it from (its settings), as its board opens.
  boardOrientation: saved.settings.color,
  allowDragging: false,
  allowDrawingArrows: false,
  showNotation: false,
});

const boardPath = (saved: SavedRepertoire) =>
  `/repertoires/${encodeURIComponent(saved.id)}`;

/**
 * The settings link — a gear on both the row and the card. It hands the list
 * as `from`, so Save and Cancel come back here rather than to the board.
 */
function SettingsLink({ saved }: { saved: SavedRepertoire }) {
  const { t } = useTranslation();
  const location = useLocation();
  return (
    <Tooltip title={t("repertoires.settings.open")}>
      <IconButton
        size="small"
        component={RouterLink}
        to={`${boardPath(saved)}/settings`}
        // Back to this list as it stands — inside the folder it was opened in.
        state={{ from: `${location.pathname}${location.search}` }}
        aria-label={t("repertoires.settings.open")}
        data-testid={`repertoires-settings-${saved.id}`}
      >
        <SettingsRoundedIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
}

/** The two caption lines both views print: the name, then its size and date. */
const useCaption = (saved: SavedRepertoire) => {
  const { t, i18n } = useTranslation();
  // A text scan of the whole PGN — cheap, but a large record is worth not
  // rescanning on every checkbox toggle.
  const multiGame = useMemo(() => isMultiGameRepertoire(saved), [saved]);
  const stats = saved.stats;
  return {
    primary: saved.name || t("repertoires.untitled"),
    secondary: savedListLine([
      // A record from before the one-game rule says what it needs instead.
      multiGame ? t("repertoires.needsChoice") : "",
      !multiGame && stats !== undefined
        ? t("repertoires.moves", { count: stats.moves })
        : "",
      !multiGame && stats !== undefined && stats.variations > 0
        ? t("repertoires.variations", { count: stats.variations })
        : "",
      savedListDate(saved.updatedAt, i18n.language),
    ]),
  };
};

/** The pick — on both the row and the card, over the list's one picked set. */
function SelectBox({
  saved,
  checked,
  onToggle,
}: {
  saved: SavedRepertoire;
  checked: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Checkbox
      size="small"
      checked={checked}
      onChange={onToggle}
      slotProps={{ input: { "aria-label": t("repertoires.select") } }}
      data-testid={`repertoires-select-${saved.id}`}
    />
  );
}

const ellipsis = {
  display: "block",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

type ItemProps = {
  saved: SavedRepertoire;
  checked: boolean;
  onToggle: () => void;
};

function RepertoireRow({ saved, checked, onToggle }: ItemProps) {
  const { t } = useTranslation();
  const { primary, secondary } = useCaption(saved);

  return (
    <ListItem
      disableGutters
      data-testid={`repertoires-item-${saved.id}`}
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
        <Typography variant="caption" sx={{ ...ellipsis, color: "text.secondary" }}>
          {secondary}
        </Typography>
        {saved.settings.description !== "" && (
          <Typography
            variant="caption"
            dir="auto"
            data-testid={`repertoires-description-${saved.id}`}
            sx={{ ...ellipsis, color: "text.secondary", fontStyle: "italic" }}
          >
            {saved.settings.description}
          </Typography>
        )}
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
        <Button
          component={RouterLink}
          to={boardPath(saved)}
          size="small"
          variant="contained"
          data-testid={`repertoires-open-${saved.id}`}
        >
          {t("repertoires.open")}
        </Button>
        <RepertoireGamesMenu id={saved.id} testId={`repertoires-games-${saved.id}`} />
        <SettingsLink saved={saved} />
        <SelectBox saved={saved} checked={checked} onToggle={onToggle} />
      </Box>
    </ListItem>
  );
}

function RepertoireCard({ saved, checked, onToggle }: ItemProps) {
  const { t } = useTranslation();
  const { primary, secondary } = useCaption(saved);

  return (
    <Card variant="outlined" data-testid={`repertoires-item-${saved.id}`}>
      {/* The board *is* the open button — the one thing on the card big
          enough to be worth clicking. */}
      <CardActionArea
        component={RouterLink}
        to={boardPath(saved)}
        data-testid={`repertoires-open-${saved.id}`}
        aria-label={t("repertoires.open")}
      >
        <Box sx={{ p: 1 }}>
          <Box sx={{ width: "100%", aspectRatio: "1 / 1" }}>
            <Chessboard options={previewOptions(saved)} />
          </Box>
        </Box>
      </CardActionArea>

      <Box sx={{ px: 1, pb: 1, display: "flex", alignItems: "center", gap: 0.5 }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="caption" sx={{ ...ellipsis, fontWeight: 600, lineHeight: 1.3 }}>
            {primary}
          </Typography>
          <Typography variant="caption" sx={{ ...ellipsis, color: "text.secondary" }}>
            {secondary}
          </Typography>
        </Box>
        <RepertoireGamesMenu id={saved.id} testId={`repertoires-games-${saved.id}`} />
        <SettingsLink saved={saved} />
        <SelectBox saved={saved} checked={checked} onToggle={onToggle} />
      </Box>
    </Card>
  );
}

/**
 * The route: the list, once both stores' first reads have landed (IndexedDB —
 * a read is a promise), so a `?folder=` link is not read as the top level
 * before the folders are there.
 */
function Repertoires() {
  const repertoires = useSavedRepertoires();
  const folders = useRepertoireFolders();
  if (repertoires === undefined || folders === undefined) return <ReadingRepertoires />;
  return <RepertoiresList repertoires={repertoires} folders={folders} />;
}

function RepertoiresList({
  repertoires,
  folders,
}: {
  repertoires: readonly SavedRepertoire[];
  folders: readonly RepertoireFolder[];
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [view, setView] = useState<SavedListView>(SAVED_LIST_DEFAULT_VIEW);

  /*
    Where the reader is: a folder named by `?folder=`, or the top level. A
    folder the store does not hold — deleted in another tab, a stale link —
    is the top level, rather than an empty screen for nothing.
  */
  const [searchParams] = useSearchParams();
  const folderParam = searchParams.get("folder");
  const current = folders.find((folder) => folder.id === folderParam) ?? null;
  const folderId = current?.id ?? null;

  const visible = repertoiresInFolder(repertoires, folders, folderId);
  // Folders are one level: they are listed at the top level, and only there.
  const shownFolders = current === null ? sortedRepertoireFolders(folders) : [];
  const countIn = (id: string) => repertoiresInFolder(repertoires, folders, id).length;

  /*
    The picks, held as ids and read *through* the rows on screen, so one
    deleted or moved away falls out of the count rather than haunting it —
    and cleared on moving to another folder (adjusted during render, not in
    an effect), since a count for rows nobody can see is a trap. Switching
    view keeps them: every view has the checkboxes, so the same rows are
    picked whichever way they are drawn.
  */
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [pickedIn, setPickedIn] = useState<string | null>(folderId);
  if (pickedIn !== folderId) {
    setPickedIn(folderId);
    setPicked(new Set());
  }
  const selected = visible.filter((saved) => picked.has(saved.id));

  const togglePicked = (id: string) =>
    setPicked((currentPicks) => {
      const next = new Set(currentPicks);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const toggleAll = () =>
    setPicked(
      selected.length === visible.length
        ? new Set()
        : new Set(visible.map((saved) => saved.id)),
    );

  /* The dialogs: naming a folder, deleting one, deleting the picks. */
  const [naming, setNaming] = useState<{ folder: RepertoireFolder | null } | null>(null);
  const [deleting, setDeleting] = useState<RepertoireFolder | null>(null);
  const [deletingPicked, setDeletingPicked] = useState(false);
  // The count asked about, held past the confirm so the dialog's closing
  // transition does not read "Delete 0".
  const [askedCount, setAskedCount] = useState(0);

  // One write for the lot; the picks go with them.
  const deletePicked = () => {
    void removeSavedRepertoires(selected.map((saved) => saved.id));
    setPicked(new Set());
  };

  const saveName = (name: string) => {
    if (naming?.folder) void renameRepertoireFolder(naming.folder.id, name);
    else void createRepertoireFolder(name);
  };

  const deleteFolder = (folder: RepertoireFolder) => {
    void removeRepertoireFolder(folder.id);
    if (folder.id === folderId) navigate("/repertoires");
  };

  // An empty folder goes at once; one with repertoires in it asks first.
  const askDelete = (folder: RepertoireFolder) =>
    countIn(folder.id) === 0 ? deleteFolder(folder) : setDeleting(folder);

  const downloadFolder = (folder: RepertoireFolder) =>
    downloadPgn(
      slugify(folder.name) || "repertoire-folder",
      repertoiresInFolder(repertoires, folders, folder.id).map((saved) => saved.pgn),
    );

  const folderViewProps = (folder: RepertoireFolder) => ({
    folder,
    count: countIn(folder.id),
    onRename: (target: RepertoireFolder) => setNaming({ folder: target }),
    onDelete: askDelete,
    onDownload: downloadFolder,
  });

  const nothingHere = visible.length === 0 && shownFolders.length === 0;

  return (
    <>
      <Box
        data-testid="repertoires-screen"
        sx={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}
      >
        <Box
          data-testid="repertoires-top-bar"
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
          {current !== null && (
            <Tooltip title={t("repertoires.folder.back")}>
              <IconButton
                size="small"
                component={RouterLink}
                to="/repertoires"
                aria-label={t("repertoires.folder.back")}
                data-testid="repertoires-folder-back"
              >
                <ArrowBackRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Box sx={{ minWidth: 0, marginInlineEnd: "auto" }}>
            <Typography
              variant="subtitle1"
              data-testid="repertoires-title"
              sx={{ fontWeight: 700, lineHeight: 1.3 }}
              noWrap
            >
              {current === null
                ? t("repertoires.title")
                : current.name || t("repertoires.untitled")}
            </Typography>
            <Typography
              data-testid="repertoires-count"
              variant="caption"
              sx={{ display: "block", color: "text.secondary" }}
            >
              {current === null
                ? t("repertoires.count", { count: repertoires.length })
                : t("repertoires.folder.count", { count: visible.length })}
            </Typography>
          </Box>

          {current === null ? (
            <Button
              size="small"
              variant="outlined"
              startIcon={<CreateNewFolderRoundedIcon fontSize="small" />}
              onClick={() => setNaming({ folder: null })}
              data-testid="repertoires-new-folder"
            >
              {t("repertoires.folder.new")}
            </Button>
          ) : (
            <>
              <Tooltip title={t("repertoires.folder.rename")}>
                <IconButton
                  size="small"
                  onClick={() => setNaming({ folder: current })}
                  aria-label={t("repertoires.folder.rename")}
                  data-testid="repertoires-folder-rename"
                >
                  <DriveFileRenameOutlineRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title={t("repertoires.folder.delete")}>
                <IconButton
                  size="small"
                  onClick={() => askDelete(current)}
                  aria-label={t("repertoires.folder.delete")}
                  data-testid="repertoires-folder-delete"
                >
                  <DeleteOutlineRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          )}

          <Button
            size="small"
            variant="outlined"
            component={RouterLink}
            to="/repertoires/new"
            startIcon={<AddRoundedIcon fontSize="small" />}
            data-testid="repertoires-add"
          >
            {t("repertoires.add")}
          </Button>

          {visible.length > 0 && (
            <SavedListExportBar
              testIdPrefix="repertoires"
              labelKey="repertoires"
              checked={selected.length === visible.length}
              indeterminate={selected.length > 0 && selected.length < visible.length}
              onToggleAll={toggleAll}
              selectedCount={selected.length}
              onClearSelected={() => setPicked(new Set())}
              onDownload={() =>
                downloadPgn(
                  "chess-trainer-repertoires",
                  selected.map((saved) => saved.pgn),
                )
              }
              onDelete={() => {
                setAskedCount(selected.length);
                setDeletingPicked(true);
              }}
            />
          )}

          <SavedListViewToggle
            value={view}
            onChange={setView}
            labelKey="repertoires"
            testIdPrefix="repertoires"
          />
        </Box>

        {nothingHere ? (
          <Box data-testid="repertoires-body" sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            <Typography
              data-testid="repertoires-empty"
              variant="body2"
              sx={{ color: "text.secondary", textAlign: "center", py: 4 }}
            >
              {t(current === null ? "repertoires.empty" : "repertoires.folder.empty")}
            </Typography>
          </Box>
        ) : view === "list" ? (
          <Box
            data-testid="repertoires-body"
            sx={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}
          >
            <List disablePadding>
              {shownFolders.map((folder) => (
                <RepertoireFolderRow key={folder.id} {...folderViewProps(folder)} />
              ))}
              {visible.map((saved) => (
                <RepertoireRow
                  key={saved.id}
                  saved={saved}
                  checked={picked.has(saved.id)}
                  onToggle={() => togglePicked(saved.id)}
                />
              ))}
            </List>
          </Box>
        ) : (
          <Box data-testid="repertoires-grid" sx={savedListGridSx(view)}>
            {shownFolders.map((folder) => (
              <RepertoireFolderCard key={folder.id} {...folderViewProps(folder)} />
            ))}
            {visible.map((saved) => (
              <RepertoireCard
                key={saved.id}
                saved={saved}
                checked={picked.has(saved.id)}
                onToggle={() => togglePicked(saved.id)}
              />
            ))}
          </Box>
        )}
      </Box>

      <RepertoireFolderNameDialog
        open={naming !== null}
        title={t(naming?.folder ? "repertoires.folder.rename" : "repertoires.folder.newTitle")}
        initial={naming?.folder?.name ?? ""}
        onSave={saveName}
        onClose={() => setNaming(null)}
      />
      <RepertoireFolderDeleteDialog
        folder={deleting}
        count={deleting === null ? 0 : countIn(deleting.id)}
        onConfirm={() => deleting !== null && deleteFolder(deleting)}
        onClose={() => setDeleting(null)}
      />
      <RepertoireBulkDeleteDialog
        open={deletingPicked}
        count={askedCount}
        onConfirm={deletePicked}
        onClose={() => setDeletingPicked(false)}
      />

      <RightPanel>
        <Box sx={{ color: "text.secondary" }}>
          <Typography variant="body2" sx={{ mb: 1 }}>
            {t("repertoires.hint")}
          </Typography>
          <Typography variant="body2" data-testid="repertoires-storage-note">
            {t("repertoires.storage")}
          </Typography>
        </Box>
      </RightPanel>
    </>
  );
}

export default Repertoires;
