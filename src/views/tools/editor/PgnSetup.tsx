import type { ChangeEvent, FormEvent } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import { useTranslation } from "react-i18next";
import { gameTag } from "../../../lib/gameModel";
import type { GameTree } from "../../../lib/gameTree";

/**
 * The PGN tab: paste a game, pick a file, or drop one on the screen, and the
 * **final position** of the game you choose lands on the board.
 *
 * The Analysis Board's Position tab loads a game to *play through*; this one
 * loads it to carry on editing from, which is the only difference between the
 * two forms and the reason this screen says so under the input. The picker for
 * a multi-game file is the same idea as the sibling screen's, over the same
 * `parsePgnTrees` output.
 *
 * Presentational: the ingestion state and the parsing live in
 * `BoardEditor.tsx` and `lib/pgn.ts`.
 */

/** An input that stays clickable — and so uploadable in tests — while unseen. */
const hiddenInputSx = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;

type PgnSetupProps = {
  /** Games from the last multi-game file, for the picker. Empty for a single game. */
  games: readonly GameTree[];
  selected: number;
  onSelectGame: (index: number) => void;
  error: string | null;
  pgnText: string;
  onPgnTextChange: (text: string) => void;
  onLoadPgn: (event: FormEvent) => void;
  onFileChosen: (event: ChangeEvent<HTMLInputElement>) => void;
};

function PgnSetup({
  games,
  selected,
  onSelectGame,
  error,
  pgnText,
  onPgnTextChange,
  onLoadPgn,
  onFileChosen,
}: PgnSetupProps) {
  const { t } = useTranslation();

  /** The name to show for a game — its players, or a numbered fallback. */
  const titleOf = (game: GameTree, index: number) => {
    const white = gameTag(game.headers, "White");
    const black = gameTag(game.headers, "Black");
    return white || black
      ? `${white ?? "?"} ${t("editor.pgn.versus")} ${black ?? "?"}`
      : t("editor.pgn.gameFallback", { number: index + 1 });
  };

  const subtitleOf = (game: GameTree) =>
    (["Event", "Date", "Result"] as const)
      .map((key) => gameTag(game.headers, key))
      .filter((value): value is string => value !== undefined)
      .join(" · ");

  return (
    <Box
      data-testid="editor-pgn-setup"
      sx={{ display: "flex", flexDirection: "column", gap: 2 }}
    >
      <Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
          {t("editor.pgn.title")}
        </Typography>

        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: "center", flexWrap: "wrap", mb: 1 }}
        >
          <Button
            component="label"
            variant="contained"
            size="small"
            startIcon={<UploadFileRoundedIcon />}
          >
            {t("editor.pgn.chooseFile")}
            <Box
              component="input"
              type="file"
              accept=".pgn"
              data-testid="editor-pgn-file-input"
              aria-label={t("editor.pgn.chooseFile")}
              onChange={onFileChosen}
              sx={hiddenInputSx}
            />
          </Button>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {t("editor.pgn.dropHint")}
          </Typography>
        </Stack>

        <Box component="form" onSubmit={onLoadPgn}>
          <TextField
            fullWidth
            multiline
            minRows={3}
            // Without a cap a pasted game grows this box to its own length and
            // pushes everything below it out of the tab.
            maxRows={10}
            size="small"
            label={t("editor.pgn.pasteLabel")}
            value={pgnText}
            onChange={(event) => onPgnTextChange(event.target.value)}
            slotProps={{ htmlInput: { "data-testid": "editor-pgn-input" } }}
          />
          <Button type="submit" size="small" variant="outlined" sx={{ mt: 1 }}>
            {t("editor.pgn.load")}
          </Button>
          <Typography
            variant="caption"
            sx={{ display: "block", mt: 0.5, color: "text.secondary" }}
          >
            {t("editor.pgn.hint")}
          </Typography>
        </Box>
      </Box>

      {error !== null && (
        <Alert severity="error" data-testid="editor-pgn-error">
          {error}
        </Alert>
      )}

      {games.length > 1 && (
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {t("editor.pgn.gamesTitle")}
          </Typography>
          <List dense disablePadding data-testid="editor-game-picker">
            {games.map((game, index) => (
              <ListItemButton
                // Games in a file have no id of their own, and the list is
                // rebuilt wholesale on every load — the index is stable for as
                // long as this array exists.
                key={index}
                selected={index === selected}
                onClick={() => onSelectGame(index)}
              >
                <ListItemText
                  primary={titleOf(game, index)}
                  secondary={subtitleOf(game)}
                />
              </ListItemButton>
            ))}
          </List>
        </Box>
      )}
    </Box>
  );
}

export default PgnSetup;
