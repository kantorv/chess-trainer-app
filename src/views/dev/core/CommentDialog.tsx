import { useState } from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import TextField from "@mui/material/TextField";
import { useTranslation } from "react-i18next";

/** What a comment dialog is open on: the move, and the text it starts with. */
export type CommentDraft = {
  /** The move as the list prints it — `"9. O-O"` — or the start position. */
  label: string;
  /** `""` to add a comment; the stored text to edit one. */
  initial: string;
  /** Where the text goes once saved — the caller's tree edit. */
  onSave: (text: string) => void;
};

/**
 * **Add or edit one comment** (CTA-69) — the variations explorer's, opened
 * from the move menu's *Add comment* and from the player's comment block.
 *
 * The text is the stored comment as it is, `[%eval 0.3]`-style commands
 * included, so editing one never rewrites what it did not touch; saving an
 * empty text is the caller's delete (`setComments` drops it). Presentational:
 * the caller turns the text into a tree edit, which lands through the core's
 * `replaceTree` like every other edit — so it is a session change the Save
 * strip offers to keep, and Discard takes it back.
 *
 * Mounted only while open (`draft !== null`), so each opening starts from
 * its own `initial` without an effect to reset the field.
 */
function CommentDialog({
  draft,
  onClose,
}: {
  draft: CommentDraft | null;
  onClose: () => void;
}) {
  return draft === null ? null : <OpenCommentDialog draft={draft} onClose={onClose} />;
}

function OpenCommentDialog({ draft, onClose }: { draft: CommentDraft; onClose: () => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState(draft.initial);
  const adding = draft.initial === "";
  const save = () => {
    draft.onSave(text);
    onClose();
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" data-testid="comment-dialog">
      <DialogTitle>
        {t(adding ? "commentDialog.addTitle" : "commentDialog.editTitle")}{" "}
        <span dir="ltr">{draft.label}</span>
      </DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          multiline
          minRows={3}
          maxRows={12}
          fullWidth
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            // Ctrl/⌘+Enter saves; a plain Enter is a new line in the comment.
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) save();
          }}
          placeholder={t("commentDialog.placeholder")}
          helperText={t("commentDialog.help")}
          slotProps={{ htmlInput: { "data-testid": "comment-dialog-text", dir: "auto" } }}
          sx={{ mt: 0.5 }}
        />
      </DialogContent>
      <DialogActions>
        <Button data-testid="comment-dialog-cancel" onClick={onClose}>
          {t("commentDialog.cancel")}
        </Button>
        <Button
          variant="contained"
          data-testid="comment-dialog-save"
          // Adding nothing is not a change; emptying an existing one deletes it.
          disabled={adding && text.trim() === ""}
          onClick={save}
        >
          {t("commentDialog.save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default CommentDialog;
