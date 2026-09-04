import { useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Typography from "@mui/material/Typography";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import MenuBookRoundedIcon from "@mui/icons-material/MenuBookRounded";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import { useTranslation } from "react-i18next";

import { asAppLanguage } from "../../i18n";
import {
  categoryLabel,
  findLibraryCategory,
  itemCountUnder,
} from "../../lib/libraryCatalog";
import { pgnKindOf } from "../../lib/pgnKind";
import {
  checkUploadPgn,
  uploadFolderPath,
  UPLOADS_PATH,
  type UploadProblem,
} from "../../lib/pgnUploads";
import { userPgnsLibrary } from "../../lib/pgnCatalog";
import { addUpload, removeUpload } from "../../lib/pgnUploadStore";
import { RightPanel } from "../main/rightPanel";
import type { LibrarySection } from "../library/section";
import PgnIndexRow from "./PgnIndexRow";
import { useUploads } from "./useUploads";

/**
 * **The Uploads screen** — the reader's own `.pgn` files: the button that adds
 * one, and what has been added.
 *
 * It is the screen of the `uploads` folder (`lib/pgnKind.ts`), which is the one
 * folder in this section that is a *place* rather than a file. That is why it
 * exists before anything is in it, and why its screen is a form rather than a
 * list of games: with nothing uploaded there is nothing to list, and the only
 * useful thing a reader can do there is add something.
 *
 * ### An upload is not a special kind of content
 *
 * A picked file goes through `loadPgnLibrary`, the same loader the shipped
 * files go through, under the same manifest mechanism — so what comes out is
 * recognised rather than declared: a lichess study becomes a folder of
 * chapters, an export of every study its author wrote becomes a **collection**
 * with its own index screen, a chess.com export becomes a folder of games. The
 * rows below therefore link into the ordinary section and say what each file
 * turned out to be; nothing downstream of this screen knows that a file was
 * uploaded rather than shipped.
 *
 * ### It reads the file, then keeps it
 *
 * `checkUploadPgn` runs before anything is stored, so a file that holds no
 * readable game is refused **with a reason** rather than becoming an empty
 * folder in the sidebar. Storage is `localStorage` — per browser, not
 * synchronised anywhere — which the panel says plainly, because a reader who
 * uploads a study they care about should know what they are relying on.
 */

/** Reading a `File` as text, with the failure surfaced rather than thrown. */
const readFile = (file: File): Promise<string | undefined> =>
  file
    .text()
    .then((text) => text)
    .catch(() => undefined);

type Props = {
  section: LibrarySection;
};

function PgnUploads({ section }: Props) {
  const { t, i18n } = useTranslation();
  const language = asAppLanguage(i18n.language);

  const uploads = useUploads();
  /*
    The same value `section.catalog` returns — this screen asks for it by name
    because it reads the `kinds` map with it, and a `LibrarySection` is typed
    for the three sections rather than for this one.
  */
  const library = userPgnsLibrary();

  /** What went wrong with the last pick, as `<file name, reason>` pairs. */
  const [rejected, setRejected] = useState<{ name: string; problem: UploadProblem }[]>(
    [],
  );
  const inputRef = useRef<HTMLInputElement>(null);

  const onPicked = async (files: FileList | null) => {
    if (files === null || files.length === 0) return;

    const problems: { name: string; problem: UploadProblem }[] = [];

    // One at a time and in order, so two files with the same name end up in the
    // order they were picked rather than in whichever read finished first.
    for (const file of Array.from(files)) {
      const text = await readFile(file);
      if (text === undefined) {
        problems.push({ name: file.name, problem: "unreadable" });
        continue;
      }

      const check = checkUploadPgn(file.name, text);
      if (!check.ok) {
        problems.push({ name: file.name, problem: check.problem });
        continue;
      }

      const stored = addUpload(file.name, text);
      if (stored !== undefined) problems.push({ name: file.name, problem: stored });
    }

    setRejected(problems);
    // Clear the input, or picking the same file twice in a row fires no change
    // event the second time.
    if (inputRef.current !== null) inputRef.current.value = "";
  };

  return (
    <>
      <Box
        data-testid="user-pgns-uploads"
        sx={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        <Box
          sx={{
            flexShrink: 0,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 1.5,
            pb: 1.5,
            mb: 1.5,
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <Box sx={{ minWidth: 0, marginInlineEnd: "auto" }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
              {t(`${section.chromeKey}.uploads.title`)}
            </Typography>
            <Typography
              data-testid="user-pgns-uploads-count"
              variant="caption"
              sx={{ display: "block", color: "text.secondary" }}
            >
              {t(`${section.chromeKey}.uploads.count`, { count: uploads.length })}
            </Typography>
          </Box>

          {/*
            A label wrapping a hidden input: the file dialog can only be opened
            by a real `<input type="file">`, and this is the one way to give it
            a themed control without a click handler that browsers may refuse.
          */}
          <Button
            component="label"
            variant="contained"
            size="small"
            startIcon={<UploadFileRoundedIcon />}
            data-testid="user-pgns-uploads-button"
            sx={{ flexShrink: 0 }}
          >
            {t(`${section.chromeKey}.uploads.upload`)}
            <input
              ref={inputRef}
              type="file"
              hidden
              multiple
              accept=".pgn,application/x-chess-pgn,text/plain"
              data-testid="user-pgns-uploads-input"
              onChange={(event) => void onPicked(event.target.files)}
            />
          </Button>
        </Box>

        <Box
          data-testid="user-pgns-uploads-body"
          sx={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}
        >
          {rejected.length > 0 && (
            <Alert
              severity="warning"
              onClose={() => setRejected([])}
              data-testid="user-pgns-uploads-rejected"
              sx={{ mb: 2 }}
            >
              {rejected.map(({ name, problem }) => (
                <Box key={name}>
                  {t(`${section.chromeKey}.uploads.problems.${problem}`, { name })}
                </Box>
              ))}
            </Alert>
          )}

          {uploads.length === 0 ? (
            <Typography
              data-testid="user-pgns-uploads-empty"
              variant="body2"
              sx={{ color: "text.secondary", textAlign: "center", py: 4 }}
            >
              {t(`${section.chromeKey}.uploads.empty`)}
            </Typography>
          ) : (
            <List disablePadding>
              {uploads.map((upload) => {
                /*
                  The folder this file became. It is looked up rather than
                  derived, because the loader decides the path (and the kind),
                  and a file that produced no folder — impossible, since
                  `checkUploadPgn` refused those — would simply not be linkable.
                */
                const category = findLibraryCategory(
                  uploadFolderPath(upload.name),
                  library,
                );
                return (
                  <ListItem
                    key={upload.name}
                    disablePadding
                    secondaryAction={
                      <IconButton
                        edge="end"
                        size="small"
                        aria-label={t(`${section.chromeKey}.uploads.remove`, {
                          name: upload.name,
                        })}
                        data-testid={`user-pgns-uploads-remove-${upload.name}`}
                        onClick={() => removeUpload(upload.name)}
                      >
                        <DeleteOutlineRoundedIcon fontSize="small" />
                      </IconButton>
                    }
                  >
                    <PgnIndexRow
                      to={
                        category === undefined
                          ? `${section.routeBase}/${UPLOADS_PATH}`
                          : `${section.routeBase}/${category.path}`
                      }
                      icon={<MenuBookRoundedIcon fontSize="small" />}
                      primary={
                        category === undefined
                          ? upload.name
                          : categoryLabel(category, (key) => t(key), language)
                      }
                      secondary={[
                        t(
                          `${section.chromeKey}.uploads.kinds.${
                            category === undefined
                              ? "games"
                              : pgnKindOf(category.path, library.kinds)
                          }`,
                        ),
                        t(`${section.chromeKey}.list.count`, {
                          count:
                            category === undefined
                              ? 0
                              : itemCountUnder(category, library),
                        }),
                        upload.name,
                      ].join(" · ")}
                      testId={`user-pgns-uploads-item-${upload.name}`}
                    />
                  </ListItem>
                );
              })}
            </List>
          )}
        </Box>
      </Box>

      <RightPanel>
        <Box sx={{ color: "text.secondary" }}>
          <Typography variant="body2" sx={{ mb: 1 }}>
            {t(`${section.chromeKey}.uploads.hint`)}
          </Typography>
          <Typography variant="body2" data-testid="user-pgns-uploads-storage-note">
            {t(`${section.chromeKey}.uploads.storage`)}
          </Typography>
        </Box>
      </RightPanel>
    </>
  );
}

export default PgnUploads;
