import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import Switch from "@mui/material/Switch";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import FlagRoundedIcon from "@mui/icons-material/FlagRounded";
import ReplayRoundedIcon from "@mui/icons-material/ReplayRounded";
import { createSearchParams, Link as RouterLink, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { ChessboardOptions } from "react-chessboard";
import { DEFAULT_POSITION } from "chess.js";

import { isAnyMasked, maskedPieces } from "../../../lib/pieceMask";
import { PLAY_REFERENCE_KEY } from "../../../lib/gameReference";
import {
  PLAYED_GAMES_PATH,
  playedGameResult,
  type PlayedGameMask,
} from "../../../lib/playedGames";
import type { BoardPanelTab } from "../../board/core/BoardPanel";
import BoardShell from "../../board/core/BoardShell";
import { useVariationsExplorer } from "../../explorer/useVariationsExplorer";
import CurrentOpening from "../../shared/CurrentOpening";
import EngineThinking from "../../tools/analysis/EngineThinking";
import PlayToggleButton from "../../tools/analysis/PlayToggleButton";
import EngineSettings from "./EngineSettings";
import { usePlayGame, type PlayGameStart } from "./usePlayGame";

/**
 * **The screen a game against the engine is played on** — Play with Engine
 * (`/engine/play`, v2 since CTA-74) and, since CTA-79, Masked Pieces
 * (`/engine/masked`), which is this screen with a costume. Built like the
 * Analysis Board: the v2 core, the engine module and the shared variations
 * explorer, composed by `usePlayGame`, placed in `BoardShell` / `BoardPanel`
 * ([`.claude/rules/chessboard.md`](../../../../.claude/rules/chessboard.md) §9,
 * [`.claude/rules/tree-views.md`](../../../../.claude/rules/tree-views.md)).
 *
 * | Capability | Taken | Because |
 * | --- | --- | --- |
 * | Base | `useBoardCore` | a move from an earlier position is a side line |
 * | Engine | switch, on; its reply through **Play**, **on from the start** (`usePlayToggle`) | the Analysis Board's rule — the side not at the bottom, paused by a step back or a change of side |
 * | Tree view | `useVariationsExplorer` | Moves (side lines, evals, the move menu), the comment block, the next-moves bar and arrows — editing on, *Play chances…* off |
 * | Saving | `useAutosave` → `lib/playedGameStore.ts` | every move, no button; the flat list at `/engine/games` |
 *
 * **The header** carries the game's controls, the **back button to the
 * Lobby** first of all (`/engine/games`, CTA-91 — the way out of a game), then
 * the reader's **side** (White / Black — the board's orientation; a change
 * pauses Play), **Play**, **Replay** (start over; the game's saved progress
 * is discarded — asked first) and **Resign** (the reader's side loses —
 * asked first; the board then takes no more moves). **Tabs: Moves ·
 * Engine** — the Engine tab is the strength panel (`EngineSettings.tsx`) —
 * with no Map: a game is one tree on a board, and its lines are in the list.
 *
 * **A game that has ended** (a resignation, or the mainline's final position
 * through `playedGameResult`) shows its result in the footer beside an
 * **Open in analysis** button (CTA-91, lichess's game-over treatment) once
 * the autosave has written the game — the one record the reader is waiting
 * on for the link to name. It hands the game to the Analysis Board as
 * `?game=play/games/<id>` — the same reference the Lobby's Analysis row
 * builds, the true PGN, unmasked — and Replay takes it away again.
 *
 * **The costume** ({@link PlayScreenMasking}, Masked Pieces only) reaches
 * exactly the surfaces `.claude/rules/masked-pieces.md` lists and no others:
 * `options.pieces` and the captured strips' icons (`maskedPieces`), the
 * material diff (hidden while anything is masked), and — while its notation
 * switch is on — every move the explorer and the pinned lines print. It also
 * rides on the record, so the game resumes in it, and it adds a fourth tab
 * and a switch for the pinned lines. Nothing underneath changes: the core,
 * the engine and the store see the true game.
 *
 * **Arrivals, read once** (`arrivalOf`, `usePlayGame.ts`): `?fen=` (a position — the
 * reader plays the side to move, the board facing it) and `?saved=<id>` (a
 * played game, at the node and on the side it was left). Once the game is
 * written, the URL is `?saved=<its id>` (history replace), so a reload goes
 * on with it.
 */

/** Masked Pieces' costume, and what it adds to the screen (CTA-79). */
export type PlayScreenMasking = {
  /** The mask and the notation switch — drawn, printed and stored on the record. */
  costume: PlayedGameMask;
  /** Whether the pinned engine lines show — off by default on Masked Pieces. */
  showLines: boolean;
  /** The Masking tab, appended after Engine. */
  tab: BoardPanelTab;
};

/** The tab that stays mounted once opened: a game's move list, however long. */
const KEEP_MOUNTED = ["moves"] as const;

function PlayScreen({
  id,
  arrival,
  masking,
}: {
  /** `options.id`, and the root of every test id on the screen. */
  id: string;
  /** What the URL handed the screen — `arrivalOf`, read once by the route. */
  arrival: PlayGameStart;
  /** Masked Pieces' costume; absent, an ordinary game. */
  masking?: PlayScreenMasking;
}) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const costume = masking?.costume;
  const state = usePlayGame(arrival, costume);
  const { core, engine } = state;

  /*
    The costume, derived once per mask: the board's and the strips' renderers
    (a new object is a new `options.pieces`), and the mask the notation wears
    — only while its switch is on.
  */
  const pieces = useMemo(
    () => (costume === undefined ? undefined : maskedPieces(costume.pieces)),
    [costume],
  );
  const notationMask = costume?.notation === true ? costume.pieces : undefined;

  const [tab, setTab] = useState("moves");
  const [showArrows, setShowArrows] = useState(true);
  /** Which of the two game-ending actions is asking to be confirmed. */
  const [confirming, setConfirming] = useState<"replay" | "resign" | null>(null);

  const explorer = useVariationsExplorer({
    testId: id,
    source: core,
    evalsByFen: state.evalsByFen,
    onEditTree: core.replaceTree,
    playChances: false,
    annotations: true,
    arrows: { show: showArrows },
    // No map option (CTA-91): the game view has no Map tab, so nothing here
    // draws one.
    mask: notationMask,
  });
  const boardOptions: ChessboardOptions = {
    arrows: explorer.arrows,
    ...(pieces === undefined ? {} : { pieces }),
  };
  const topLine = engine.analysis.lines.find((line) => line !== undefined);

  /*
    The URL: `?saved=<id>` once the game is written — so a reload goes on with
    it — and until then what arrived. Written back with history replace.
  */
  const wanted =
    state.savedId !== null
      ? createSearchParams({ saved: state.savedId }).toString()
      : searchParams.toString();
  useEffect(() => {
    if (searchParams.toString() !== wanted) setSearchParams(wanted, { replace: true });
  }, [wanted, searchParams, setSearchParams]);

  const replay = () => {
    setConfirming(null);
    state.replay();
    // The discarded game's row is gone; the URL names nothing until the next
    // one is written — the start position it began from, if not the standard.
    const startFen = core.tree.startFen;
    setSearchParams(
      startFen === DEFAULT_POSITION ? "" : createSearchParams({ fen: startFen }).toString(),
      { replace: true },
    );
  };

  const hasMoves = core.tree.moves.length > 0;
  /*
    How the game stands (CTA-91): decided by a resignation, or by the
    mainline's final position on the board. What the footer's game-over
    treatment — the result line, and the Open-in-analysis link once the
    autosave has named a record — hangs on.
  */
  const result = playedGameResult(core.tree, state.resigned);

  return (
    <>
      <BoardShell
        id={id}
        core={core}
        score={topLine?.score ?? null}
        showEvalBar={state.engineOn && state.showEvalBar}
        boardOptions={boardOptions}
        overlay={explorer.overlay}
        capturedPieces={pieces}
        // The material diff is derived from the true pieces: under a mask it
        // is the leak §13 of the masking technique forbids. The lists stay,
        // drawn in costume.
        hideMaterialDiff={costume !== undefined && isAnyMasked(costume.pieces)}
        // A resigned game takes no more moves; it can still be stepped through.
        allowDragging={state.resigned === undefined}
        panel={{
          header: (
            <>
              {/*
                The way back to the Lobby (CTA-91), first of all: a game is
                one line on the board, and the way out is where it is on every
                board screen — the inline start. An arrow, named by where it
                goes rather than what it shows.
              */}
              <Tooltip title={t("playEngine.game.backToLobby")}>
                <IconButton
                  size="small"
                  component={RouterLink}
                  to="/engine/games"
                  aria-label={t("playEngine.game.backToLobby")}
                  data-testid={`${id}-back`}
                  sx={{ flexShrink: 0 }}
                >
                  <ArrowBackRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                <CurrentOpening fen={core.fen} testId={`${id}-current-opening`} />
              </Box>
              {/* The reader's side — the board's orientation. A change pauses Play. */}
              <ToggleButtonGroup
                exclusive
                size="small"
                value={state.settings.playAs}
                disabled={state.resigned !== undefined}
                aria-label={t("playEngine.settings.playAs")}
                data-testid={`${id}-side`}
                onChange={(_event, next: "white" | "black" | null) => {
                  if (next) state.updateSettings({ playAs: next });
                }}
                sx={{ flexShrink: 0 }}
              >
                <ToggleButton
                  value="white"
                  data-testid={`${id}-side-white`}
                  sx={{ py: 0.25, px: 1 }}
                >
                  {t("playEngine.settings.white")}
                </ToggleButton>
                <ToggleButton
                  value="black"
                  data-testid={`${id}-side-black`}
                  sx={{ py: 0.25, px: 1 }}
                >
                  {t("playEngine.settings.black")}
                </ToggleButton>
              </ToggleButtonGroup>
              <PlayToggleButton
                testId={`${id}-play`}
                engineOn={state.engineOn}
                playing={state.playing}
                thinking={state.thinking}
                onToggle={state.togglePlaying}
                disabled={state.resigned !== undefined}
              />
              <Tooltip title={t("playEngine.game.replay")}>
                <IconButton
                  size="small"
                  // Nothing played, nothing to discard: no need to ask.
                  onClick={() => (hasMoves ? setConfirming("replay") : replay())}
                  aria-label={t("playEngine.game.replay")}
                  data-testid={`${id}-replay`}
                  sx={{ flexShrink: 0 }}
                >
                  <ReplayRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title={t("playEngine.game.resign")}>
                <span>
                  <IconButton
                    size="small"
                    disabled={!state.canResign}
                    onClick={() => setConfirming("resign")}
                    aria-label={t("playEngine.game.resign")}
                    data-testid={`${id}-resign`}
                    sx={{ flexShrink: 0 }}
                  >
                    <FlagRoundedIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <FormControlLabel
                sx={{ flexShrink: 0, marginInlineEnd: 0 }}
                control={
                  <Switch
                    size="small"
                    checked={state.engineOn}
                    data-testid={`${id}-setting-engine`}
                    onChange={(event) => state.setEngineOn(event.target.checked)}
                  />
                }
                label={t("playEngine.settings.engineOn")}
              />
            </>
          ),
          analysis: engine.analysis,
          requestedMultiPv: state.settings.multiPv,
          engineOn: state.engineOn,
          // Present, so the pinned lines are clickable (CTA-55).
          onPlayVariation: core.playVariation,
          // Masked Pieces: off unless asked for, and in costume when shown.
          showVariations: masking?.showLines ?? true,
          /*
            The Lobby's Variations choice (CTA-90) seeds the block's own
            checkbox — the header stays the live control. Masked Pieces'
            switch owns the block there, so no seed is handed to fight it.
          */
          initialShowLines: masking === undefined ? state.showLines : undefined,
          mask: notationMask,
          activeTab: tab,
          onTabChange: setTab,
          keepMounted: KEEP_MOUNTED,
          tabs: [
            { id: "moves", label: t("playEngine.tabs.moves"), content: explorer.moves },
            {
              id: "engine",
              label: t("playEngine.tabs.engine"),
              content: (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  <FormControlLabel
                    sx={{ m: 0 }}
                    control={
                      <Switch
                        size="small"
                        checked={showArrows}
                        data-testid={`${id}-arrows`}
                        onChange={(event) => setShowArrows(event.target.checked)}
                      />
                    }
                    label={t("analysis.settings.arrows")}
                  />
                  <EngineSettings
                    settings={state.settings}
                    onChange={state.updateSettings}
                    engineOptions={engine.engineOptions}
                    showEvalBar={state.showEvalBar}
                    onShowEvalBarChange={state.setShowEvalBar}
                  />
                </Box>
              ),
            },
            ...(masking === undefined ? [] : [masking.tab]),
          ],
          footer: (
            <>
              {explorer.annotations}
              {state.problem !== null && (
                <Typography
                  variant="caption"
                  role="alert"
                  data-testid={`${id}-save-problem`}
                  sx={{ display: "block", color: "error.main", px: 1 }}
                >
                  {t("playedGames.problem.storage")}
                </Typography>
              )}
              {/*
                The game's ending (CTA-91), lichess's game-over treatment: the
                result stated — the resigned line that was already here, or
                its extension to the board's own decisions (mate, stalemate,
                a draw by rule) — with the way to analyse it, once the
                autosave's one record has landed and the link has an id to
                name. Replay starts a new game and takes the whole block away.
              */}
              {result !== "*" && (
                <>
                  {state.resigned === undefined ? (
                    <Typography
                      role="status"
                      variant="body2"
                      data-testid={`${id}-ended`}
                      sx={{ px: 1, py: 0.5, fontWeight: 600 }}
                    >
                      {t("playEngine.game.ended", { result })}
                    </Typography>
                  ) : (
                    <Typography
                      role="status"
                      variant="body2"
                      data-testid={`${id}-resigned`}
                      sx={{ px: 1, py: 0.5, fontWeight: 600 }}
                    >
                      {t("playEngine.game.resigned", { result })}
                    </Typography>
                  )}
                  {state.savedId !== null && (
                    <Button
                      component={RouterLink}
                      to={`/tools/analysis?game=${encodeURIComponent(
                        `${PLAY_REFERENCE_KEY}/${PLAYED_GAMES_PATH}/${state.savedId}`,
                      )}`}
                      size="small"
                      variant="contained"
                      data-testid={`${id}-open-analysis`}
                      sx={{ mx: 1, mb: 0.5 }}
                    >
                      {t("playEngine.game.openAnalysis")}
                    </Button>
                  )}
                </>
              )}
              {/* Play's status — the engine thinking, or the reader's move. */}
              {state.playing && (
                <EngineThinking
                  testId={`${id}-play`}
                  thinking={state.thinking}
                  depth={engine.analysis.fen === core.fen ? engine.analysis.depth : 0}
                />
              )}
              {tab === "moves" && explorer.nextMoves}
            </>
          ),
        }}
      />
      <Dialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        data-testid={`${id}-confirm`}
      >
        <DialogTitle>{t(`playEngine.game.${confirming ?? "replay"}Confirm.title`)}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t(`playEngine.game.${confirming ?? "replay"}Confirm.body`)}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirming(null)}>{t("playEngine.game.cancel")}</Button>
          <Button
            color="error"
            data-testid={`${id}-confirm-ok`}
            onClick={() => {
              if (confirming === "resign") {
                setConfirming(null);
                state.resign();
              } else {
                replay();
              }
            }}
          >
            {t(`playEngine.game.${confirming ?? "replay"}Confirm.confirm`)}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default PlayScreen;
