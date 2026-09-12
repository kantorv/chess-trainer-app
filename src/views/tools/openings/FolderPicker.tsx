import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import FolderRoundedIcon from "@mui/icons-material/FolderRounded";
import FolderOffRoundedIcon from "@mui/icons-material/FolderOffRounded";
import { useTranslation } from "react-i18next";
import {
  flattenOpeningFolders,
  type OpeningFolder,
} from "../../../lib/savedOpeningFolders";

/**
 * A folder tree as one selectable list — the picker both folder-choosing
 * dialogs render. Presentational only: the callers own what a selection means
 * and where a save goes, and the two of them differ in exactly the prop that
 * says so.
 *
 * - The save dialog's picker takes `value === undefined` for "no choice" — no
 *   row selected, the state a dialog opens on — and shows **Unfiled** as the
 *   "none" choice ({@link SavedOpening.folderId}'s `null`).
 * - The move dialog's picker always has a selection and excludes the folder's
 *   own subtree ({@link FolderPicker.exclude}) — a folder cannot be moved into
 *   itself — and shows **Top level** as the "none" choice.
 *
 * The tree is flattened rather than collapsible: every folder, parents before
 * children, indented by depth. A collapsible tree would hide a folder a reader
 * means to pick into; an indented list of every folder is always complete, and
 * the depth indent (`paddingInlineStart`, which mirrors under Hebrew) is what
 * says where each one nests.
 */
function FolderPicker({
  folders,
  value,
  onChange,
  noneLabel,
  noneTestId,
  exclude,
}: {
  /** Every folder in the reader's tree, as the store holds them. */
  folders: readonly OpeningFolder[];
  /** The selected folder id, `null` for the "none" choice, `undefined` for no choice at all. */
  value: string | null | undefined;
  onChange: (folderId: string | null) => void;
  /** The "none" row's label — "Unfiled" when saving, "Top level" when moving. */
  noneLabel: string;
  noneTestId: string;
  /** Folder ids not offered — the moved folder's own subtree, when moving one. */
  exclude?: readonly string[];
}) {
  const { t } = useTranslation();

  const hidden = exclude === undefined ? undefined : new Set(exclude);
  const rows = flattenOpeningFolders(folders).filter(
    (row) => hidden === undefined || !hidden.has(row.folder.id),
  );

  return (
    <List dense disablePadding data-testid="opening-folder-picker">
      <ListItemButton
        selected={value === null}
        onClick={() => onChange(null)}
        data-testid={noneTestId}
        sx={{ borderRadius: 0.5 }}
      >
        <FolderOffRoundedIcon fontSize="small" sx={{ mr: 1.5, color: "text.secondary" }} />
        <ListItemText primary={noneLabel} />
      </ListItemButton>
      {rows.map(({ folder, depth }) => (
        <ListItemButton
          key={folder.id}
          selected={value === folder.id}
          onClick={() => onChange(folder.id)}
          data-testid={`opening-folder-picker-${folder.id}`}
          sx={{ borderRadius: 0.5, paddingInlineStart: 2 + depth * 2.5 }}
        >
          <FolderRoundedIcon
            fontSize="small"
            sx={{ mr: 1.5, color: "text.secondary", flexShrink: 0 }}
          />
          <ListItemText
            primary={folder.name === "" ? t("savedOpenings.untitled") : folder.name}
            slotProps={{ primary: { noWrap: true } }}
          />
        </ListItemButton>
      ))}
    </List>
  );
}

export default FolderPicker;
