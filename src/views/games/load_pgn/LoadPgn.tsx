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
import { Chessboard, type ChessboardOptions } from "react-chessboard";
import {
  EmptyPgnError,
  PgnParseError,
  parsePgnGames,
  pgnTag,
  type ParsedGame,
} from "../../../lib/pgn";
import { RightPanel } from "../../main/rightPanel";
import MoveList from "./MoveList";
import { useGameNavigation } from "./useGameNavigation";

/**
 * Load PGN — every way a game gets into the app: a file picker, a drop target,
 * a paste box, and a picker for multi-game files.
 *
 * Parsing itself lives in `src/lib/pgn.ts`, which owns the `ParsedGame` model
 * the move list will consume; this component is only the UI around it, plus a
 * read-only board showing the loaded game.
 *
 * The ingestion controls share the square board area, so this column scrolls.
 * The shell's right-hand aside holds the move list instead — registered through
 * `<RightPanel>` (see `views/main/rightPanel.tsx`), which keeps the panel part
 * of this screen's own tree and so able to share its ply state by closure.
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

  const [games, setGames] = useState<readonly ParsedGame[]>([]);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pgnText, setPgnText] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);

  /* What the paste box last submitted, so blurring an untouched box is a no-op. */
  const lastPastedRef = useRef("");

  const current = games[selected];

  /*
    Ply navigation for the game on screen: the board's position and arrow both
    come from the selected half-move, and the panel's move list drives it. No
    `chess.js` instance here on purpose — every ply already carries the FEN of
    the position after it (`lib/pgn.ts`), so nothing needs re-simulating.
  */
  const { ply, fen, arrows, goToPly } = useGameNavigation(current);

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

  /*
    A freshly loaded game opens on its final position — the most informative
    single frame, and proof the whole game parsed. Stepping back from there is
    what the arrow keys and the move list are for; Home returns to ply 0.
  */
  const showGame = (game: ParsedGame) => goToPly(game.moves.length);

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
      goToPly(0);
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

  const chessboardOptions: ChessboardOptions = {
    id: "load-pgn-board",
    position: fen,
    /*
      The move that produced this position. External arrows are never cleared
      by the board itself (.claude/rules/chessboard.md §3.4), so this is the
      whole set for the current ply, recomputed on every change — at ply 0 it
      is empty.
    */
    arrows,
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

      {/*
        The move list goes into the shell's right-hand aside. Registered only
        while a game is loaded, so an empty screen still shows the shell's own
        Analysis placeholder rather than an empty panel.
      */}
      {current !== undefined && (
        <RightPanel>
          <MoveList game={current} currentPly={ply} onSelectPly={goToPly} />
        </RightPanel>
      )}
    </Box>
  );
}

export default LoadPgn;
