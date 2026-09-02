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
import type { ChangeEvent, FormEvent } from "react";
import { pgnTag, type ParsedGame } from "../../../lib/pgn";

/**
 * The Load PGN tab: every way a game gets into the app — a file picker, a paste
 * box, and the picker for a multi-game file. Dropping a file is handled by the
 * regions that can receive one (`LoadPgn.tsx`), not here.
 *
 * Presentational: parsing lives in `src/lib/pgn.ts` and the state lives in
 * `LoadPgn.tsx`. This only draws the controls and calls back out, so it renders
 * in a test with no board and no shell around it.
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

type PgnIngestProps = {
  games: readonly ParsedGame[];
  selected: number;
  error: string | null;
  pgnText: string;
  onPgnTextChange: (text: string) => void;
  onFileChosen: (event: ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (event: FormEvent) => void;
  onPasteBlur: () => void;
  onSelectGame: (index: number) => void;
};

function PgnIngest({
  games,
  selected,
  error,
  pgnText,
  onPgnTextChange,
  onFileChosen,
  onSubmit,
  onPasteBlur,
  onSelectGame,
}: PgnIngestProps) {
  const { t } = useTranslation();

  const current = games[selected];

  /** The name to show for a game — its players, or a numbered fallback. */
  const titleOf = (game: ParsedGame, index: number) => {
    const white = pgnTag(game.headers, "White");
    const black = pgnTag(game.headers, "Black");
    return white || black
      ? `${white ?? "?"} ${t("loadPgn.versus")} ${black ?? "?"}`
      : t("loadPgn.gameFallback", { number: index + 1 });
  };

  /** The identifying tags under the name, placeholders already dropped. */
  const subtitleOf = (game: ParsedGame) =>
    (["Event", "Date", "Result"] as const)
      .map((key) => pgnTag(game.headers, key))
      .filter((value): value is string => value !== undefined)
      .join(" · ");

  return (
    <Box
      data-testid="load-pgn-controls"
      sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}
    >
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: "center", flexWrap: "wrap" }}
      >
        <Button
          component="label"
          variant="contained"
          size="small"
          startIcon={<UploadFileRoundedIcon />}
        >
          {t("loadPgn.chooseFile")}
          <Box
            component="input"
            type="file"
            accept=".pgn"
            data-testid="pgn-file-input"
            aria-label={t("loadPgn.chooseFile")}
            onChange={onFileChosen}
            sx={hiddenInputSx}
          />
        </Button>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {t("loadPgn.dropHint")}
        </Typography>
      </Stack>

      <Box component="form" onSubmit={onSubmit}>
        <TextField
          fullWidth
          multiline
          minRows={3}
          // Without a cap a pasted game grows this box to its own length and
          // pushes everything below it out of the tab.
          maxRows={10}
          size="small"
          label={t("loadPgn.pasteLabel")}
          value={pgnText}
          onChange={(event) => onPgnTextChange(event.target.value)}
          onBlur={onPasteBlur}
        />
        <Button type="submit" size="small" variant="outlined" sx={{ mt: 1 }}>
          {t("loadPgn.load")}
        </Button>
      </Box>

      {error !== null && (
        <Alert severity="error" data-testid="pgn-error">
          {error}
        </Alert>
      )}

      {games.length > 1 && (
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {t("loadPgn.gamesTitle")}
          </Typography>
          <List dense disablePadding data-testid="pgn-game-picker">
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

      <Typography
        variant="body2"
        data-testid="pgn-summary"
        sx={{ color: "text.secondary" }}
      >
        {current === undefined
          ? t("loadPgn.emptyState")
          : `${titleOf(current, selected)} — ${t("loadPgn.movesLoaded", {
              total: current.moves.length,
            })}`}
      </Typography>
    </Box>
  );
}

export default PgnIngest;
