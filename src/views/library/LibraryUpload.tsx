import { useMemo, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import CreateNewFolderRoundedIcon from "@mui/icons-material/CreateNewFolderRounded";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import { useNavigate, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";

import { isZipFile, readCollectionZip } from "../../lib/collectionZip";
import { addCollection } from "../../lib/libraryCollectionStore";
import {
  collectionImportFileOf,
  readCollectionText,
  type CollectionImportSource,
  type CollectionSummary,
} from "../../lib/libraryCollections";
import FolderPicker from "../shared/folders/FolderPicker";
import { RightPanel } from "../main/rightPanel";
import ImportOptionsDialog from "./ImportOptionsDialog";
import LibraryMiss from "./LibraryMiss";
import { useCollectionSummary, useLibraryFolders } from "./useLibraryCollections";

/**
 * **Add a collection** (`/library/new`, CTA-75) — a `.pgn` file picked, or
 * PGN text pasted, becomes a new collection of the Library holding its
 * games (`lib/libraryCollectionStore.ts`), and the reader lands on its table.
 *
 * A `.zip` is unzipped (`lib/collectionZip.ts`, CTA-102): each `.pgn` in it
 * becomes a collection of its own (CTA-103); a zip with none is refused.
 *
 * A file and a paste go through the **same** reading (`readCollectionText`:
 * line endings normalised, cut into games, refused past
 * `MAX_COLLECTION_CHARS`), and then the **same popup** (`ImportOptionsDialog`,
 * CTA-103): what came in — the file, its size, the games, a zip's files, the
 * players, Elo, dates and events — and filters on Elo, dates and players
 * applied **before** the index pass. The name is the one typed, else the
 * `Event` every game shares (a tournament export), else the file's name,
 * else "Pasted collection".
 *
 * **Every kept game is checked before the collection is kept**: its index
 * (`lib/collectionIndex.ts` — the tags, and a `chess.js` pass: the length,
 * unreadable games, the opening from the book) is built in a Web Worker
 * (`indexCollection.ts`) while the popup's progress bar says how far it has
 * got — about 8 ms a game, so a minute and more for 10,000. Cancel, or
 * leaving the screen, stops it and keeps nothing.
 *
 * **An empty collection** is made from the name alone (CTA-77) — a custom
 * collection the reader fills later, with no popup. **Filling one** is this
 * screen again, at `/library/new?into=<collection>` (the table's *Add games*,
 * uploaded collections only): the same reading, popup and check, and the
 * games are added at the end of that collection (`appendCollectionGames`)
 * rather than kept as a new one, and the reader goes back to its table.
 *
 * **A new collection is filed in a folder** (CTA-88): the picker starts at the
 * top level, or at `?folder=<id>` — a folder row's *Add a collection here*.
 * A folder that is not the reader's (gone, or Built-in) is the top level.
 */
function LibraryUpload({ into, folder = null }: { into?: CollectionSummary; folder?: string | null }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const folders = useLibraryFolders() ?? [];
  const [folderId, setFolderId] = useState<string | null>(folder);
  const [name, setName] = useState("");
  const [pasted, setPasted] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  /** What was read, open in the import popup. */
  const [source, setSource] = useState<CollectionImportSource | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /** The one route in, for a file, a zip's files and a paste alike: read, then the popup. */
  const bringIn = (
    texts: { text: string; size: number; name?: string; stem?: string }[],
    picked?: { name: string; size: number; zip: boolean },
  ) => {
    const read = texts.map(({ text, size, name: fileName, stem }) => collectionImportFileOf(text, size, fileName, stem));
    const readable = read.filter(({ reading }) => reading.ok);
    if (readable.length === 0) {
      const [first] = read;
      setProblem(first !== undefined && !first.reading.ok ? first.reading.problem : "unreadable");
      return;
    }
    setProblem(null);
    setSource({
      name: picked?.name,
      size: picked?.size ?? texts.reduce((sum, text) => sum + text.size, 0),
      zip: picked?.zip ?? false,
      // A zip lists every .pgn in it, a file that read no game with none.
      files: read.map(({ file }) => file),
    });
  };

  /** A collection with no games yet — named as typed, else "New collection". */
  const createEmpty = async () => {
    setProblem(null);
    const added = await addCollection(
      name.trim() || t("library.upload.emptyName"),
      [],
      [],
      undefined,
      undefined,
      folderId,
    );
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
    if (isZipFile(file)) {
      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(await file.arrayBuffer());
      } catch {
        setProblem("file");
        return;
      }
      const zipped = readCollectionZip(bytes);
      if (!zipped.ok) {
        setProblem(zipped.problem);
        return;
      }
      // Each entry's name is its collection's fallback name.
      bringIn(
        zipped.entries.map((entry) => ({ text: entry.text, size: entry.size, name: entry.path, stem: entry.stem })),
        { name: file.name, size: file.size, zip: true },
      );
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      setProblem("file");
      return;
    }
    bringIn([{ text, size: file.size, name: file.name, stem: file.name.replace(/\.pgn$/i, "") }], {
      name: file.name,
      size: file.size,
      zip: false,
    });
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
          <Typography
            variant="subtitle1"
            component="h1"
            dir="auto"
            sx={{ fontWeight: 700 }}
            data-testid="library-upload-title"
          >
            {into === undefined
              ? t("library.upload.title")
              : t("library.upload.intoTitle", { name: into.name })}
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {t(into === undefined ? "library.upload.intro" : "library.upload.intoIntro")}
          </Typography>
        </Box>

        {into === undefined && (
          <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start", flexWrap: "wrap" }}>
            <TextField
              size="small"
              label={t("library.upload.name")}
              value={name}
              disabled={source !== null}
              onChange={(event) => setName(event.target.value)}
              slotProps={{ htmlInput: { "data-testid": "library-upload-name" } }}
              sx={{ flex: 1, minWidth: 200 }}
            />
            <Button
              variant="outlined"
              startIcon={<CreateNewFolderRoundedIcon />}
              disabled={source !== null}
              onClick={() => void createEmpty()}
              data-testid="library-upload-empty"
              sx={{ flexShrink: 0 }}
            >
              {t("library.upload.empty")}
            </Button>
          </Box>
        )}

        {into === undefined && folders.length > 0 && (
          <Box>
            <Typography variant="caption" component="div" sx={{ color: "text.secondary", mb: 0.5 }}>
              {t("library.upload.folder")}
            </Typography>
            <Box
              sx={{
                maxHeight: 180,
                overflowY: "auto",
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 1,
                p: 0.5,
                opacity: source !== null ? 0.5 : 1,
                pointerEvents: source !== null ? "none" : undefined,
              }}
            >
              <FolderPicker
                labelKey="library"
                idPrefix="library-upload-folder"
                folders={folders}
                value={folderId}
                onChange={setFolderId}
                noneLabel={t("library.folder.topLevel")}
                noneTestId="library-upload-folder-top"
              />
            </Box>
          </Box>
        )}

        <Box>
          <Button
            component="label"
            variant="contained"
            startIcon={<UploadFileRoundedIcon />}
            disabled={source !== null}
            data-testid="library-upload-pick"
          >
            {t("library.upload.chooseFile")}
            <input
              ref={inputRef}
              hidden
              type="file"
              accept=".pgn,.zip,application/x-chess-pgn,text/plain,application/zip,application/x-zip-compressed"
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
          disabled={source !== null}
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
            disabled={pasted.trim() === "" || source !== null}
            onClick={() => bringIn([{ text: pasted, size: new Blob([pasted]).size }])}
            data-testid="library-upload-save"
          >
            {t(into === undefined ? "library.upload.save" : "library.upload.intoSave")}
          </Button>
        </Box>

        {problem !== null && (
          <Alert severity="error" data-testid="library-upload-problem">
            {t(`library.upload.problem.${problem}`)}
          </Alert>
        )}
      </Box>
      {source !== null && (
        <ImportOptionsDialog
          source={source}
          into={into}
          typedName={name}
          folderId={folderId}
          onClose={() => setSource(null)}
          onDone={(path) => navigate(path)}
        />
      )}
      <RightPanel>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {t("library.upload.storage")}
        </Typography>
      </RightPanel>
    </>
  );
}

/**
 * The route: a new collection — `?folder=<id>` filed in one of the reader's
 * folders, waiting for them to be read — or, `?into=<collection>`, games
 * added to one of the reader's own. A shipped collection, or one that is not
 * there, is the miss.
 */
function LibraryUploadRoute() {
  const [params] = useSearchParams();
  const into = params.get("into");
  const folder = params.get("folder");
  const state = useCollectionSummary(into ?? undefined);
  const folders = useLibraryFolders();
  const { t } = useTranslation();
  const loading = (
    <Typography data-testid="library-loading" sx={{ color: "text.secondary", p: 2 }}>
      {t("library.table.loading")}
    </Typography>
  );
  if (into === null) {
    if (folder === null) return <LibraryUpload />;
    if (folders === undefined) return loading;
    const known = folders.some((candidate) => candidate.id === folder);
    return <LibraryUpload key={folder} folder={known ? folder : null} />;
  }
  if (state.status === "loading") return loading;
  if (state.status === "missing" || state.summary.source !== "uploaded") {
    return <LibraryMiss what="collection" />;
  }
  return <LibraryUpload key={state.summary.id} into={state.summary} />;
}

export default LibraryUploadRoute;
