import { useTranslation } from "react-i18next";

import type { SavedOpening } from "../../../../lib/savedOpenings";
import { updateSavedOpeningNote } from "../../../../lib/savedOpeningStore";
import {
  openingFolderChildren,
  openingsUnderFolder,
  type OpeningFolder,
} from "../../../../lib/savedOpeningFolders";
import {
  createOpeningFolder,
  moveOpeningFolder,
  renameOpeningFolder,
} from "../../../../lib/savedOpeningFolderStore";
import NoteDialog from "../NoteDialog";
import FolderNameDialog from "./FolderNameDialog";
import FolderMoveDialog from "./FolderMoveDialog";
import FolderDeleteDialog from "./FolderDeleteDialog";

/**
 * What the name dialog is open for: creating under a parent, or renaming.
 * `null` is closed. Held by the screen (its "New folder" button opens it);
 * rendered here.
 */
export type NameDialogState =
  | { mode: "create"; parentId: string | null }
  | { mode: "rename"; folder: OpeningFolder }
  | null;

/** What the note dialog is editing: the record's id and its note as opened. */
export type EditingState = { id: string; note: string } | null;

/**
 * The Saved openings screen's whole dialog stack — the four dialogs and their
 * wiring, rendered from the state the screen holds. The three folder dialogs
 * speak the folder store directly (create, rename, move); the delete runs
 * through the caller's `onDeleteFolder`, which decides whether a confirmation
 * is needed before the store's `removeOpeningFolder` is the operation; the
 * note dialog edits through the note store's write, which keeps the record's
 * place in the list.
 */
function SavedOpeningsDialogs({
  folders,
  openings,
  nameDialog,
  setNameDialog,
  moving,
  setMoving,
  deleting,
  setDeleting,
  editing,
  setEditing,
  onDeleteFolder,
}: {
  folders: readonly OpeningFolder[];
  openings: readonly SavedOpening[];
  nameDialog: NameDialogState;
  setNameDialog: (next: NameDialogState) => void;
  moving: OpeningFolder | null;
  setMoving: (next: OpeningFolder | null) => void;
  deleting: OpeningFolder | null;
  setDeleting: (next: OpeningFolder | null) => void;
  editing: EditingState;
  setEditing: (next: EditingState) => void;
  /** Delete one folder, keeping its contents — the screen's wording decider. */
  onDeleteFolder: (folder: OpeningFolder) => void;
}) {
  const { t } = useTranslation();

  return (
    <>
      <FolderNameDialog
        open={nameDialog !== null}
        title={
          nameDialog === null
            ? ""
            : nameDialog.mode === "create"
              ? t("savedOpenings.folder.newFolder")
              : t("savedOpenings.folder.renameFolder")
        }
        initial={
          nameDialog !== null && nameDialog.mode === "rename"
            ? nameDialog.folder.name
            : ""
        }
        onSave={(name) => {
          if (nameDialog === null) return;
          if (nameDialog.mode === "create") {
            createOpeningFolder(name, nameDialog.parentId);
          } else {
            renameOpeningFolder(nameDialog.folder.id, name);
          }
        }}
        onClose={() => setNameDialog(null)}
      />

      <FolderMoveDialog
        open={moving !== null}
        folders={folders}
        folder={moving}
        currentParentName={t("savedOpenings.folder.topLevel")}
        onMove={(newParentId) => {
          if (moving !== null) moveOpeningFolder(moving.id, newParentId);
          setMoving(null);
        }}
        onClose={() => setMoving(null)}
      />

      <FolderDeleteDialog
        open={deleting !== null}
        folder={deleting}
        openings={
          deleting === null
            ? 0
            : openingsUnderFolder(openings, folders, deleting.id)
        }
        subFolders={
          deleting === null
            ? 0
            : openingFolderChildren(folders, deleting.id).length
        }
        onConfirm={() => {
          if (deleting !== null) onDeleteFolder(deleting);
        }}
        onClose={() => setDeleting(null)}
      />

      <NoteDialog
        open={editing !== null}
        title={t("savedOpenings.note.editTitle")}
        initial={editing?.note ?? ""}
        onSave={(note) => {
          if (editing !== null) updateSavedOpeningNote(editing.id, note);
          setEditing(null);
        }}
        onClose={() => setEditing(null)}
      />
    </>
  );
}

export default SavedOpeningsDialogs;
