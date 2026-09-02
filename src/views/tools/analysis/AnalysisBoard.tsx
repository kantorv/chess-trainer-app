import {
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from "react";
import Box from "@mui/material/Box";
import { useTranslation } from "react-i18next";
import {
  Chessboard,
  type ChessboardOptions,
  type PieceDropHandlerArgs,
} from "react-chessboard";
import { FenParseError } from "../../../lib/fen";
import type { GameTree } from "../../../lib/gameTree";
import { EmptyPgnError, PgnParseError, parsePgnTrees } from "../../../lib/pgn";
import { RightPanel } from "../../main/rightPanel";
import EvalBar, {
  EVAL_BAR_GAP_PX,
  EVAL_BAR_TOTAL_PX,
} from "../../shared/EvalBar";
import PromotionPicker from "../../shared/PromotionPicker";
import AnalysisPanel from "./AnalysisPanel";
import PositionSetup from "./PositionSetup";
import { useAnalysisBoard } from "./useAnalysisBoard";

/**
 * Analysis Board — a position you set up, a game you play out for both sides,
 * and an engine you can switch off.
 *
 * The screen fills two of the shell's regions and draws no columns of its own:
 *
 * - the **board square** holds the evaluation bar and the board, side by side;
 * - the **right-hand panel** (`<RightPanel>`) holds `AnalysisPanel` — the
 *   Moves / Engine / Variations / Position tabs over the board controls.
 *
 * All the behaviour lives in `useAnalysisBoard`; this component is the layout,
 * the board options, and the ingestion state that the Position tab and the drop
 * targets share. `<RightPanel>` portals the panel out of this tree, so it still
 * shares this screen's state by closure and nothing is threaded through the
 * shell.
 *
 * ### How the eval bar and the board split the square
 *
 * The shell hands this screen a square of side S and computes it without knowing
 * anything about the bar (`Layout.tsx` is not changed for one). The bar takes a
 * fixed strip out of that square and the board gives up the width, so the board
 * is a `S - EVAL_BAR_TOTAL_PX` square. Bar width + gap must come to exactly that
 * constant and the board box needs `flexShrink: 0`, or flex shaves the
 * difference off and the board stops being square — which is why the switch that
 * hides the bar also drops the gap.
 */
function AnalysisBoard() {
  const { t } = useTranslation();
  const state = useAnalysisBoard();

  /*
    Ingestion state: what the reader has typed, what came out of the last
    multi-game file, and what went wrong. It lives here rather than in the hook
    because it is about the *forms*, not about the game — the hook takes a tree
    and knows nothing about where it came from.
  */
  const [games, setGames] = useState<readonly GameTree[]>([]);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pgnText, setPgnText] = useState("");
  const [fenText, setFenText] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);

  const topLine = state.analysis.lines.find((line) => line !== undefined);

  /** Turn a parse failure into a translated line; never let one escape. */
  const messageFor = (cause: unknown) => {
    if (cause instanceof EmptyPgnError) return t("analysis.position.errors.emptyPgn");
    if (cause instanceof PgnParseError) {
      return cause.gameNumber === undefined
        ? t("analysis.position.errors.pgn", { detail: cause.detail })
        : t("analysis.position.errors.pgnGame", {
            number: cause.gameNumber,
            detail: cause.detail,
          });
    }
    if (cause instanceof FenParseError) {
      return t("analysis.position.errors.fen", { detail: cause.detail });
    }
    return t("analysis.position.errors.pgn", {
      detail: cause instanceof Error ? cause.message : String(cause),
    });
  };

  const loadPgnText = (text: string) => {
    try {
      const parsed = parsePgnTrees(text);
      setGames(parsed);
      setSelected(0);
      setError(null);
      state.loadTree(parsed[0]);
    } catch (cause) {
      // A malformed PGN is a message in the panel, not a thrown error.
      setGames([]);
      setError(messageFor(cause));
    }
  };

  const loadFromFile = (file: File) => {
    const reader = new FileReader();
    reader.onerror = () => setError(t("analysis.position.errors.file"));
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
      setGames([]);
      setError(null);
    } catch (cause) {
      setError(messageFor(cause));
    }
  };

  const selectGame = (index: number) => {
    setSelected(index);
    state.loadTree(games[index]);
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

  /*
    Dropping a PGN works over the board and over the panel alike. They are two
    separate subtrees once the panel is portalled out, so a single drop target
    cannot span them and both get the handlers.
  */
  const dropTargetProps = { onDragOver, onDragLeave, onDrop };

  const chessboardOptions: ChessboardOptions = {
    id: "analysis-board",
    position: state.fen,
    boardOrientation: state.orientation,
    /*
      The move that produced the position on screen. External arrows are never
      cleared by the board itself (`.claude/rules/chessboard.md` §3.4), so this
      is the whole set for the current position, recomputed on every change.
    */
    arrows: state.arrows,
    onPieceDrop: ({ sourceSquare, targetSquare }: PieceDropHandlerArgs) =>
      state.onPieceDrop({ sourceSquare, targetSquare }),
    /*
      Both colours, from any position in the tree — playing a move from an
      earlier ply is how a variation is made, so unlike Play with Engine there is
      no "live position" to restrict dragging to. Only an open promotion picker
      stops a drag, because the move it is asking about has not been decided yet.
    */
    allowDragging: state.promotion === null,
  };

  // The bar is inside the square, so the board gives up its width. Without it
  // the board takes the whole square back.
  const boardSide = state.showEvalBar
    ? `calc(100% - ${EVAL_BAR_TOTAL_PX}px)`
    : "100%";

  return (
    <>
      <Box
        data-testid="analysis-board-screen"
        {...dropTargetProps}
        sx={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "flex-start",
          /*
            The gap is the other half of `EVAL_BAR_TOTAL_PX`, so bar + gap +
            board comes to exactly the square the shell handed over. Any other
            value here and the row overflows, flex shrinks the board, and it
            stops being square.
          */
          gap: state.showEvalBar ? `${EVAL_BAR_GAP_PX}px` : 0,
          borderRadius: 1,
          // An outline, not a border: it is painted outside the box model, so
          // switching it on does not shrink the board by its own width.
          outline: isDragOver ? "2px dashed" : "none",
          outlineOffset: "-2px",
          color: isDragOver ? "primary.main" : "inherit",
        }}
      >
        {state.showEvalBar && (
          <Box sx={{ height: boardSide, display: "flex" }}>
            <EvalBar
              score={topLine?.score ?? null}
              orientation={state.orientation}
              label={t("board.evalBar")}
            />
          </Box>
        )}

        {/*
          `position: relative` so the promotion picker, which is absolutely
          positioned in percentages of the board, has this box to measure
          against — it overlays the board exactly.
        */}
        <Box
          data-testid="analysis-board-square"
          sx={{
            position: "relative",
            width: boardSide,
            height: boardSide,
            // The width is already exact; never let flex shave a pixel off it,
            // which would make the board a rectangle.
            flexShrink: 0,
          }}
        >
          <Chessboard options={chessboardOptions} />

          {state.promotion && (
            <PromotionPicker
              targetSquare={state.promotion.to}
              orientation={state.orientation}
              // The side promoting is the side to move in the position the pawn
              // is being pushed from — both colours move here.
              color={state.turn}
              onSelect={state.resolvePromotion}
            />
          )}
        </Box>
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
          <AnalysisPanel
            state={state}
            position={
              <PositionSetup
                games={games}
                selected={selected}
                onSelectGame={selectGame}
                error={error}
                pgnText={pgnText}
                onPgnTextChange={setPgnText}
                onLoadPgn={onLoadPgn}
                onFileChosen={onFileChosen}
                fenText={fenText}
                onFenTextChange={setFenText}
                onLoadFen={onLoadFen}
                currentFen={state.fen}
                currentPgn={state.pgn}
              />
            }
          />
        </Box>
      </RightPanel>
    </>
  );
}

export default AnalysisBoard;
