import {
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from "react";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import GridOnRoundedIcon from "@mui/icons-material/GridOnRounded";
import RestoreRoundedIcon from "@mui/icons-material/RestoreRounded";
import DeleteSweepRoundedIcon from "@mui/icons-material/DeleteSweepRounded";
import SwapVertRoundedIcon from "@mui/icons-material/SwapVertRounded";
import { useTranslation } from "react-i18next";
import {
  Chessboard,
  ChessboardProvider,
  type ChessboardOptions,
  type PieceDropHandlerArgs,
} from "react-chessboard";
import { FenParseError } from "../../../lib/fen";
import { finalFenOf } from "../../../lib/gameModel";
import { mainlineGame, type GameTree } from "../../../lib/gameTree";
import { EmptyPgnError, PgnParseError, parsePgnTrees } from "../../../lib/pgn";
import { ForceLTR } from "../../../theme/ForceLTR";
import FenSetup from "./FenSetup";
import PgnSetup from "./PgnSetup";
import PiecePalette from "./PiecePalette";
import PositionFields from "./PositionFields";
import type { PositionEditorState } from "./usePositionEditor";

/**
 * **The position editor** (CTA-83; `.claude/rules/position-editor.md`) — a
 * board a position is set up on, piece by piece, as one screen-agnostic
 * element. The Lobby's Board editor tab is its first host; the Analysis Board
 * is the next.
 *
 * ```
 * ┌──────────────────────────────────────┐
 * │ ⚠ what is wrong with this position   │  only when there is something
 * │  ♚ ♛ ♜ ♝ ♞ ♟  🗑                      │  black palette
 * │ ┌──────────────────────────────────┐ │
 * │ │              board               │ │  square, pinned LTR
 * │ └──────────────────────────────────┘ │
 * │  ♔ ♕ ♖ ♗ ♘ ♙  🗑                      │  white palette
 * │ [New board] [Reset] [Clear] [Flip]   │  the resets
 * │ Position │ FEN │ PGN                 │  the forms
 * │ the active form                      │
 * └──────────────────────────────────────┘
 * ```
 *
 * **What it knows**: the editor state (`usePositionEditor`, owned by the
 * host), a test-id prefix, and how wide its board may grow. **What it does
 * not**: any route, URL, hand-off or screen. The host reads `editor.fen` /
 * `editor.problems` and decides what to do with them — the Lobby's Start
 * carries the FEN and is switched off while the position is illegal. The
 * editor itself switches off only the FEN tab's copy button.
 *
 * It is a **natural-height column**: it never scrolls itself, so the host
 * places it in a region that does.
 *
 * ### Why a `ChessboardProvider` rather than a plain board
 *
 * Spare pieces have to be able to reach the board's drag context, and the only
 * way they can is from inside the provider — so every prop the board would have
 * taken goes to the provider's `options` instead and `<Chessboard />` takes none
 * (`.claude/rules/chessboard.md` §2, and the vendored `SparePieces` story). The
 * palettes are inside it for the same reason, and inside a `ForceLTR`: a host
 * panel is not under `Layout.tsx`'s board-area `ForceLTR`, and the board must
 * never mirror.
 */

const FORM_TAB_IDS = ["position", "fen", "pgn"] as const;
type FormTabId = (typeof FORM_TAB_IDS)[number];

export type PositionEditorProps = {
  /** The state, from `usePositionEditor` — the host's. */
  editor: PositionEditorState;
  /**
   * The root of every test id under it, and of the board's `options.id`
   * (`${testId}-board`) — unique on the page.
   */
  testId: string;
  /** The widest the board grows, in pixels; absent, the column's full width. */
  boardMaxWidth?: number;
};

function PositionEditor({ editor, testId, boardMaxWidth }: PositionEditorProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<FormTabId>("position");

  /*
    Ingestion state: what the reader has typed, what came out of the last
    multi-game file, and what went wrong in each of the two forms. It is about
    the *forms*, not the position — the hook takes a FEN and knows nothing about
    where it came from — so it is the component's, and a host that unmounts the
    editor loses a half-typed paste, never the position.

    The two errors are separate on purpose: a FEN that would not parse says
    nothing about the PGN tab.
  */
  const [games, setGames] = useState<readonly GameTree[]>([]);
  const [selected, setSelected] = useState(0);
  const [fenError, setFenError] = useState<string | null>(null);
  const [pgnError, setPgnError] = useState<string | null>(null);
  const [pgnText, setPgnText] = useState("");
  const [fenText, setFenText] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);

  /** Turn a PGN failure into a translated line; never let one escape. */
  const pgnMessageFor = (cause: unknown) => {
    if (cause instanceof EmptyPgnError) return t("positionEditor.pgn.errors.empty");
    if (cause instanceof PgnParseError) {
      return cause.gameNumber === undefined
        ? t("positionEditor.pgn.errors.parse", { detail: cause.detail })
        : t("positionEditor.pgn.errors.parseGame", {
            number: cause.gameNumber,
            detail: cause.detail,
          });
    }
    return t("positionEditor.pgn.errors.parse", {
      detail: cause instanceof Error ? cause.message : String(cause),
    });
  };

  /** A game's last position — what an editor wants out of a PGN. */
  const finalPositionOf = (game: GameTree) => finalFenOf(mainlineGame(game));

  const loadPgnText = (text: string) => {
    try {
      const parsed = parsePgnTrees(text);
      setGames(parsed);
      setSelected(0);
      setPgnError(null);
      editor.loadPosition(finalPositionOf(parsed[0]));
    } catch (cause) {
      // A malformed PGN is a message under the form, not a thrown error.
      setGames([]);
      setPgnError(pgnMessageFor(cause));
    }
  };

  const loadFromFile = (file: File) => {
    const reader = new FileReader();
    reader.onerror = () => setPgnError(t("positionEditor.pgn.errors.file"));
    reader.onload = () =>
      loadPgnText(typeof reader.result === "string" ? reader.result : "");
    reader.readAsText(file);
  };

  const onFileChosen = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) loadFromFile(file);
    // Clear the input so re-picking the same file fires `change` again.
    event.target.value = "";
  };

  const onSubmitPgn = (event: FormEvent) => {
    event.preventDefault();
    loadPgnText(pgnText);
  };

  const onLoadFen = (event: FormEvent) => {
    event.preventDefault();
    try {
      editor.loadFen(fenText);
      setFenError(null);
    } catch (cause) {
      setFenError(
        t("positionEditor.fen.error", {
          detail:
            cause instanceof FenParseError
              ? cause.detail
              : cause instanceof Error
                ? cause.message
                : String(cause),
        }),
      );
    }
  };

  const selectGame = (index: number) => {
    setSelected(index);
    editor.loadPosition(finalPositionOf(games[index]));
  };

  // Both handlers must preventDefault, or the browser leaves the app and opens
  // the dropped file itself. A `.pgn` dropped anywhere on the editor loads.
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

  const chessboardOptions: ChessboardOptions = {
    id: `${testId}-board`,
    position: editor.fen,
    boardOrientation: editor.orientation,
    // Pieces are placed and taken away, never moved by a rule — so there is no
    // legality to check and no reason to ever disable dragging.
    onPieceDrop: ({ piece, sourceSquare, targetSquare }: PieceDropHandlerArgs) =>
      editor.onPieceDrop({
        pieceType: piece.pieceType,
        isSparePiece: piece.isSparePiece,
        sourceSquare,
        targetSquare,
      }),
  };

  /*
    The resets, one of which is conditional: "Reset" — back to the initial
    position — is only there when the host gave one, because otherwise it
    would have nothing to return to. It sits next to "New board", the standard
    chess start: the same gesture aimed at two different positions.
  */
  const resets = [
    {
      key: "start",
      label: t("positionEditor.controls.startingPosition"),
      icon: <GridOnRoundedIcon fontSize="small" />,
      onClick: editor.setStartingPosition,
    },
    ...(editor.initialFen === undefined
      ? []
      : [
          {
            key: "initial",
            label: t("positionEditor.controls.initialPosition"),
            icon: <RestoreRoundedIcon fontSize="small" />,
            onClick: editor.setInitialPosition,
          },
        ]),
    {
      key: "clear",
      label: t("positionEditor.controls.clearBoard"),
      icon: <DeleteSweepRoundedIcon fontSize="small" />,
      onClick: editor.clearBoard,
    },
    {
      key: "flip",
      label: t("positionEditor.controls.flip"),
      icon: <SwapVertRoundedIcon fontSize="small" />,
      onClick: editor.flipBoard,
    },
  ];

  return (
    <Box
      data-testid={testId}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 1.5,
        borderRadius: 1,
        // An outline, not a border: it is painted outside the box model, so
        // switching it on does not shrink the board by its own width.
        outline: isDragOver ? "2px dashed" : "none",
        outlineOffset: "2px",
        color: isDragOver ? "primary.main" : "inherit",
      }}
    >
      {editor.problems.length > 0 && (
        <Alert
          severity="warning"
          data-testid={`${testId}-problems`}
          sx={{ py: 0.5 }}
        >
          <AlertTitle sx={{ mb: 0 }}>{t("positionEditor.problems.title")}</AlertTitle>
          <Box component="ul" sx={{ m: 0, pl: 2 }}>
            {editor.problems.map((problem) => (
              <li key={problem} data-testid={`${testId}-problem-${problem}`}>
                {t(`positionEditor.problems.${problem}`)}
              </li>
            ))}
          </Box>
        </Alert>
      )}

      <ForceLTR
        sx={{
          width: "100%",
          maxWidth: boardMaxWidth === undefined ? undefined : `${boardMaxWidth}px`,
          alignSelf: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 1,
        }}
      >
        <ChessboardProvider options={chessboardOptions}>
          <PiecePalette
            testId={testId}
            color="b"
            onClear={() => editor.clearColor("b")}
          />
          <Box
            data-testid={`${testId}-board-square`}
            sx={{ width: "100%", aspectRatio: "1 / 1", flexShrink: 0 }}
          >
            <Chessboard />
          </Box>
          <PiecePalette
            testId={testId}
            color="w"
            onClear={() => editor.clearColor("w")}
          />
        </ChessboardProvider>
      </ForceLTR>

      <Box
        data-testid={`${testId}-controls`}
        sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}
      >
        {resets.map((reset) => (
          <Button
            key={reset.key}
            size="small"
            variant="outlined"
            startIcon={reset.icon}
            data-testid={`${testId}-reset-${reset.key}`}
            onClick={reset.onClick}
          >
            {reset.label}
          </Button>
        ))}
      </Box>

      <Typography
        variant="caption"
        data-testid={`${testId}-remove-hint`}
        sx={{ color: "text.secondary" }}
      >
        {t("positionEditor.palette.removeHint")}
      </Typography>

      <Tabs
        value={tab}
        onChange={(_event, next: FormTabId) => setTab(next)}
        variant="fullWidth"
        sx={{
          minHeight: 36,
          borderBottom: "1px solid",
          borderColor: "divider",
          "& .MuiTab-root": {
            minHeight: 36,
            textTransform: "none",
            minWidth: 0,
            px: 1,
          },
        }}
      >
        {FORM_TAB_IDS.map((id) => (
          <Tab
            key={id}
            value={id}
            label={t(`positionEditor.tabs.${id}`)}
            data-testid={`${testId}-tab-${id}`}
          />
        ))}
      </Tabs>

      <Box role="tabpanel" data-testid={`${testId}-tab-content-${tab}`}>
        {tab === "position" && (
          <PositionFields
            testId={testId}
            fields={editor.fields}
            onTurnChange={editor.setTurn}
            onCastlingChange={editor.setCastlingRight}
            onEnPassantChange={editor.setEnPassant}
          />
        )}
        {tab === "fen" && (
          <FenSetup
            testId={testId}
            fenText={fenText}
            onFenTextChange={setFenText}
            onLoadFen={onLoadFen}
            error={fenError}
            currentFen={editor.fen}
            canCopy={editor.isValid}
          />
        )}
        {tab === "pgn" && (
          <PgnSetup
            testId={testId}
            games={games}
            selected={selected}
            onSelectGame={selectGame}
            error={pgnError}
            pgnText={pgnText}
            onPgnTextChange={setPgnText}
            onSubmitPgn={onSubmitPgn}
            onFileChosen={onFileChosen}
          />
        )}
      </Box>
    </Box>
  );
}

export default PositionEditor;
