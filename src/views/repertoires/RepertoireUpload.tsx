import { useEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import { Link as RouterLink, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";

import {
  checkRepertoirePgn,
  newSavedRepertoireId,
  savedRepertoireOf,
  type RepertoireProblem,
} from "../../lib/savedRepertoires";
import { saveRepertoire } from "../../lib/savedRepertoireStore";
import { RightPanel } from "../main/rightPanel";

/**
 * **Add a repertoire** (`/repertoires/new`) — a `.pgn` file picked, or PGN
 * pasted, and the reader taken straight to the board it opens on (CTA-61).
 *
 * ## One way in, whichever door
 *
 * The file's text and the pasted text go through **the same function**,
 * {@link bringIn}: the same check (`checkRepertoirePgn` — the uploads' size and
 * emptiness rules, then every line parsed as the board will parse it), the same
 * constructor (`savedRepertoireOf`, which never reads a file name) and the same
 * write. So a file and its pasted text are the same record, and
 * `RepertoireUpload.test.tsx` asserts it through this screen, not only below it.
 *
 * ## The read waits for a paint
 *
 * Checking the 9,000-node Nimzo-Indian example parses every move of it — about
 * a second of main thread. The work is put behind a `setTimeout(0)` so the
 * "Reading…" state is on screen first, rather than the button appearing to
 * have done nothing while the tab stalls.
 */

type Problem = RepertoireProblem | "storage";

function RepertoireUpload() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ kind: Problem; detail?: string } | null>(
    null,
  );

  const inputRef = useRef<HTMLInputElement>(null);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (pending.current !== null) clearTimeout(pending.current);
    },
    [],
  );

  /** The one route in, for a file and a paste alike. */
  const bringIn = (text: string) => {
    setBusy(true);
    setProblem(null);
    pending.current = setTimeout(() => {
      pending.current = null;
      const check = checkRepertoirePgn(text);
      if (!check.ok) {
        setBusy(false);
        setProblem({ kind: check.problem, detail: check.detail });
        return;
      }

      const record = savedRepertoireOf(
        newSavedRepertoireId(),
        text,
        name,
        check.previewFen,
      );
      if (saveRepertoire(record) !== undefined) {
        setBusy(false);
        setProblem({ kind: "storage" });
        return;
      }
      navigate(`/repertoires/${encodeURIComponent(record.id)}`);
    }, 0);
  };

  const onPicked = async (files: FileList | null) => {
    const file = files?.[0];
    // Cleared at once, so picking the same file again still fires a change.
    if (inputRef.current !== null) inputRef.current.value = "";
    if (file === undefined) return;
    bringIn(await file.text());
  };

  return (
    <>
      <Box
        data-testid="repertoire-upload-screen"
        sx={{
          height: "100%",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          gap: 2,
          overflowY: "auto",
        }}
      >
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            {t("repertoires.upload.title")}
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {t("repertoires.upload.intro")}
          </Typography>
        </Box>

        <TextField
          size="small"
          label={t("repertoires.upload.name")}
          helperText={t("repertoires.upload.nameHelp")}
          value={name}
          onChange={(event) => setName(event.target.value)}
          slotProps={{ htmlInput: { "data-testid": "repertoire-upload-name" } }}
        />

        <Box>
          {/*
            A label wrapping a hidden input — the file dialog opens only from a
            real `<input type="file">`, the Uploads screen's pattern.
          */}
          <Button
            component="label"
            variant="contained"
            disabled={busy}
            startIcon={<UploadFileRoundedIcon />}
            data-testid="repertoire-upload-pick"
          >
            {t("repertoires.upload.pick")}
            <input
              ref={inputRef}
              hidden
              type="file"
              accept=".pgn,application/x-chess-pgn,text/plain"
              data-testid="repertoire-upload-input"
              onChange={(event) => void onPicked(event.target.files)}
            />
          </Button>
        </Box>

        <TextField
          multiline
          minRows={6}
          maxRows={14}
          label={t("repertoires.upload.paste")}
          value={pasted}
          onChange={(event) => setPasted(event.target.value)}
          slotProps={{
            htmlInput: { "data-testid": "repertoire-upload-paste", dir: "ltr" },
          }}
        />

        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Button
            variant="outlined"
            disabled={busy || pasted.trim() === ""}
            onClick={() => bringIn(pasted)}
            data-testid="repertoire-upload-save"
          >
            {t("repertoires.upload.save")}
          </Button>
          {busy && (
            <Box
              data-testid="repertoire-upload-busy"
              sx={{ display: "flex", alignItems: "center", gap: 1, color: "text.secondary" }}
            >
              <CircularProgress size={16} />
              <Typography variant="body2">{t("repertoires.upload.reading")}</Typography>
            </Box>
          )}
        </Box>

        {problem !== null && (
          <Alert severity="error" data-testid="repertoire-upload-problem">
            {t(`repertoires.upload.problem.${problem.kind}`)}
            {problem.detail !== undefined && (
              <Typography variant="caption" dir="ltr" sx={{ display: "block" }}>
                {problem.detail}
              </Typography>
            )}
          </Alert>
        )}
      </Box>

      <RightPanel>
        <Box sx={{ color: "text.secondary" }}>
          <Typography variant="body2" sx={{ mb: 1 }}>
            {t("repertoires.storage")}
          </Typography>
          <Button component={RouterLink} to="/repertoires" size="small">
            {t("repertoires.detail.back")}
          </Button>
        </Box>
      </RightPanel>
    </>
  );
}

export default RepertoireUpload;
