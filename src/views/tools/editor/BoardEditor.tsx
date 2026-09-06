import {
  useMemo,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useNavigate, createSearchParams, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import {
  Chessboard,
  ChessboardProvider,
  type ChessboardOptions,
  type PieceDropHandlerArgs,
} from "react-chessboard";
import { FenParseError, parseFen } from "../../../lib/fen";
import { finalFenOf } from "../../../lib/gameModel";
import { mainlineGame, type GameTree } from "../../../lib/gameTree";
import { EmptyPgnError, PgnParseError, parsePgnTrees } from "../../../lib/pgn";
import { RightPanel } from "../../main/rightPanel";
import EditorPanel from "./EditorPanel";
import FenSetup from "./FenSetup";
import PgnSetup from "./PgnSetup";
import PiecePalette, {
  PALETTE_GAP_PX,
  PALETTES_TOTAL_PX,
} from "./PiecePalette";
import { useBoardEditor } from "./useBoardEditor";

/**
 * Board Editor — set a position up piece by piece, then take it somewhere.
 *
 * The screen fills two of the shell's regions and draws no columns of its own:
 *
 * - the **board square** holds the black palette, the board and the white
 *   palette, stacked;
 * - the **right-hand panel** (`<RightPanel>`) holds `EditorPanel` — the
 *   Position / FEN / PGN tabs over the reset controls and the two hand-offs.
 *
 * `/tools/editor?fen=<position>` opens on that position — the mate detail page
 * and any other screen holding a FEN hand one over exactly the way this screen
 * hands one out. The parameter is validated here (`parseFen` is the gate, and
 * one that will not pass it is ignored rather than allowed to throw on someone
 * else's mistyped link) and the hook takes it as its *initial* state, so nothing
 * is written from an effect.
 *
 * All the behaviour lives in `useBoardEditor`; this component is the layout, the
 * board options, and the ingestion state that the two forms and the drop targets
 * share. `<RightPanel>` portals the panel out of this tree, so it still shares
 * this screen's state by closure and nothing is threaded through the shell.
 *
 * ### Why a `ChessboardProvider` rather than a plain board
 *
 * Spare pieces have to be able to reach the board's drag context, and the only
 * way they can is from inside the provider — so every prop the board would have
 * taken goes to the provider's `options` instead and `<Chessboard />` takes none
 * (`.claude/rules/chessboard.md` §2, and the vendored `SparePieces` story). The
 * palettes are inside it for the same reason, which conveniently puts them
 * inside `Layout.tsx`'s `ForceLTR` as well: they must not mirror, for exactly
 * the reason the board must not.
 *
 * ### How the palettes and the board split the square
 *
 * The shell hands this screen a square of side S and knows nothing about a
 * palette (`Layout.tsx` is not changed for one). The palettes take a fixed strip
 * out of the top and the bottom, and the board gives up the difference — so the
 * board is a `S - PALETTES_TOTAL_PX` square, and that constant is the sum of the
 * two palette heights and the two gaps. The board's box is sized by **width**
 * and squared with `aspectRatio` rather than being given both sides in percent:
 * the provider sits between this box and the shell's square, and a percentage
 * height would have to resolve through it.
 */

function BoardEditor() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  /*
    The position handed over by whoever linked here, if this is that arrival.
    Only the first render's value is ever used (see `useBoardEditor`), but
    parsing it on every render would build a `chess.js` instance for nothing.
  */
  const requested = searchParams.get("fen");
  const initialFen = useMemo(() => {
    if (requested === null) return undefined;
    try {
      return parseFen(requested);
    } catch {
      // A link nobody can read opens on the starting position, as if the
      // parameter had not been there at all.
      return undefined;
    }
  }, [requested]);

  const state = useBoardEditor(initialFen);

  /*
    Ingestion state: what the reader has typed, what came out of the last
    multi-game file, and what went wrong in each of the two forms. It lives here
    rather than in the hook because it is about the *forms*, not about the
    position — the hook takes a FEN and knows nothing about where it came from.

    The two errors are separate on purpose: a FEN that would not parse says
    nothing about the PGN tab, and one message shown under both forms would be
    reporting a failure the reader is no longer looking at.
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
    if (cause instanceof EmptyPgnError) return t("editor.pgn.errors.empty");
    if (cause instanceof PgnParseError) {
      return cause.gameNumber === undefined
        ? t("editor.pgn.errors.parse", { detail: cause.detail })
        : t("editor.pgn.errors.parseGame", {
            number: cause.gameNumber,
            detail: cause.detail,
          });
    }
    return t("editor.pgn.errors.parse", {
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
      state.loadPosition(finalPositionOf(parsed[0]));
    } catch (cause) {
      // A malformed PGN is a message in the panel, not a thrown error.
      setGames([]);
      setPgnError(pgnMessageFor(cause));
    }
  };

  const loadFromFile = (file: File) => {
    const reader = new FileReader();
    reader.onerror = () => setPgnError(t("editor.pgn.errors.file"));
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

  const onLoadPgn = (event: FormEvent) => {
    event.preventDefault();
    loadPgnText(pgnText);
  };

  const onLoadFen = (event: FormEvent) => {
    event.preventDefault();
    try {
      state.loadFen(fenText);
      setFenError(null);
    } catch (cause) {
      setFenError(
        t("editor.fen.error", {
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
    state.loadPosition(finalPositionOf(games[index]));
  };

  /**
   * The hand-offs. The FEN crosses the route boundary as a **query parameter**,
   * which is the only carrier that survives what a reader does with a link: it
   * is in the URL, so the position can be bookmarked, shared and reloaded, where
   * router state would be gone on the first refresh. Both destinations read it
   * once as their initial position — see the notes on `useAnalysisBoard` and
   * `usePlayWithEngine` — so this is the whole of the interface between them.
   */
  const handOffTo = (pathname: string) => () =>
    navigate({
      pathname,
      search: createSearchParams({ fen: state.fen }).toString(),
    });

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

  /*
    Dropping a PGN works over the board and over the panel alike. They are two
    separate subtrees once the panel is portalled out, so a single drop target
    cannot span them and both get the handlers.
  */
  const dropTargetProps = { onDragOver, onDragLeave, onDrop };

  const chessboardOptions: ChessboardOptions = {
    id: "board-editor",
    position: state.fen,
    boardOrientation: state.orientation,
    // Pieces are placed and taken away, never moved by a rule — so there is no
    // legality to check and no reason to ever disable dragging.
    onPieceDrop: ({ piece, sourceSquare, targetSquare }: PieceDropHandlerArgs) =>
      state.onPieceDrop({
        pieceType: piece.pieceType,
        isSparePiece: piece.isSparePiece,
        sourceSquare,
        targetSquare,
      }),
  };

  // The palettes are inside the square, so the board gives up the height they
  // take. Width alone, squared by aspect ratio — see the note above.
  const boardSide = `calc(100% - ${PALETTES_TOTAL_PX}px)`;

  return (
    <>
      <Box
        data-testid="board-editor-screen"
        {...dropTargetProps}
        sx={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          /*
            The two gaps are the rest of `PALETTES_TOTAL_PX`, so palette + gap +
            board + gap + palette comes to exactly the square the shell handed
            over. Any other value here and the column overflows it.
          */
          gap: `${PALETTE_GAP_PX}px`,
          borderRadius: 1,
          // An outline, not a border: it is painted outside the box model, so
          // switching it on does not shrink the board by its own width.
          outline: isDragOver ? "2px dashed" : "none",
          outlineOffset: "-2px",
          color: isDragOver ? "primary.main" : "inherit",
        }}
      >
        <ChessboardProvider options={chessboardOptions}>
          <PiecePalette color="b" onClear={() => state.clearColor("b")} />

          <Box
            data-testid="editor-board-square"
            sx={{
              width: boardSide,
              // Squared from the width rather than given a percentage height,
              // which would have to resolve through the provider above.
              aspectRatio: "1 / 1",
              // The width is already exact; never let flex shave a pixel off
              // it, which would make the board a rectangle.
              flexShrink: 0,
            }}
          >
            <Chessboard />
          </Box>

          <PiecePalette color="w" onClear={() => state.clearColor("w")} />
        </ChessboardProvider>
      </Box>

      <RightPanel>
        <Box
          {...dropTargetProps}
          sx={{
            flexGrow: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            borderRadius: 1,
            bgcolor: isDragOver ? "action.hover" : "transparent",
          }}
        >
          <Typography
            variant="caption"
            data-testid="editor-remove-hint"
            sx={{ flexShrink: 0, mb: 1, color: "text.secondary" }}
          >
            {t("editor.palette.removeHint")}
          </Typography>

          <EditorPanel
            state={state}
            onContinueToAnalysis={handOffTo("/tools/analysis")}
            onPlayFromHere={handOffTo("/engine/play")}
            onOpenInOpenings={handOffTo("/tools/openings")}
            fen={
              <FenSetup
                fenText={fenText}
                onFenTextChange={setFenText}
                onLoadFen={onLoadFen}
                error={fenError}
                currentFen={state.fen}
                canCopy={state.isValid}
              />
            }
            pgn={
              <PgnSetup
                games={games}
                selected={selected}
                onSelectGame={selectGame}
                error={pgnError}
                pgnText={pgnText}
                onPgnTextChange={setPgnText}
                onLoadPgn={onLoadPgn}
                onFileChosen={onFileChosen}
              />
            }
          />
        </Box>
      </RightPanel>
    </>
  );
}

export default BoardEditor;
