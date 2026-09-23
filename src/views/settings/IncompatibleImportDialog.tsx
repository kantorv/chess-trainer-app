import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import { Link as RouterLink } from "react-router";
import { useTranslation } from "react-i18next";

import type { ImportProblem } from "../../lib/dataImport";

/**
 * **A zip that cannot be imported** (CTA-89) — not a zip, no manifest or a
 * malformed one, someone else's format, a newer version, a file the manifest
 * names missing or not matching it. Says which, and that its PGN files can
 * still come in by hand — each category through the screen that uploads it —
 * listing the `.pgn` files the zip holds. Nothing was written.
 */

type Props = {
  fileName: string;
  problem: ImportProblem;
  pgnFiles: readonly string[];
  onClose: () => void;
};

/** Where each kind of PGN is brought in by hand. */
const MANUAL_ROUTES = [
  { key: "collections", to: "/library/new" },
  { key: "analyses", to: "/tools/analysis" },
  { key: "repertoires", to: "/repertoires/new" },
] as const;

function IncompatibleImportDialog({ fileName, problem, pgnFiles, onClose }: Props) {
  const { t } = useTranslation();
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" data-testid="settings-import-incompatible">
      <DialogTitle>{t("settings.import.incompatible.title")}</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        <DialogContentText data-testid="settings-import-incompatible-problem">
          {t(`settings.import.incompatible.problem.${problem.kind}`, {
            fileName,
            path: "path" in problem ? problem.path : "",
            version: "version" in problem ? problem.version : "",
          })}
        </DialogContentText>
        <Box>
          <Typography variant="body2">{t("settings.import.incompatible.advice")}</Typography>
          <Box component="ul" sx={{ my: 0.5, paddingInlineStart: 3 }}>
            {MANUAL_ROUTES.map(({ key, to }) => (
              <li key={key}>
                <Link component={RouterLink} to={to} variant="body2" data-testid={`settings-import-incompatible-${key}`}>
                  {t(`settings.import.incompatible.${key}`)}
                </Link>
              </li>
            ))}
          </Box>
        </Box>
        <Box data-testid="settings-import-incompatible-files">
          {pgnFiles.length === 0 ? (
            <Typography variant="body2">{t("settings.import.incompatible.noFiles")}</Typography>
          ) : (
            <>
              <Typography variant="body2">{t("settings.import.incompatible.files")}</Typography>
              <Box component="ul" sx={{ my: 0.5, paddingInlineStart: 3 }}>
                {pgnFiles.map((path) => (
                  <li key={path}>
                    {/* A path is a token: it reads left to right in every language. */}
                    <Typography variant="body2" component="span" dir="ltr" sx={{ fontFamily: "monospace" }}>
                      {path}
                    </Typography>
                  </li>
                ))}
              </Box>
            </>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} data-testid="settings-import-incompatible-close">
          {t("settings.import.incompatible.close")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default IncompatibleImportDialog;
