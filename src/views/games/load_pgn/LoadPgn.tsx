import { useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
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
import { Chess, DEFAULT_POSITION } from "chess.js";
import { Chessboard, type ChessboardOptions } from "react-chessboard";
import {
  EmptyPgnError,
  PgnParseError,
  finalFenOf,
  parsePgnGames,
  pgnTag,
  type ParsedGame,
} from "../../../lib/pgn";

/**
 * Load PGN — every way a game gets into the app: a file picker, a drop target,
 * a paste box, and a picker for multi-game files.
 *
 * Parsing itself lives in `src/lib/pgn.ts`, which owns the `ParsedGame` model
 * the move list will consume; this component is only the UI around it, plus a
 * read-only board showing the loaded game.
 *
 * The ingestion controls render inline here on purpose: the shell's panel slot
 * is a sibling sub-task, and this screen moves its controls into that slot once
 * it lands. Until then everything shares the square board area, so the column
 * scrolls.
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

function LoadPgn() {
  const { t } = useTranslation();

  /*
    Board wiring per .claude/rules/chessboard.md: `chess.js` lives in a ref, and
    the position is mirrored into state as a FEN string — setting that string is
    what re-renders the controlled <Chessboard>.
  */
  const chessGameRef = useRef(new Chess());
  /*
    Seeded from the constant rather than from `chessGameRef.current.fen()`: the
    two are the same string for a fresh game, and reading a ref during render is
    what `react-hooks/refs` (rightly) objects to on the older boards.
  */
  const [chessPosition, setChessPosition] = useState(DEFAULT_POSITION);

  const [games, setGames] = useState<readonly ParsedGame[]>([]);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pgnText, setPgnText] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);

  /* What the paste box last submitted, so blurring an untouched box is a no-op. */
  const lastPastedRef = useRef("");

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

  const showGame = (game: ParsedGame) => {
    /*
      The position after the last move — proof the whole game parsed, and the
      most informative single frame while stepping through the moves is still
      the navigation sub-task's to build.
    */
    chessGameRef.current = new Chess(finalFenOf(game));
    setChessPosition(chessGameRef.current.fen());
  };

  const selectGame = (index: number) => {
    setSelected(index);
    showGame(games[index]);
  };

  /** Turn a parse failure into a translated line; never let one escape. */
  const messageFor = (cause: unknown) => {
    if (cause instanceof EmptyPgnError) {
      return t("loadPgn.errors.empty");
    }
    if (cause instanceof PgnParseError) {
      return cause.gameNumber === undefined
        ? t("loadPgn.errors.parse", { detail: cause.detail })
        : t("loadPgn.errors.parseGame", {
            number: cause.gameNumber,
            detail: cause.detail,
          });
    }
    return t("loadPgn.errors.parse", {
      detail: cause instanceof Error ? cause.message : String(cause),
    });
  };

  const loadFromText = (text: string) => {
    try {
      const parsed = parsePgnGames(text);
      setGames(parsed);
      setSelected(0);
      setError(null);
      showGame(parsed[0]);
    } catch (cause) {
      // A malformed PGN is a message in the panel, not a thrown error.
      setGames([]);
      setError(messageFor(cause));
    }
  };

  const loadFromFile = (file: File) => {
    const reader = new FileReader();
    reader.onerror = () => setError(t("loadPgn.errors.file"));
    reader.onload = () =>
      loadFromText(typeof reader.result === "string" ? reader.result : "");
    reader.readAsText(file);
  };

  const onFileChosen = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) loadFromFile(file);
    // Clear the input so re-picking the same file fires `change` again.
    event.target.value = "";
  };

  // Both handlers must preventDefault, or the browser leaves the app and opens
  // the dropped file itself.
  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(true);
  };

  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) loadFromFile(file);
  };

  const submitPasted = (event: FormEvent) => {
    event.preventDefault();
    lastPastedRef.current = pgnText;
    loadFromText(pgnText);
  };

  /* On blur, load only what the box has not already submitted. */
  const onPasteBlur = () => {
    if (pgnText.trim() === "" || pgnText === lastPastedRef.current) return;
    lastPastedRef.current = pgnText;
    loadFromText(pgnText);
  };

  const current = games[selected];

  const chessboardOptions: ChessboardOptions = {
    id: "load-pgn-board",
    position: chessPosition,
    // Read-only: this screen shows a loaded game. Dragging a piece here would
    // desync the board from the PGN it is displaying.
    allowDragging: false,
  };

  return (
    <Box
      data-testid="load-pgn-screen"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      sx={{
        height: "100%",
        overflow: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 1.5,
        p: 1,
        borderRadius: 1,
        border: "2px dashed",
        borderColor: isDragOver ? "primary.main" : "divider",
        bgcolor: isDragOver ? "action.hover" : "transparent",
      }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
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

      <Box component="form" onSubmit={submitPasted}>
        <TextField
          fullWidth
          multiline
          minRows={3}
          size="small"
          label={t("loadPgn.pasteLabel")}
          value={pgnText}
          onChange={(event) => setPgnText(event.target.value)}
          onBlur={onPasteBlur}
        />
        <Button type="submit" size="small" sx={{ mt: 1 }}>
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
                onClick={() => selectGame(index)}
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

      <Typography variant="body2" data-testid="pgn-summary" sx={{ color: "text.secondary" }}>
        {current === undefined
          ? t("loadPgn.emptyState")
          : `${titleOf(current, selected)} — ${t("loadPgn.movesLoaded", {
              total: current.moves.length,
            })}`}
      </Typography>

      <Box
        sx={{
          width: "100%",
          maxWidth: 420,
          aspectRatio: "1 / 1",
          alignSelf: "center",
          flexShrink: 0,
        }}
      >
        <Chessboard options={chessboardOptions} />
      </Box>
    </Box>
  );
}

export default LoadPgn;
