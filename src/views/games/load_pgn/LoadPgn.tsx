import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from "react";
import Box from "@mui/material/Box";
import { useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Chessboard, type ChessboardOptions } from "react-chessboard";
import { resolveGameReference } from "../../../lib/gameReference";
import { EmptyPgnError, PgnParseError, parsePgnGames } from "../../../lib/pgn";
import type { Game } from "../../../lib/gameModel";
import { RightPanel } from "../../main/rightPanel";
import GamePanel from "./GamePanel";
import PgnIngest from "./PgnIngest";
import { useGameNavigation } from "../../shared/useGameNavigation";

/**
 * Load PGN — a loaded game on a board, with everything about that game in the
 * shell's right-hand panel.
 *
 * The screen fills two of the shell's regions and draws no columns of its own:
 *
 * - the **board square** holds the board and nothing else, so it takes the
 *   largest square the shell can give it;
 * - the **right-hand panel** (`<RightPanel>`) holds `GamePanel` — the
 *   Moves / Info / Load PGN tabs, and the board controls under them.
 *
 * Keeping the controls in the panel rather than under the board is what lets
 * the board be as large as it is: the square is bounded by the window, not by
 * whatever height a control strip needed. `<RightPanel>` portals its content
 * out of this component's tree, so the panel still shares this screen's state
 * by closure — nothing is threaded through the shell.
 *
 * This component owns the state and the parsing seam; the panel's pieces are
 * presentational and take props, so each renders against a fixture on its own.
 *
 * ### Arriving with a game
 *
 * `/games/load-pgn?game=<reference>` opens on a game out of a library, without
 * anything having been pasted — the User PGNs hand-off. The reference is
 * resolved through the catalog (`lib/gameReference.ts`) and taken as *initial*
 * state, because arriving at the URL mounts the screen; a reference that names
 * nothing opens the empty screen, exactly as a mistyped `?fen=` does elsewhere.
 *
 * It opens at **ply 0**, where a pasted game opens at its final position. The
 * difference is not an inconsistency: a paste opens at the end because that is
 * the proof it all parsed, while a game a reader picked out of a library and
 * asked to open is one they mean to replay — and a replay starts at the start.
 */

function LoadPgn() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();

  /*
    Resolved once. Only the first render's value is ever used, but looking the
    reference up on every render would walk the catalog for nothing.
  */
  const requestedGame = searchParams.get("game");
  const arrived = useMemo(
    () => resolveGameReference(requestedGame),
    [requestedGame],
  );

  const [games, setGames] = useState<readonly Game[]>(() =>
    arrived === undefined ? [] : [arrived.game],
  );
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pgnText, setPgnText] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [orientation, setOrientation] = useState<"white" | "black">("white");

  /* What the paste box last submitted, so blurring an untouched box is a no-op. */
  const lastPastedRef = useRef("");

  const current = games[selected];

  /*
    Ply navigation for the game on screen: the board's position and arrow both
    come from the selected half-move, and the panel drives it. No `chess.js`
    instance here on purpose — every ply already carries the FEN of the position
    after it (`lib/pgn.ts`), so nothing needs re-simulating.
  */
  const { ply, lastPly, fen, arrows, goToPly } = useGameNavigation(current);

  /*
    A freshly loaded game opens on its final position — the most informative
    single frame, and proof the whole game parsed. Stepping back from there is
    what the controls and the arrow keys are for; the start is one click away.
  */
  const showGame = (game: Game) => goToPly(game.moves.length);

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

  const flipBoard = () =>
    setOrientation((side) => (side === "white" ? "black" : "white"));

  const chessboardOptions: ChessboardOptions = {
    id: "load-pgn-board",
    position: fen,
    boardOrientation: orientation,
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

  /*
    Dropping a PGN works over the board and over the panel alike. They are two
    separate subtrees once the panel is portalled out, so a single drop target
    cannot span them and both get the handlers.
  */
  const dropTargetProps = { onDragOver, onDragLeave, onDrop };

  return (
    <>
      {/*
        The shell's square, filled edge to edge by the board. The drag highlight
        is an `outline`, not a `border`: an outline is painted outside the box
        model, so switching it on does not shrink the board by its own width.
        It takes its colour from `currentColor`.
      */}
      <Box
        data-testid="load-pgn-screen"
        {...dropTargetProps}
        sx={{
          width: "100%",
          height: "100%",
          borderRadius: 1,
          outline: isDragOver ? "2px dashed" : "none",
          outlineOffset: "-2px",
          color: isDragOver ? "primary.main" : "inherit",
        }}
      >
        <Chessboard options={chessboardOptions} />
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
          <GamePanel
            game={current}
            ply={ply}
            lastPly={lastPly}
            onSelectPly={goToPly}
            onFlip={flipBoard}
            ingest={
              <PgnIngest
                games={games}
                selected={selected}
                error={error}
                pgnText={pgnText}
                onPgnTextChange={setPgnText}
                onFileChosen={onFileChosen}
                onSubmit={submitPasted}
                onPasteBlur={onPasteBlur}
                onSelectGame={selectGame}
              />
            }
          />
        </Box>
      </RightPanel>
    </>
  );
}

export default LoadPgn;
