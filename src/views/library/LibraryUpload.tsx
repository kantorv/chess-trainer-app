import { useMemo, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";

import { addCollection } from "../../lib/libraryCollectionStore";
import { collectionNameOfStem, readCollectionText } from "../../lib/libraryCollections";
import { RightPanel } from "../main/rightPanel";

/**
 * **Add a collection** (`/library/new`, CTA-75) — a `.pgn` file picked, or
 * PGN text pasted, becomes a new one-level folder of the Library holding its
 * games (`lib/libraryCollectionStore.ts`), and the reader lands on its table.
 *
 * A file and a paste go through the **same** reading (`readCollectionText`:
 * line endings normalised, cut into games, refused past the storage budget).
 * The name is the one typed, else the `Event` every game shares (a tournament
 * export), else the file's name, else "Pasted collection".
 */
function LibraryUpload() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [pasted, setPasted] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /** The one route in, for a file and a paste alike. */
  const bringIn = (text: string, fileStem?: string) => {
    const reading = readCollectionText(text);
    if (!reading.ok) {
      setProblem(reading.problem);
      return;
    }
    const chosen =
      name.trim() ||
      reading.name ||
      (fileStem === undefined ? t("library.upload.pastedName") : collectionNameOfStem(fileStem));
    const added = addCollection(chosen, reading.games);
    if ("problem" in added) {
      setProblem(added.problem);
      return;
    }
    navigate(`/library/${encodeURIComponent(added.collection.id)}`);
  };

  const onPicked = async (files: FileList | null) => {
    const file = files?.[0];
    // Cleared at once, so picking the same file again still fires a change.
    if (inputRef.current !== null) inputRef.current.value = "";
    if (file === undefined) return;
    let text: string;
    try {
      text = await file.text();
    } catch {
      setProblem("file");
      return;
    }
    bringIn(text, file.name.replace(/\.pgn$/i, ""));
  };

  const pastedReading = useMemo(
    () => (pasted.trim() === "" ? undefined : readCollectionText(pasted)),
    [pasted],
  );

  return (
    <>
      <Box
        data-testid="library-upload-screen"
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
          <Typography variant="subtitle1" component="h1" sx={{ fontWeight: 700 }}>
            {t("library.upload.title")}
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {t("library.upload.intro")}
          </Typography>
        </Box>

        <TextField
          size="small"
          label={t("library.upload.name")}
          value={name}
          onChange={(event) => setName(event.target.value)}
          slotProps={{ htmlInput: { "data-testid": "library-upload-name" } }}
        />

        <Box>
          <Button
            component="label"
            variant="contained"
            startIcon={<UploadFileRoundedIcon />}
            data-testid="library-upload-pick"
          >
            {t("library.upload.chooseFile")}
            <input
              ref={inputRef}
              hidden
              type="file"
              accept=".pgn,application/x-chess-pgn,text/plain"
              data-testid="library-upload-input"
              onChange={(event) => void onPicked(event.target.files)}
            />
          </Button>
        </Box>

        <TextField
          multiline
          minRows={6}
          maxRows={14}
          label={t("library.upload.pasteLabel")}
          value={pasted}
          onChange={(event) => {
            setPasted(event.target.value);
            setProblem(null);
          }}
          helperText={
            pastedReading?.ok === true
              ? t("library.upload.read", { count: pastedReading.games.length })
              : " "
          }
          slotProps={{ htmlInput: { "data-testid": "library-upload-paste", dir: "ltr" } }}
        />

        <Box>
          <Button
            variant="outlined"
            disabled={pasted.trim() === ""}
            onClick={() => bringIn(pasted)}
            data-testid="library-upload-save"
          >
            {t("library.upload.save")}
          </Button>
        </Box>

        {problem !== null && (
          <Alert severity="error" data-testid="library-upload-problem">
            {t(`library.upload.problem.${problem}`)}
          </Alert>
        )}
      </Box>
      <RightPanel>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {t("library.upload.storage")}
        </Typography>
      </RightPanel>
    </>
  );
}

export default LibraryUpload;
