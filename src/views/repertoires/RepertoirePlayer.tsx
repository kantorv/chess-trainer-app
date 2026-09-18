import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import Switch from "@mui/material/Switch";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import PauseRoundedIcon from "@mui/icons-material/PauseRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import RestartAltRoundedIcon from "@mui/icons-material/RestartAltRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import { Link as RouterLink, useLocation, useNavigate, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { Arrow, ChessboardOptions } from "react-chessboard";

import {
  ANALYSIS_UCI_OPTION,
  DEFAULT_ANALYSIS_SETTINGS,
  type AnalysisSettings,
} from "../../lib/analysisSettings";
import {
  emptyTree,
  findNode,
  pathTo,
  type GameTree,
  type VariationNode,
} from "../../lib/gameTree";
import { downloadPgn } from "../../lib/pgnExport";
import { atParamOf, nodeAtParam, REPERTOIRE_AT_PARAM } from "../../lib/repertoireLink";
import { slugify } from "../../lib/pgnLibrary";
import type { RepertoireGameId } from "../../lib/repertoireGames";
import {
  drillAccuracy,
  extensionIdsOf,
  nodeIdsOf,
  type DrillScore,
} from "../../lib/repertoireTrainer";
import {
  newSavedRepertoireId,
  repertoireCopyOf,
  repertoireTreeOf,
  withRepertoireTree,
  type SavedRepertoire,
} from "../../lib/savedRepertoires";
import {
  addRepertoires,
  saveRepertoire,
  type SavedRepertoireProblem,
} from "../../lib/savedRepertoireStore";
import BoardShell from "../dev/core/BoardShell";
import TreeMoveList from "../dev/core/TreeMoveList";
import { useBoardCore } from "../dev/core/useBoardCore";
import { useEngineModule } from "../dev/core/useEngineModule";
import { useTrainerModule, type TrainerStatus } from "../dev/core/useTrainerModule";
import CurrentOpening from "../shared/CurrentOpening";
import AnalysisSettingsPanel from "../tools/analysis/AnalysisSettings";
import NextMovesBar from "../tools/analysis/NextMovesBar";
import {
  nextMoveArrowsOf,
  REQUIRED_MOVE_ARROW_COLOR,
} from "../tools/analysis/nextMoveArrows";
import RepertoireChangesBar from "./RepertoireChangesBar";
import RepertoireGamesMenu from "./RepertoireGamesMenu";
import RepertoireMap from "./RepertoireMap";
import { useRepertoireGame } from "./useRepertoireGame";

/**
 * **A repertoire, played** (CTA-63) — the one screen behind a repertoire's own
 * view (`/repertoires/<id>`, the **player**) and its games
 * (`/repertoires/<id>/games/<game>`, {@link RepertoireGameId}). The route
 * files (`RepertoireBoard.tsx`, `RepertoireGame.tsx`) resolve the record and
 * hand it here with or without a `game`.
 *
 * Composed from the v2 core
 * ([`.claude/rules/chessboard-v2.md`](../../../.claude/rules/chessboard-v2.md)):
 *
 * | Capability | Taken | Because |
 * | --- | --- | --- |
 * | Base | `useBoardCore({ orientation })` | facing the reader's side; both colours move from any node — a reader tries moves against the file, and past a line's end plays both |
 * | Trainer | `useTrainerModule` | the opponent: in the player behind the **Autoplay** setting (off by default), always on in a game — see that file for the "replies to a move, never to a position" rule |
 * | Game | `useRepertoireGame` | a game's score, finished lines and coverage; inert in the player |
 * | Engine | switch, **off by default**, **no reply** | the pinned best-variations block and the eval bar when asked for; it never moves a piece |
 * | Autosave | ❌ | the session is the reader's, the record is the file's |
 *
 * ## The rules of a session — the player and every game
 *
 * - **The reader picks a side** (Settings), defaulting to the repertoire's main
 *   color; the board faces it. Changing side, and "Restart", go back to the
 *   start and **keep** what the reader added.
 * - **Every move the repertoire does not have is an extension** — added under
 *   the node on screen and tinted in the move list; `extensionIdsOf` against
 *   the ids the repertoire arrived with (or last saved), recomputed, never
 *   tracked. The header's download writes them out; the Engine tab's "Clear"
 *   drops them.
 * - **Changes are kept on the reader's say-so** (the player's; a game never
 *   writes). While the session's tree differs from the record, the header's
 *   **Save** button (disabled while nothing has changed) takes the primary
 *   colour, and a click on it opens a strip above the footer
 *   (`RepertoireChangesBar.tsx`) that offers **Update this repertoire**
 *   (`withRepertoireTree`, in place — the session becomes the record, and the
 *   additions stop being additions; on a **protected** repertoire — its
 *   settings, on by default — the strip says so and offers a link to its
 *   settings in Update's place),
 *   **Save as a copy** (`repertoireCopyOf` —
 *   a new record with the original's settings and folder, opened at the
 *   position on screen, the original untouched: how a shipped repertoire
 *   becomes one's own) and **Discard**. A reload with changes unsaved asks
 *   first. Nothing is ever written unasked.
 * - **The Moves tab is the variations explorer** (CTA-64, the player's
 *   only): a right-click on a move promotes its line, makes it the main line,
 *   deletes from it (asking first) or copies its PGN. An edit goes through
 *   the core's `replaceTree`, which keeps the reader where they stand, and is
 *   a session change like any other — the Save button, the strip, the Map
 *   and `?at=` all follow the edited tree.
 * - **Tabs: Moves · (Score) · Map · Settings · Engine.** Settings holds the
 *   side, Autoplay (player only — and the header's **Play** button, a second
 *   control over the same state), the next-move arrows and the engine's
 *   switch; the Engine tab is disabled while the engine is off; Score is a
 *   game's; the Map (`RepertoireMap.tsx`) is the player's — its full-screen
 *   dots links to their positions — and Backtracking's, with the coverage.
 *   Get to the end has none.
 * - **The player's URL is a permanent link** to the position on screen:
 *   `?at=<SANs from the start>` (`lib/repertoireLink.ts`), read once when the
 *   tree lands, written back on every step with history replace.
 * - **Arrows are the reader's call**: every continuation at the node on
 *   screen, the mainline's move in its own colour (`nextMoveArrowsOf`). The
 *   player opens as the repertoire's settings say (`showArrows`, on by
 *   default); a game opens without them. The Settings tab switches them for
 *   the session. In the player, hovering the next-moves bar draws the hovered
 *   move's arrow either way.
 *
 * ## A game is the player with rules
 *
 * A game turns the trainer on for good and puts it in **game mode** (`drill`:
 * the reader's moves inside the repertoire judged before they are made, a
 * wrong one taken back, one verdict per position), with a **Score** tab that
 * opens first. The game's own rules come from `useRepertoireGame`:
 *
 * - **Get to the end** — the trainer picks at random; reaching the end of a
 *   line finishes it (counted), and Restart starts another.
 * - **Backtracking** — every line is to be covered. The trainer steers to
 *   uncovered lines; where only some of the reader's moves still lead to one,
 *   those are **required** — a purple arrow and a status line say so, and a
 *   finished line's move is refused (not a failure). When a line ends, play
 *   goes **back** to the deepest position with an uncovered line under it, and
 *   goes on from there until every line is covered. A **Map** tab draws the
 *   repertoire as a tree (`RepertoireMap.tsx`): covered lines, the rest, and
 *   where the reader is.
 *
 * The tree is parsed after a paint, behind a `setTimeout(0)`: the 9,146-node
 * example takes about a second.
 */

/**
 * The tabs that stay mounted once opened — see `BoardPanel`'s `keepMounted`.
 * The Moves list of a 9,000-node repertoire takes most of a second to mount;
 * the Map keeps where the reader panned and zoomed it.
 */
const KEEP_MOUNTED = ["moves", "map"] as const;

/** How long a finished line stays on screen before Backtracking goes back. */
export const BACKTRACK_DELAY_MS = 900;

/** Whether the repertoire's tree is on the board yet. */
type Shown = "loading" | "ready" | "unreadable";

type Side = "white" | "black";

/** What the status line says — the trainer's status, or a game's own. */
type PlayStatus =
  | TrainerStatus
  | "line-complete"
  | "line-covered"
  | "all-covered"
  | "required";

const STATUS_KEY: Record<PlayStatus, string> = {
  "trainer-thinking": "repertoires.play.status.thinking",
  "your-move": "repertoires.play.status.yourMove",
  "out-of-book": "repertoires.play.status.outOfBook",
  "try-again": "repertoires.play.status.tryAgain",
  "line-complete": "repertoires.play.status.lineComplete",
  "line-covered": "repertoires.play.status.lineCovered",
  "all-covered": "repertoires.play.status.allCovered",
  required: "repertoires.play.status.required",
};

const STATUS_COLOR: Partial<Record<PlayStatus, string>> = {
  "out-of-book": "success.main",
  "line-complete": "success.main",
  "line-covered": "success.main",
  "all-covered": "success.main",
  "try-again": "error.main",
  required: "secondary.main",
};

/** A tree nothing holds yet — what the trainer answers from while reading. */
const NOTHING_YET: GameTree = emptyTree();

function RepertoirePlayer({
  saved,
  game,
}: {
  saved: SavedRepertoire;
  /** A game to play; none is the repertoire's own view. */
  game?: RepertoireGameId;
}) {
  const { t } = useTranslation();
  // `options.id`, and the root of every test id here.
  const id = game === undefined ? "repertoire-board" : "repertoire-game";
  const boardPath = `/repertoires/${encodeURIComponent(saved.id)}`;

  const [side, setSide] = useState<Side>(saved.settings.color);
  const trainerColor = side === "white" ? "b" : "w";
  const core = useBoardCore({ orientation: saved.settings.color });
  const { loadTree, goToNode, setOrientation } = core;

  /** The repertoire as it arrived — what the trainer answers from. */
  const [repertoire, setRepertoire] = useState<GameTree>(NOTHING_YET);
  const [shown, setShown] = useState<Shown>("loading");

  /** The player's trainer switch; a game always plays. */
  const [autoplay, setAutoplay] = useState(false);

  const rules = useRepertoireGame({
    game,
    repertoire,
    nodeId: core.nodeId,
    turn: core.turn,
    trainerColor,
  });

  const trainer = useTrainerModule({
    enabled: shown === "ready" && (game !== undefined || autoplay),
    core,
    repertoire,
    trainerColor,
    policy: rules.policy,
    drill: game !== undefined,
    onJudged: rules.onJudged,
    required: rules.required,
  });
  const { requestReply } = trainer;

  /** Whether the node on screen is a line's end, just reached by play (games). */
  const finished = rules.finishedLine(trainer.arrival);
  const backTo =
    game === "backtrack" && finished && core.nodeId !== null
      ? rules.backFrom(core.nodeId)
      : undefined;

  /*
    Backtracking goes back once a finished line has been seen: to the deepest
    position with a line still to cover, where the trainer answers if it is
    its turn. Navigating away first cancels it; a finished game stays put.
  */
  useEffect(() => {
    if (backTo === undefined) return;
    const timer = setTimeout(() => {
      goToNode(backTo);
      requestReply(backTo);
    }, BACKTRACK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [backTo, goToNode, requestReply]);

  /*
    The player's permanent link: `?at=<the moves from the start>`
    (`lib/repertoireLink.ts`). Read once — arriving is what mounts the screen
    — and applied when the tree lands; a game ignores it.
  */
  const [searchParams, setSearchParams] = useSearchParams();
  const [arrivedAt] = useState(() =>
    game === undefined ? searchParams.get(REPERTOIRE_AT_PARAM) : null,
  );

  /*
    The parse, behind a timer (the header note). Only the timer's callback
    writes state. The session starts where the link says — the start position
    without one — with a reply owed there, paid only when the trainer plays
    and it is its turn.
  */
  /*
    The record as the screen opened it — parsed once. Saving the session's
    changes writes a new record under the same id (the route hands it back as
    `saved`), and re-parsing that would put the reader back at the start with
    fresh ids for the tree they are standing in.
  */
  const [opened] = useState(saved);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    timer.current = setTimeout(() => {
      timer.current = null;
      const parsed = repertoireTreeOf(opened);
      const tree = parsed ?? emptyTree();
      const at = nodeAtParam(tree, arrivedAt);
      setRepertoire(tree);
      loadTree(tree);
      // After `loadTree`, whose own step is to the start: the last one wins.
      if (at !== null) goToNode(at);
      requestReply(at);
      setShown(parsed === undefined ? "unreadable" : "ready");
    }, 0);
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, [arrivedAt, goToNode, loadTree, requestReply, opened]);

  /*
    …and written back as the reader moves, with history **replace** (the
    library detail's `?move=` rule), so the address bar is always a permanent
    link to the position on screen and Back leaves the screen rather than
    stepping through it. Only once the tree is on the board, or the link it
    arrived with would be wiped before it was read.
  */
  const linkedAt = useMemo(
    () => (game === undefined && shown === "ready" ? atParamOf(core.tree, core.nodeId) : undefined),
    [game, shown, core.tree, core.nodeId],
  );
  useEffect(() => {
    if (linkedAt === undefined) return;
    if ((searchParams.get(REPERTOIRE_AT_PARAM) ?? "") === linkedAt) return;
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (linkedAt === "") next.delete(REPERTOIRE_AT_PARAM);
        else next.set(REPERTOIRE_AT_PARAM, linkedAt);
        return next;
      },
      { replace: true },
    );
  }, [linkedAt, searchParams, setSearchParams]);
  const location = useLocation();

  const [tab, setTab] = useState(game === undefined ? "moves" : "score");

  /*
    The engine, off by default. No `onBestMove`: it never moves a piece.
  */
  const [engineOn, setEngineOn] = useState(false);
  const [settings, setSettings] = useState<AnalysisSettings>(DEFAULT_ANALYSIS_SETTINGS);
  const [showEvalBar, setShowEvalBar] = useState(true);
  const onUciOptionsReady = useCallback(
    (clamped: Readonly<Record<string, number>>) =>
      setSettings((current) => {
        const multiPv = clamped[ANALYSIS_UCI_OPTION.multiPv] ?? current.multiPv;
        return multiPv === current.multiPv ? current : { ...current, multiPv };
      }),
    [],
  );
  const engine = useEngineModule({
    enabled: engineOn,
    fen: core.fen,
    depth: settings.depth,
    moveTimeMs: settings.moveTimeMs,
    uciOptions: useMemo(
      () => ({ [ANALYSIS_UCI_OPTION.multiPv]: settings.multiPv }),
      [settings.multiPv],
    ),
    onUciOptionsReady,
  });
  const topLine = engine.analysis.lines.find((line) => line !== undefined);

  // The repertoire's own view opens as its settings say (on unless the reader
  // turned them off); a game opens without — a drill must not show the answer.
  const [showArrows, setShowArrows] = useState(
    game === undefined && saved.settings.showArrows,
  );
  const [hovered, setHovered] = useState<VariationNode | null>(null);
  const continuations = useMemo(
    () =>
      core.nodeId === null
        ? core.tree.moves
        : (findNode(core.tree, core.nodeId)?.children ?? []),
    [core.tree, core.nodeId],
  );

  // A required move is an instruction, so it is drawn whatever the switch says.
  const arrows: Arrow[] =
    rules.required !== undefined
      ? rules.required.map((node) => ({
          startSquare: node.from,
          endSquare: node.to,
          color: REQUIRED_MOVE_ARROW_COLOR,
        }))
      : showArrows
        ? nextMoveArrowsOf(continuations, hovered?.id ?? null)
        : hovered !== null
          ? nextMoveArrowsOf([hovered], hovered.id)
          : [];
  const boardOptions: ChessboardOptions = { arrows };

  const originalIds = useMemo(() => nodeIdsOf(repertoire), [repertoire]);
  const extensionIds = useMemo(
    () => extensionIdsOf(core.tree, originalIds),
    [core.tree, originalIds],
  );

  /*
    The map: the player's draws the session — the repertoire and what was
    added, as it is added — so its marker is simply the node on screen.
    Backtracking's draws the repertoire its coverage is defined on: inside a
    line the reader added, its marker waits on the last repertoire position.
  */
  const hasMap = game !== "end";
  const mapNodeId = useMemo(() => {
    if (!hasMap) return null;
    if (game === undefined) return core.nodeId;
    const path = pathTo(core.tree, core.nodeId);
    for (let index = path.length - 1; index >= 0; index -= 1) {
      if (originalIds.has(path[index].id)) return path[index].id;
    }
    return null;
  }, [hasMap, game, core.tree, core.nodeId, originalIds]);

  /** Back to the start, extensions kept; the trainer answers if it is White. */
  const restart = useCallback(() => {
    goToNode(null);
    requestReply(null);
  }, [goToNode, requestReply]);

  const changeSide = (next: Side | null) => {
    if (next === null || next === side) return;
    setSide(next);
    setOrientation(next);
    restart();
  };

  /** Autoplay switched on answers at once if it is the trainer's turn here. */
  const changeAutoplay = (next: boolean) => {
    setAutoplay(next);
    if (next) requestReply(core.nodeId);
  };

  /*
    The session's changes, and what to do with them (the player's; a game
    never writes). "Changed" is the tree not being the one last opened or
    saved: every edit to a tree makes a new one, and replaying a move that is
    there does not (`addMove`), so this holds for the moves added today and
    for any edit that comes later, with nothing to keep in step.
  */
  const navigate = useNavigate();
  const changed = game === undefined && shown === "ready" && core.tree !== repertoire;
  const [saveProblem, setSaveProblem] = useState<SavedRepertoireProblem | null>(null);

  /*
    The strip is opened from the header's Save button, not shown the moment
    something changes: the button — disabled while nothing has, coloured
    while something has — is the signal, and the strip the choice. Once the
    changes are saved or dropped it closes itself (adjusted during render,
    `react-hooks/set-state-in-effect`).
  */
  const [changesOpen, setChangesOpen] = useState(false);
  if (changesOpen && !changed) setChangesOpen(false);

  /** Make the changes part of this repertoire; the session is the record now. */
  const updateRecord = () => {
    // A protected repertoire has no Update in the strip; belt and braces.
    if (saved.settings.protected) return;
    const problem = saveRepertoire(withRepertoireTree(saved, core.tree));
    setSaveProblem(problem ?? null);
    if (problem === undefined) setRepertoire(core.tree);
  };

  /** Keep this repertoire as it is; save a copy with the changes, and go on in it. */
  const saveCopy = () => {
    const copyId = newSavedRepertoireId();
    const name = t("repertoires.changes.copyName", {
      name: saved.name || t("repertoires.untitled"),
    });
    const problem = addRepertoires([repertoireCopyOf(saved, core.tree, copyId, name)]);
    setSaveProblem(problem ?? null);
    if (problem !== undefined) return;
    const at = atParamOf(core.tree, core.nodeId);
    const query = at === "" ? "" : `?${new URLSearchParams({ [REPERTOIRE_AT_PARAM]: at })}`;
    navigate(`/repertoires/${encodeURIComponent(copyId)}${query}`);
  };

  /** Drop the changes, standing on the last repertoire position on the way here. */
  const discard = () => {
    const path = pathTo(core.tree, core.nodeId);
    let back: string | null = null;
    for (let index = path.length - 1; index >= 0; index -= 1) {
      if (originalIds.has(path[index].id)) {
        back = path[index].id;
        break;
      }
    }
    loadTree(repertoire);
    if (back !== null) goToNode(back);
    requestReply(back);
    setSaveProblem(null);
  };

  // Leaving with changes unsaved — a reload, a closed tab — asks first.
  useEffect(() => {
    if (!changed) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changed]);

  /** The Engine tab's "Clear": the repertoire as the record has it, from the start. */
  const clear = () => {
    loadTree(repertoire);
    requestReply(null);
  };

  const download = () =>
    downloadPgn(slugify(saved.name) || "repertoire", [core.pgn]);

  const status: PlayStatus = finished
    ? game === "end"
      ? "line-complete"
      : backTo === undefined
        ? "all-covered"
        : "line-covered"
    : rules.required !== undefined && trainer.status === "your-move"
      ? "required"
      : trainer.status;

  const reading = shown === "loading" && (
    <Box
      data-testid={`${id}-line-loading`}
      sx={{ display: "flex", alignItems: "center", gap: 1, p: 1, color: "text.secondary" }}
    >
      <CircularProgress size={16} />
      <Typography variant="body2">{t("repertoires.detail.loading")}</Typography>
    </Box>
  );

  const statusLine = (
    <Typography
      variant="body2"
      data-testid={`${id}-status`}
      data-status={status}
      sx={{ px: 1, py: 0.5, color: STATUS_COLOR[status] ?? "text.secondary" }}
    >
      {t(STATUS_KEY[status])}
    </Typography>
  );

  return (
    <BoardShell
      id={id}
      // The reader's moves go through the trainer's wrappers, which note that
      // a move was made (the one thing the trainer replies to) and, in a game,
      // judge it first.
      core={{
        ...core,
        onPieceDrop: trainer.onPieceDrop,
        resolvePromotion: trainer.resolvePromotion,
      }}
      score={topLine?.score ?? null}
      showEvalBar={engineOn && showEvalBar}
      boardOptions={boardOptions}
      panel={{
        header: (
          <>
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography
                variant="subtitle2"
                data-testid={`${id}-name`}
                sx={{ fontWeight: 700, lineHeight: 1.3 }}
                noWrap
              >
                {saved.name || t("repertoires.untitled")}
              </Typography>
              {game !== undefined ? (
                <Typography
                  variant="caption"
                  data-testid={`${id}-title`}
                  sx={{ color: "text.secondary", display: "block" }}
                  noWrap
                >
                  {t(`repertoires.games.${game}.title`)}
                </Typography>
              ) : (
                saved.settings.description !== "" && (
                  // The reader's own notes on it: one line here, all of it on hover.
                  <Typography
                    variant="caption"
                    data-testid={`${id}-description`}
                    dir="auto"
                    title={saved.settings.description}
                    sx={{ color: "text.secondary", display: "block" }}
                    noWrap
                  >
                    {saved.settings.description}
                  </Typography>
                )
              )}
              <CurrentOpening fen={core.fen} testId={`${id}-opening`} />
            </Box>
            {shown === "loading" && (
              <CircularProgress
                size={16}
                data-testid={`${id}-reading`}
                aria-label={t("repertoires.detail.loading")}
                sx={{ flexShrink: 0 }}
              />
            )}
            {game === undefined && (
              <RepertoireGamesMenu id={saved.id} testId={`${id}-games`} />
            )}
            {game === undefined && (
              <Tooltip
                title={t(
                  changed ? "repertoires.changes.saveOpen" : "repertoires.changes.saveNothing",
                )}
              >
                <span>
                  <IconButton
                    size="small"
                    disabled={!changed}
                    color={changed ? "primary" : "default"}
                    onClick={() => setChangesOpen((open) => !open)}
                    aria-label={t("repertoires.changes.saveOpen")}
                    aria-pressed={changed ? changesOpen : undefined}
                    data-testid={`${id}-save`}
                    sx={{ flexShrink: 0 }}
                  >
                    <SaveRoundedIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            )}
            {game === undefined && (
              // A second control over the Settings tab's Autoplay: one state, so
              // the two cannot disagree. A game's trainer always plays — no toggle.
              <Tooltip title={t(autoplay ? "repertoires.play.autoplayOff" : "repertoires.play.autoplayOn")}>
                <IconButton
                  size="small"
                  color={autoplay ? "primary" : "default"}
                  onClick={() => changeAutoplay(!autoplay)}
                  aria-label={t(autoplay ? "repertoires.play.autoplayOff" : "repertoires.play.autoplayOn")}
                  aria-pressed={autoplay}
                  data-testid={`${id}-play`}
                  sx={{ flexShrink: 0 }}
                >
                  {autoplay ? (
                    <PauseRoundedIcon fontSize="small" />
                  ) : (
                    <PlayArrowRoundedIcon fontSize="small" />
                  )}
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title={t("repertoires.play.restart")}>
              <IconButton
                size="small"
                onClick={restart}
                aria-label={t("repertoires.play.restart")}
                data-testid={`${id}-restart`}
                sx={{ flexShrink: 0 }}
              >
                <RestartAltRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={t("repertoires.play.download")}>
              <span>
                <IconButton
                  size="small"
                  onClick={download}
                  disabled={shown !== "ready"}
                  aria-label={t("repertoires.play.download")}
                  data-testid={`${id}-download`}
                  sx={{ flexShrink: 0 }}
                >
                  <DownloadRoundedIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            {game === undefined ? (
              <Tooltip title={t("repertoires.settings.open")}>
                <IconButton
                  size="small"
                  component={RouterLink}
                  to={`${boardPath}/settings`}
                  // Back to this position, link and all.
                  state={{ from: `${boardPath}${location.search}` }}
                  aria-label={t("repertoires.settings.open")}
                  data-testid={`${id}-settings`}
                  sx={{ flexShrink: 0 }}
                >
                  <SettingsRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            ) : (
              <Tooltip title={t("repertoires.play.back")}>
                <IconButton
                  size="small"
                  component={RouterLink}
                  to={boardPath}
                  aria-label={t("repertoires.play.back")}
                  data-testid={`${id}-back`}
                  sx={{ flexShrink: 0 }}
                >
                  <ArrowBackRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </>
        ),
        analysis: engine.analysis,
        requestedMultiPv: settings.multiPv,
        engineOn,
        onPlayVariation: core.playVariation,
        // A disabled tab is never the one showing.
        activeTab: tab === "engine" && !engineOn ? "settings" : tab,
        onTabChange: setTab,
        keepMounted: KEEP_MOUNTED,
        tabs: [
          {
            id: "moves",
            label: t("repertoires.detail.tabs.moves"),
            content:
              reading ||
              (shown === "unreadable" ? (
                <Typography variant="body2" sx={{ p: 1, color: "text.secondary" }}>
                  {t("repertoires.detail.unreadable")}
                </Typography>
              ) : (
                <TreeMoveList
                  tree={core.tree}
                  mainlineNodes={core.mainlineNodes}
                  nodeId={core.nodeId}
                  onSelectNode={core.goToNode}
                  extensionIds={extensionIds}
                  evalsByFen={engine.evalsByFen}
                  // The variations explorer's move menu (CTA-64): the
                  // player's only — a game never writes.
                  onEditTree={game === undefined ? core.replaceTree : undefined}
                />
              )),
          },
          ...(game !== undefined
            ? [
                {
                  id: "score",
                  label: t("repertoires.play.tabs.score"),
                  content: (
                    <PlayScore
                      id={id}
                      score={rules.score}
                      onReset={rules.resetScore}
                      lines={
                        game === "backtrack"
                          ? t("repertoires.play.score.covered", {
                              covered: rules.coverage.total - rules.coverage.under(null),
                              total: rules.coverage.total,
                            })
                          : t("repertoires.play.score.finished", {
                              count: rules.linesFinished,
                            })
                      }
                      onStartOver={
                        game === "backtrack"
                          ? () => {
                              rules.resetCoverage();
                              restart();
                            }
                          : undefined
                      }
                    />
                  ),
                },
              ]
            : []),
          // The map of the whole repertoire — the player's, and Backtracking's
          // with its coverage: where you are, how much is left.
          ...(hasMap
            ? [
                {
                  id: "map",
                  label: t("repertoires.play.tabs.map"),
                  content:
                    shown === "ready" ? (
                      <RepertoireMap
                        testId={`${id}-map`}
                        repertoire={game === undefined ? core.tree : repertoire}
                        addedIds={game === undefined ? extensionIds : undefined}
                        coverage={game === "backtrack" ? rules.coverage : undefined}
                        nodeId={mapNodeId}
                        // The player's full-screen map: a dot is a link to its
                        // position. A game's is not — no skipping ahead.
                        onSelectNode={game === undefined ? core.goToNode : undefined}
                      />
                    ) : (
                      reading || null
                    ),
                },
              ]
            : []),
          {
            id: "settings",
            label: t("repertoires.play.tabs.settings"),
            content: (
              <PlaySettings
                id={id}
                side={side}
                onSideChange={changeSide}
                autoplay={game === undefined ? autoplay : undefined}
                onAutoplayChange={changeAutoplay}
                showArrows={showArrows}
                onShowArrowsChange={setShowArrows}
                engineOn={engineOn}
                onEngineOnChange={setEngineOn}
              />
            ),
          },
          {
            id: "engine",
            label: t("repertoires.detail.tabs.engine"),
            // Its subject is switched off in Settings until the reader asks.
            disabled: !engineOn,
            content: (
              <AnalysisSettingsPanel
                settings={settings}
                onChange={(patch: Partial<AnalysisSettings>) =>
                  setSettings((current) => ({ ...current, ...patch }))
                }
                engineOptions={engine.engineOptions}
                engineOn={engineOn}
                showEvalBar={showEvalBar}
                onShowEvalBarChange={setShowEvalBar}
                onClear={clear}
              />
            ),
          },
        ],
        // The trainer's status while it plays; otherwise, reading the file,
        // the moves on offer from here (CTA-54).
        footer:
          shown !== "ready" ? undefined : (
            <>
              {changed && changesOpen && (
                <RepertoireChangesBar
                  testId={`${id}-changes`}
                  summary={
                    // An edit alone (a line promoted or deleted) adds nothing.
                    extensionIds.size === 0
                      ? t("repertoires.changes.edited")
                      : t("repertoires.changes.added", { count: extensionIds.size })
                  }
                  problem={saveProblem}
                  // A protected repertoire (its settings' default): no
                  // Update — its settings instead, where that is switched off.
                  protectedBy={
                    saved.settings.protected
                      ? { settingsPath: `${boardPath}/settings`, from: `${boardPath}${location.search}` }
                      : undefined
                  }
                  onUpdate={updateRecord}
                  onCopy={saveCopy}
                  onDiscard={discard}
                />
              )}
              {game !== undefined || autoplay ? (
                statusLine
              ) : tab === "moves" ? (
                <NextMovesBar
                  nodes={continuations}
                  onSelect={core.goToNode}
                  onHover={setHovered}
                />
              ) : null}
            </>
          ),
      }}
    />
  );
}

/** One on/off setting: the switch, and a line on what it does. */
function SwitchSetting({
  testId,
  checked,
  onChange,
  label,
  help,
}: {
  testId: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  help: string;
}) {
  return (
    <Box>
      <FormControlLabel
        sx={{ m: 0 }}
        control={
          <Switch
            size="small"
            checked={checked}
            data-testid={testId}
            onChange={(event) => onChange(event.target.checked)}
          />
        }
        label={label}
      />
      <Typography variant="caption" sx={{ display: "block", color: "text.secondary" }}>
        {help}
      </Typography>
    </Box>
  );
}

/**
 * The Settings tab: the session's knobs — side, Autoplay (the player's only),
 * arrows, engine — one labelled row each. Presentational: the screen owns the
 * state, since changing side restarts the session.
 */
function PlaySettings({
  id,
  side,
  onSideChange,
  autoplay,
  onAutoplayChange,
  showArrows,
  onShowArrowsChange,
  engineOn,
  onEngineOnChange,
}: {
  id: string;
  side: Side;
  onSideChange: (next: Side | null) => void;
  /** `undefined` where there is no switch — a game always plays. */
  autoplay: boolean | undefined;
  onAutoplayChange: (next: boolean) => void;
  showArrows: boolean;
  onShowArrowsChange: (next: boolean) => void;
  engineOn: boolean;
  onEngineOnChange: (next: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <Box
      data-testid={`${id}-session`}
      sx={{ display: "flex", flexDirection: "column", gap: 2, p: 1 }}
    >
      <Box>
        <Typography variant="subtitle2" id={`${id}-side-label`} sx={{ fontWeight: 600 }}>
          {t("repertoires.play.side")}
        </Typography>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={side}
          onChange={(_, next: Side | null) => onSideChange(next)}
          aria-labelledby={`${id}-side-label`}
          data-testid={`${id}-side`}
          sx={{ my: 0.5 }}
        >
          <ToggleButton value="white" data-testid={`${id}-side-white`}>
            {t("repertoires.play.white")}
          </ToggleButton>
          <ToggleButton value="black" data-testid={`${id}-side-black`}>
            {t("repertoires.play.black")}
          </ToggleButton>
        </ToggleButtonGroup>
        <Typography variant="caption" sx={{ display: "block", color: "text.secondary" }}>
          {t("repertoires.play.sideHelp")}
        </Typography>
      </Box>
      {autoplay !== undefined && (
        <SwitchSetting
          testId={`${id}-setting-autoplay`}
          checked={autoplay}
          onChange={onAutoplayChange}
          label={t("repertoires.play.autoplay")}
          help={t("repertoires.play.autoplayHelp")}
        />
      )}
      <SwitchSetting
        testId={`${id}-arrows`}
        checked={showArrows}
        onChange={onShowArrowsChange}
        label={t("repertoires.play.arrows")}
        help={t("repertoires.play.arrowsHelp")}
      />
      <SwitchSetting
        testId={`${id}-setting-engine`}
        checked={engineOn}
        onChange={onEngineOnChange}
        label={t("repertoires.play.engine")}
        help={t("repertoires.play.engineHelp")}
      />
    </Box>
  );
}

/**
 * The Score tab: a game's session tally — right, wrong, accuracy, and the
 * game's own line count — with a reset, and Backtracking's "start over".
 */
function PlayScore({
  id,
  score,
  onReset,
  lines,
  onStartOver,
}: {
  id: string;
  score: DrillScore;
  onReset: () => void;
  /** The game's line count, already worded: finished, or covered of total. */
  lines: string;
  onStartOver?: () => void;
}) {
  const { t } = useTranslation();
  const accuracy = drillAccuracy(score);
  const figure = (testId: string, label: string, value: string, color: string) => (
    <Box sx={{ flex: 1, textAlign: "center" }}>
      <Typography
        variant="h4"
        component="p"
        dir="ltr"
        data-testid={testId}
        sx={{ fontWeight: 700, color }}
      >
        {value}
      </Typography>
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        {label}
      </Typography>
    </Box>
  );
  return (
    <Box
      data-testid={`${id}-score`}
      sx={{ display: "flex", flexDirection: "column", gap: 2, p: 1 }}
    >
      <Typography variant="subtitle2" data-testid={`${id}-score-lines`} sx={{ fontWeight: 600 }}>
        {lines}
      </Typography>
      <Box sx={{ display: "flex", gap: 1 }}>
        {figure(
          `${id}-score-successes`,
          t("repertoires.play.score.successes"),
          String(score.successes),
          "success.main",
        )}
        {figure(
          `${id}-score-failures`,
          t("repertoires.play.score.failures"),
          String(score.failures),
          "error.main",
        )}
        {figure(
          `${id}-score-accuracy`,
          t("repertoires.play.score.accuracy"),
          accuracy === undefined ? "–" : `${accuracy}%`,
          "text.primary",
        )}
      </Box>
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        {t("repertoires.play.score.help")}
      </Typography>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        <Button
          size="small"
          variant="outlined"
          onClick={onReset}
          data-testid={`${id}-score-reset`}
        >
          {t("repertoires.play.score.reset")}
        </Button>
        {onStartOver !== undefined && (
          <Button
            size="small"
            variant="outlined"
            onClick={onStartOver}
            data-testid={`${id}-score-start-over`}
          >
            {t("repertoires.play.score.startOver")}
          </Button>
        )}
      </Box>
    </Box>
  );
}

export default RepertoirePlayer;
