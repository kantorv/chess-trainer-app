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
import CopyableValue from "../../shared/CopyableValue";

/**
 * The Position tab: every way a position gets *in*, and both ways it comes back
 * *out*.
 *
 * In — a PGN (pasted, picked, or dropped on the screen) and a FEN. Out — the
 * FEN of the position on screen and the PGN of the whole game, side lines
 * included, each read-only with a copy button. The pair is deliberate: a board
 * you can set up but not get back out of is a dead end.
 *
 * It lives in the shell's right-hand panel rather than under the board because
 * `Layout.tsx` hands a screen a board square and an aside, and there is no
 * region under the board for a form.
 *
 * Presentational: parsing lives in `lib/pgn.ts` and `lib/fen.ts`, and the state
 * lives in `AnalysisBoard.tsx`. This draws the controls and calls back out, so
 * it renders in a test with no board and no shell around it. The two read-only
 * fields are `views/shared/CopyableValue.tsx`, shared with the Board Editor.
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

type PositionSetupProps = {
  /** Games from the last multi-game file, for the picker. Empty for a single game. */
  games: readonly GameTree[];
  selected: number;
  onSelectGame: (index: number) => void;
  error: string | null;
  pgnText: string;
  onPgnTextChange: (text: string) => void;
  onLoadPgn: (event: FormEvent) => void;
  onFileChosen: (event: ChangeEvent<HTMLInputElement>) => void;
  fenText: string;
  onFenTextChange: (text: string) => void;
  onLoadFen: (event: FormEvent) => void;
  /** The position on screen — read-only. */
  currentFen: string;
  /** The whole game, side lines included — read-only. */
  currentPgn: string;
};

function PositionSetup({
  games,
  selected,
  onSelectGame,
  error,
  pgnText,
  onPgnTextChange,
  onLoadPgn,
  onFileChosen,
  fenText,
  onFenTextChange,
  onLoadFen,
  currentFen,
  currentPgn,
}: PositionSetupProps) {
  const { t } = useTranslation();

  /** The name to show for a game — its players, or a numbered fallback. */
  const titleOf = (game: GameTree, index: number) => {
    const white = gameTag(game.headers, "White");
    const black = gameTag(game.headers, "Black");
    return white || black
      ? `${white ?? "?"} ${t("analysis.position.versus")} ${black ?? "?"}`
      : t("analysis.position.gameFallback", { number: index + 1 });
  };

  const subtitleOf = (game: GameTree) =>
    (["Event", "Date", "Result"] as const)
      .map((key) => gameTag(game.headers, key))
      .filter((value): value is string => value !== undefined)
      .join(" · ");

  return (
    <Box
      data-testid="position-setup"
      sx={{ display: "flex", flexDirection: "column", gap: 2 }}
    >
      <Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
          {t("analysis.position.pgnTitle")}
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
            {t("analysis.position.chooseFile")}
            <Box
              component="input"
              type="file"
              accept=".pgn"
              data-testid="analysis-pgn-file-input"
              aria-label={t("analysis.position.chooseFile")}
              onChange={onFileChosen}
              sx={hiddenInputSx}
            />
          </Button>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {t("analysis.position.dropHint")}
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
            label={t("analysis.position.pasteLabel")}
            value={pgnText}
            onChange={(event) => onPgnTextChange(event.target.value)}
            // On the control itself: a `data-testid` on the TextField lands on
            // its wrapper, which is not something a reader can type into.
            slotProps={{ htmlInput: { "data-testid": "analysis-pgn-input" } }}
          />
          <Button type="submit" size="small" variant="outlined" sx={{ mt: 1 }}>
            {t("analysis.position.loadPgn")}
          </Button>
        </Box>
      </Box>

      <Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
          {t("analysis.position.fenTitle")}
        </Typography>
        <Box component="form" onSubmit={onLoadFen}>
          <TextField
            fullWidth
            size="small"
            label={t("analysis.position.fenLabel")}
            value={fenText}
            onChange={(event) => onFenTextChange(event.target.value)}
            slotProps={{
              htmlInput: { dir: "ltr", "data-testid": "analysis-fen-input" },
            }}
          />
          <Button type="submit" size="small" variant="outlined" sx={{ mt: 1 }}>
            {t("analysis.position.loadFen")}
          </Button>
        </Box>
      </Box>

      {error !== null && (
        <Alert severity="error" data-testid="analysis-position-error">
          {error}
        </Alert>
      )}

      {games.length > 1 && (
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {t("analysis.position.gamesTitle")}
          </Typography>
          <List dense disablePadding data-testid="analysis-game-picker">
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

      <Box sx={{ display: "grid", gap: 1.5 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {t("analysis.position.currentTitle")}
        </Typography>
        <CopyableValue
          label={t("analysis.position.currentFen")}
          value={currentFen}
          testId="analysis-current-fen"
        />
        <CopyableValue
          label={t("analysis.position.currentPgn")}
          value={currentPgn}
          testId="analysis-current-pgn"
        />
      </Box>
    </Box>
  );
}

export default PositionSetup;
