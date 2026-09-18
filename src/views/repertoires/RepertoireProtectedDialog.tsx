import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import { Link as RouterLink } from "react-router";
import { useTranslation } from "react-i18next";

/**
 * **"This repertoire is protected"** (CTA-63) — what "Update repertoire" opens
 * instead of writing, on a repertoire whose settings protect it
 * (`RepertoireSettings.protected`, on by default). Two ways on: switch
 * protection off in its **settings** (leaving the board, so the session's
 * changes go — the dialog says so), or **save a copy** with the changes,
 * which is unprotected and opens where the reader was. Cancel keeps the
 * session as it is.
 */
function RepertoireProtectedDialog({
  open,
  testId,
  settingsPath,
  from,
  onCopy,
  onClose,
}: {
  open: boolean;
  testId: string;
  /** The repertoire's settings screen. */
  settingsPath: string;
  /** Where the settings screen's Save and Cancel come back to. */
  from: string;
  onCopy: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby={`${testId}-title`}
      data-testid={testId}
    >
      <DialogTitle id={`${testId}-title`}>{t("repertoires.changes.protected.title")}</DialogTitle>
      <DialogContent>
        <DialogContentText>{t("repertoires.changes.protected.body")}</DialogContentText>
      </DialogContent>
      <DialogActions sx={{ flexWrap: "wrap", gap: 1 }}>
        <Button onClick={onClose} data-testid={`${testId}-cancel`}>
          {t("repertoires.changes.protected.cancel")}
        </Button>
        <Button
          component={RouterLink}
          to={settingsPath}
          state={{ from }}
          variant="outlined"
          data-testid={`${testId}-settings`}
        >
          {t("repertoires.changes.protected.settings")}
        </Button>
        <Button
          onClick={onCopy}
          variant="contained"
          color="success"
          data-testid={`${testId}-copy`}
        >
          {t("repertoires.changes.copy")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default RepertoireProtectedDialog;
