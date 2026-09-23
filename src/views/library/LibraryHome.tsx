import { useMemo, useState, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import CreateNewFolderRoundedIcon from "@mui/icons-material/CreateNewFolderRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import DriveFileMoveRoundedIcon from "@mui/icons-material/DriveFileMoveRounded";
import DriveFileRenameOutlineRoundedIcon from "@mui/icons-material/DriveFileRenameOutlineRounded";
import FolderRoundedIcon from "@mui/icons-material/FolderRounded";
import FolderSpecialRoundedIcon from "@mui/icons-material/FolderSpecialRounded";
import TableChartOutlinedIcon from "@mui/icons-material/TableChartOutlined";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import { Link as RouterLink, useNavigate, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";

import { folderTreeRows, type FolderTreeRow } from "../../lib/folderTreeRows";
import { moveCollection, removeCollection } from "../../lib/libraryCollectionStore";
import type { CollectionSummary } from "../../lib/libraryCollections";
import {
  BUILT_IN_FOLDER_ID,
  createLibraryFolder,
  moveLibraryFolder,
  removeLibraryFolder,
  renameLibraryFolder,
} from "../../lib/libraryFolderStore";
import { downloadPgn } from "../../lib/pgnExport";
import { slugify } from "../../lib/pgnText";
import { gameFolderChildren, gamesInFolder, type GameFolder } from "../../lib/savedGameFolders";
import { shippedCollections } from "../../lib/shippedCollections";
import FolderDeleteDialog from "../shared/folders/FolderDeleteDialog";
import FolderMoveDialog from "../shared/folders/FolderMoveDialog";
import FolderNameDialog from "../shared/folders/FolderNameDialog";
import FolderPicker from "../shared/folders/FolderPicker";
import FolderTreeTable, { type FolderTreeColumn } from "../shared/folders/FolderTreeTable";
import { RightPanel } from "../main/rightPanel";
import { loadCollectionGames, useLibraryFolders, useUploadedCollections } from "./useLibraryCollections";

/**
 * **The Library** (`/library`, CTA-75; folders CTA-88) — a file manager's
 * details view of the collections: a table of folders and collections, the
 * folders opening and closing in place (`FolderTreeTable`, rows from
 * `lib/folderTreeRows.ts`).
 *
 * - **Built-in** is a fixed top-level folder, always first and open at the
 *   start, holding the shipped collections (wired by `scripts/wirepgn.js`).
 *   It is read-only: nothing is filed in it, and it is not renamed, moved or
 *   deleted. Its collections only download.
 * - **The reader's folders** (`lib/libraryFolderStore.ts`) nest to any depth,
 *   and hold the reader's uploads; an upload whose folder is gone sits at the
 *   top level. Deleting a folder keeps what is in it: its sub-folders and
 *   collections move up to its parent.
 * - **Columns**: Name, Games (a folder's is its whole subtree's), Added (an
 *   upload's date; a folder's creation; a dash for Built-in), and the row's
 *   actions, shown on hover and focus. Name, Games and Added sort (`?sort=`,
 *   `?dir=`, history replace, only what is not the default — Name, A to Z);
 *   folders always come before collections at every level.
 * - **A words box** (`?q=`, history replace) keeps the collections and
 *   folders whose name holds it, with the folders above them opened.
 *
 * **Listing fetches nothing.** A shipped collection's name and game count are
 * its manifest entry (`src/data/library/manifest.json`); an upload's are its
 * small IndexedDB summary — no index and no game is read to draw this page.
 * The games are read only when a download asks for them.
 */

/** A collection as the tree files it: its folder resolved. */
type Entry = CollectionSummary & { folderId: string | null };

type SortColumn = "name" | "games" | "added";
type Direction = "asc" | "desc";
const SORT_COLUMNS: readonly SortColumn[] = ["name", "games", "added"];
const DEFAULT_SORT: SortColumn = "name";
/** Which way a column sorts until the reader turns it: names A to Z, counts and dates high first. */
const defaultDirection = (column: SortColumn): Direction => (column === "name" ? "asc" : "desc");

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** A comparator on one key, missing values last either way, ties to `tie`. */
const byKey =
  <T,>(key: (value: T) => string | number | undefined, direction: Direction, tie: (a: T, b: T) => number) =>
  (a: T, b: T): number => {
    const x = key(a);
    const y = key(b);
    if (x === undefined || y === undefined) return x === y ? tie(a, b) : x === undefined ? 1 : -1;
    const order = typeof x === "number" && typeof y === "number" ? x - y : collator.compare(String(x), String(y));
    return (direction === "asc" ? order : -order) || tie(a, b);
  };

/** A collection's download stem — its name as a file name. */
const stemOf = (name: string, fallback: string) => slugify(name) || fallback;

function Action({
  label,
  testId,
  onClick,
  to,
  children,
}: {
  label: string;
  testId: string;
  onClick?: () => void;
  to?: string;
  children: ReactNode;
}) {
  return (
    <Tooltip title={label}>
      {to === undefined ? (
        <IconButton size="small" aria-label={label} data-testid={testId} onClick={onClick}>
          {children}
        </IconButton>
      ) : (
        <IconButton size="small" aria-label={label} data-testid={testId} component={RouterLink} to={to}>
          {children}
        </IconButton>
      )}
    </Tooltip>
  );
}

/** Move to… for a collection: the shared folder picker, the top level its "none". */
function CollectionMoveDialog({
  collection,
  folders,
  onMove,
  onClose,
}: {
  collection: Entry | null;
  folders: readonly GameFolder[];
  onMove: (folderId: string | null) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={collection !== null} onClose={onClose} fullWidth maxWidth="xs" data-testid="library-collection-move-dialog">
      <DialogTitle>{t("library.folder.moveCollection")}</DialogTitle>
      <DialogContent>
        <FolderPicker
          labelKey="library"
          idPrefix="library-folder"
          folders={folders}
          value={collection?.folderId ?? null}
          onChange={onMove}
          noneLabel={t("library.folder.topLevel")}
          noneTestId="library-collection-move-top"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} data-testid="library-collection-move-cancel">
          {t("library.folder.cancel")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function LibraryHome() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const uploaded = useUploadedCollections();
  const readerFolders = useLibraryFolders();
  // The uploads are placed once both reads have landed, so none flashes at the top level.
  const ready = uploaded !== undefined && readerFolders !== undefined;
  const folders = useMemo(() => readerFolders ?? [], [readerFolders]);

  const builtIn = useMemo<GameFolder>(
    () => ({ id: BUILT_IN_FOLDER_ID, name: t("library.builtIn"), parentId: null, savedAt: "", updatedAt: "" }),
    [t],
  );
  const allFolders = useMemo(() => [builtIn, ...folders], [builtIn, folders]);
  const entries = useMemo<Entry[]>(() => {
    const known = new Set(folders.map((folder) => folder.id));
    return [
      ...shippedCollections.map((entry) => ({ ...entry, folderId: BUILT_IN_FOLDER_ID })),
      ...(ready ? uploaded : []).map((collection) => ({
        ...collection,
        folderId: collection.folderId != null && known.has(collection.folderId) ? collection.folderId : null,
      })),
    ];
  }, [folders, ready, uploaded]);
  const total = shippedCollections.length + (uploaded?.length ?? 0);

  const [params, setParams] = useSearchParams();
  const text = params.get("q") ?? "";
  const needle = text.trim().toLocaleLowerCase();
  const requestedSort = params.get("sort");
  const sort: SortColumn = SORT_COLUMNS.includes(requestedSort as SortColumn)
    ? (requestedSort as SortColumn)
    : DEFAULT_SORT;
  const requestedDirection = params.get("dir");
  const direction: Direction =
    requestedDirection === "asc" || requestedDirection === "desc" ? requestedDirection : defaultDirection(sort);

  const setState = (patch: Record<string, string | null>) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(patch)) {
          if (value === null || value === "") next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );
  /** A new column opens its own way; a second click turns it. The URL keeps only what is not the default. */
  const sortBy = (column: string) => {
    const chosen = column as SortColumn;
    if (chosen !== sort) {
      setState({ sort: chosen === DEFAULT_SORT ? null : chosen, dir: null });
      return;
    }
    const turned: Direction = direction === "asc" ? "desc" : "asc";
    setState({ dir: turned === defaultDirection(chosen) ? null : turned });
  };

  /** The folders the reader opened. Built-in starts open. */
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set([BUILT_IN_FOLDER_ID]));
  /**
   * While filtering, the folders the reader turned against what the filter
   * opened — forgotten when the words change (adjusted during render).
   */
  const [filterTurns, setFilterTurns] = useState<{ needle: string; turned: ReadonlySet<string> }>({
    needle,
    turned: new Set(),
  });
  if (filterTurns.needle !== needle) setFilterTurns({ needle, turned: new Set() });
  const flip = (set: ReadonlySet<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };
  const toggle = (id: string) => {
    if (needle === "") setOpen((current) => flip(current, id));
    else setFilterTurns((current) => ({ ...current, turned: flip(current.turned, id) }));
  };

  const folderLabel = (folder: GameFolder) => (folder.name === "" ? t("library.folder.untitled") : folder.name);

  const turned = filterTurns.turned;
  const { rows, shownItems } = useMemo(() => {
    const sizeOfFolder = new Map<string, number>();
    for (const folder of allFolders) {
      sizeOfFolder.set(
        folder.id,
        gamesInFolder(entries, allFolders, folder.id).reduce((sum, entry) => sum + entry.count, 0),
      );
    }
    const nameTie = (a: { name: string; id: string }, b: { name: string; id: string }) =>
      collator.compare(a.name, b.name) || a.id.localeCompare(b.id);
    const compareFolders =
      sort === "name"
        ? byKey<GameFolder>((folder) => folder.name, direction, (a, b) => a.id.localeCompare(b.id))
        : sort === "games"
          ? byKey<GameFolder>((folder) => sizeOfFolder.get(folder.id), direction, nameTie)
          : byKey<GameFolder>((folder) => folder.savedAt || undefined, direction, nameTie);
    const compareItems =
      sort === "name"
        ? byKey<Entry>((entry) => entry.name, direction, (a, b) => a.id.localeCompare(b.id))
        : sort === "games"
          ? byKey<Entry>((entry) => entry.count, direction, nameTie)
          : byKey<Entry>((entry) => entry.addedAt, direction, nameTie);
    const matches = (name: string) => name.toLocaleLowerCase().includes(needle);
    return folderTreeRows<Entry>({
      folders: allFolders,
      items: entries,
      isOpen: (id, auto) => (needle === "" ? open.has(id) : auto !== turned.has(id)),
      compareFolders,
      compareItems,
      sizeOf: (entry) => entry.count,
      pinned: [BUILT_IN_FOLDER_ID],
      match:
        needle === ""
          ? undefined
          : { folder: (folder) => matches(folder.name), item: (entry) => matches(entry.name) },
    });
  }, [allFolders, entries, sort, direction, needle, open, turned]);

  const [naming, setNaming] = useState<{ parentId: string | null } | { folder: GameFolder } | null>(null);
  const [movingFolder, setMovingFolder] = useState<GameFolder | null>(null);
  const [movingCollection, setMovingCollection] = useState<Entry | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<GameFolder | null>(null);
  const [deleting, setDeleting] = useState<CollectionSummary | null>(null);

  const collectionsUnder = (folder: GameFolder) => gamesInFolder(entries, allFolders, folder.id);

  const download = async (collection: CollectionSummary) => {
    const games = await loadCollectionGames(collection);
    if (games !== null) downloadPgn(stemOf(collection.name, "collection"), games);
  };

  /** A folder's whole subtree as one `.pgn`, its collections by name. */
  const downloadFolder = async (folder: GameFolder) => {
    const inside = [...collectionsUnder(folder)].sort((a, b) => collator.compare(a.name, b.name));
    const games: string[] = [];
    for (const collection of inside) {
      const read = await loadCollectionGames(collection);
      // A loop, not a spread: a folder can hold tens of thousands of games.
      if (read !== null) for (const game of read) games.push(game);
    }
    if (games.length > 0) downloadPgn(stemOf(folderLabel(folder), "folder"), games);
  };

  /** An empty folder goes at once; one holding anything asks first, saying its contents stay. */
  const startDeleteFolder = (row: FolderTreeRow<Entry> & { kind: "folder" }) => {
    if (row.empty) void removeLibraryFolder(row.folder.id);
    else setDeletingFolder(row.folder);
  };

  const dateFormat = useMemo(() => new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }), [i18n.language]);
  const dateOf = (iso: string | undefined) => {
    if (iso === undefined || iso === "") return "—";
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? "—" : dateFormat.format(date);
  };

  const columns: FolderTreeColumn<Entry>[] = [
    {
      id: "games",
      label: t("library.columns.games"),
      sortable: true,
      align: "right",
      render: (row) => (row.kind === "folder" ? row.size : row.item.count).toLocaleString(i18n.language),
    },
    {
      id: "added",
      label: t("library.columns.added"),
      sortable: true,
      render: (row) => dateOf(row.kind === "folder" ? row.folder.savedAt : row.item.addedAt),
    },
  ];

  const actionsOf = (row: FolderTreeRow<Entry>) => {
    if (row.kind === "folder") {
      const { folder } = row;
      const own = folder.id !== BUILT_IN_FOLDER_ID;
      return (
        <Box data-testid={`library-folder-actions-${folder.id}`} sx={{ display: "flex", gap: 0.25 }}>
          {own && (
            <Action
              label={t("library.folder.uploadHere")}
              testId={`library-folder-upload-${folder.id}`}
              to={`/library/new?folder=${encodeURIComponent(folder.id)}`}
            >
              <UploadFileRoundedIcon fontSize="small" />
            </Action>
          )}
          {own && (
            <Action
              label={t("library.folder.newSubFolder")}
              testId={`library-folder-new-${folder.id}`}
              onClick={() => setNaming({ parentId: folder.id })}
            >
              <CreateNewFolderRoundedIcon fontSize="small" />
            </Action>
          )}
          <Action
            label={t("library.folder.download")}
            testId={`library-folder-download-${folder.id}`}
            onClick={() => void downloadFolder(folder)}
          >
            <DownloadRoundedIcon fontSize="small" />
          </Action>
          {own && (
            <Action
              label={t("library.folder.renameFolder")}
              testId={`library-folder-rename-${folder.id}`}
              onClick={() => setNaming({ folder })}
            >
              <DriveFileRenameOutlineRoundedIcon fontSize="small" />
            </Action>
          )}
          {own && (
            <Action
              label={t("library.folder.moveTo")}
              testId={`library-folder-move-${folder.id}`}
              onClick={() => setMovingFolder(folder)}
            >
              <DriveFileMoveRoundedIcon fontSize="small" />
            </Action>
          )}
          {own && (
            <Action
              label={t("library.folder.deleteFolder")}
              testId={`library-folder-delete-${folder.id}`}
              onClick={() => startDeleteFolder(row)}
            >
              <DeleteOutlineRoundedIcon fontSize="small" />
            </Action>
          )}
        </Box>
      );
    }
    const { item } = row;
    const own = item.source === "uploaded";
    return (
      <Box data-testid={`library-collection-actions-${item.id}`} sx={{ display: "flex", gap: 0.25 }}>
        <Action
          label={t("library.download")}
          testId={`library-collection-download-${item.id}`}
          onClick={() => void download(item)}
        >
          <DownloadRoundedIcon fontSize="small" />
        </Action>
        {own && (
          <Action
            label={t("library.folder.moveTo")}
            testId={`library-collection-move-${item.id}`}
            onClick={() => setMovingCollection(item)}
          >
            <DriveFileMoveRoundedIcon fontSize="small" />
          </Action>
        )}
        {own && (
          <Action
            label={t("library.delete")}
            testId={`library-collection-delete-${item.id}`}
            onClick={() => setDeleting(item)}
          >
            <DeleteOutlineRoundedIcon fontSize="small" />
          </Action>
        )}
      </Box>
    );
  };

  const setText = (value: string) => setState({ q: value });
  const hrefOf = (collection: Entry) => `/library/${encodeURIComponent(collection.id)}`;

  return (
    <>
      <Box
        data-testid="library-screen"
        sx={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}
      >
        <Box
          sx={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 1,
            pb: 1.5,
            mb: 0.5,
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" component="h1" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
              {t("library.title")}
            </Typography>
            <Typography
              data-testid="library-count"
              variant="caption"
              sx={{ display: "block", color: "text.secondary" }}
            >
              {needle === ""
                ? t("library.count", { count: total })
                : t("library.shown", { shown: shownItems, count: total })}
            </Typography>
          </Box>
          <Button
            size="small"
            variant="outlined"
            startIcon={<CreateNewFolderRoundedIcon />}
            onClick={() => setNaming({ parentId: null })}
            disabled={readerFolders === undefined}
            data-testid="library-new-folder"
          >
            {t("library.folder.newFolder")}
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<UploadFileRoundedIcon />}
            component={RouterLink}
            to="/library/new"
            data-testid="library-add"
          >
            {t("library.add")}
          </Button>
        </Box>
        <Box sx={{ flexShrink: 0, display: "flex", py: 1 }}>
          <TextField
            size="small"
            label={t("library.filter")}
            value={text}
            onChange={(event) => setText(event.target.value)}
            slotProps={{ htmlInput: { "data-testid": "library-filter" } }}
            sx={{ flex: 1 }}
          />
        </Box>
        {/* The one region that scrolls: the shell scrolls nothing in the square. */}
        <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <FolderTreeTable<Entry>
            testId="library-collections"
            rows={rows}
            nameLabel={t("library.columns.name")}
            columns={columns}
            actionsLabel={t("library.columns.actions")}
            sort={sort}
            direction={direction}
            onSort={sortBy}
            folderName={folderLabel}
            itemName={(entry) => entry.name}
            hrefOf={hrefOf}
            onOpenItem={(entry) => navigate(hrefOf(entry))}
            onToggle={toggle}
            toggleLabel={(folder, isOpen) =>
              t(isOpen ? "library.folder.collapse" : "library.folder.expand", { name: folderLabel(folder) })
            }
            actionsOf={actionsOf}
            rowTestId={(row) =>
              row.kind === "folder" ? `library-folder-${row.folder.id}` : `library-row-${row.item.id}`
            }
            linkTestId={(entry) => `library-collection-${entry.id}`}
            folderIcon={(folder) =>
              folder.id === BUILT_IN_FOLDER_ID ? (
                <FolderSpecialRoundedIcon fontSize="small" color="primary" />
              ) : (
                <FolderRoundedIcon fontSize="small" />
              )
            }
            itemIcon={() => <TableChartOutlinedIcon fontSize="small" />}
          />
          {rows.length === 0 && (
            <Typography
              data-testid="library-no-matches"
              variant="body2"
              sx={{ color: "text.secondary", textAlign: "center", py: 4 }}
            >
              {t("library.noMatches")}
            </Typography>
          )}
        </Box>
      </Box>
      <RightPanel>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {t("library.hint")}
        </Typography>
      </RightPanel>
      <FolderNameDialog
        labelKey="library"
        idPrefix="library-folder"
        open={naming !== null}
        title={t(naming !== null && "folder" in naming ? "library.folder.renameFolder" : "library.folder.newFolder")}
        initial={naming !== null && "folder" in naming ? naming.folder.name : ""}
        onSave={(name) => {
          if (naming === null) return;
          if ("folder" in naming) {
            void renameLibraryFolder(naming.folder.id, name);
            return;
          }
          const { parentId } = naming;
          void createLibraryFolder(name, parentId).then((made) => {
            // Open the parent, so the new folder is in view.
            if (made !== undefined && parentId !== null) setOpen((current) => new Set(current).add(parentId));
          });
        }}
        onClose={() => setNaming(null)}
      />
      <FolderMoveDialog
        labelKey="library"
        idPrefix="library-folder"
        open={movingFolder !== null}
        folders={folders}
        folder={movingFolder}
        currentParentName={t("library.folder.topLevel")}
        onMove={(parentId) => {
          if (movingFolder !== null) void moveLibraryFolder(movingFolder.id, parentId);
          setMovingFolder(null);
        }}
        onClose={() => setMovingFolder(null)}
      />
      <CollectionMoveDialog
        collection={movingCollection}
        folders={folders}
        onMove={(folderId) => {
          if (movingCollection !== null) void moveCollection(movingCollection.id, folderId);
          setMovingCollection(null);
        }}
        onClose={() => setMovingCollection(null)}
      />
      <FolderDeleteDialog
        labelKey="library"
        idPrefix="library-folder"
        open={deletingFolder !== null}
        folder={deletingFolder}
        games={deletingFolder === null ? 0 : collectionsUnder(deletingFolder).length}
        subFolders={deletingFolder === null ? 0 : gameFolderChildren(folders, deletingFolder.id).length}
        onConfirm={() => {
          if (deletingFolder !== null) void removeLibraryFolder(deletingFolder.id);
        }}
        onClose={() => setDeletingFolder(null)}
      />
      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        data-testid="library-delete-dialog"
      >
        {deleting !== null && (
          <>
            <DialogTitle>{t("library.confirmDelete.title", { name: deleting.name })}</DialogTitle>
            <DialogContent>
              <DialogContentText>
                {t("library.confirmDelete.body", { count: deleting.count })}
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDeleting(null)}>{t("library.confirmDelete.cancel")}</Button>
              <Button
                color="error"
                data-testid="library-delete-confirm"
                onClick={async () => {
                  await removeCollection(deleting.id);
                  setDeleting(null);
                }}
              >
                {t("library.confirmDelete.confirm")}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </>
  );
}

export default LibraryHome;
