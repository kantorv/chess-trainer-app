import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
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
import RestartAltRoundedIcon from "@mui/icons-material/RestartAltRounded";
import { Link as RouterLink, Navigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { ChessboardOptions } from "react-chessboard";

import { emptyTree, findNode, type GameTree } from "../../lib/gameTree";
import { downloadPgn } from "../../lib/pgnExport";
import { slugify } from "../../lib/pgnLibrary";
import { extensionIdsOf, nodeIdsOf } from "../../lib/repertoireTrainer";
import {
  isMultiGameRepertoire,
  repertoireTreeOf,
  type SavedRepertoire,
} from "../../lib/savedRepertoires";
import BoardShell from "../dev/core/BoardShell";
import TreeMoveList from "../dev/core/TreeMoveList";
import { useBoardCore } from "../dev/core/useBoardCore";
import { useTrainerModule, type TrainerStatus } from "../dev/core/useTrainerModule";
import { nextMoveArrowsOf } from "../tools/analysis/nextMoveArrows";
import { MissingRepertoire } from "./RepertoireBoard";
import { useSavedRepertoires } from "./useSavedRepertoires";

/**
 * **Play a repertoire** (`/repertoires/<id>/play`, CTA-63) — the reader drills
 * one of their repertoires against a **trainer**, a scripted opponent that
 * answers only from the repertoire, and extends the file as they go.
 *
 * Composed from the v2 core
 * ([`.claude/rules/chessboard-v2.md`](../../../.claude/rules/chessboard-v2.md))
 * like the repertoire's own board (`RepertoireBoard.tsx`), with the trainer
 * module in place of the engine:
 *
 * | Capability | Taken | Because |
 * | --- | --- | --- |
 * | Base | `useBoardCore({ orientation })` | facing the side the reader plays; both colours move from any node, because past the repertoire's end the reader plays both |
 * | Trainer | `useTrainerModule` | the opponent — see that file for the "replies to a move, never to a position" rule |
 * | Engine | ❌ | a drill should not show the answer |
 * | Autosave | ❌ | the session is the reader's, the record is the file's |
 *
 * ## The rules of a session
 *
 * - **The reader picks a side**, defaulting to the repertoire's main color
 *   (its settings). The board faces it. Changing side restarts the session;
 *   so does "Restart". Both go back to the start position and **keep** what
 *   the reader added — throwing away a line they just worked out would be the
 *   one thing a restart must not do. The trainer moves first as White.
 * - **Every move the repertoire does not have is an extension**: added under
 *   the node on screen (the core's own `addMove` path, so a move already there
 *   is followed), and tinted in the move list. Which moves those are is not
 *   tracked: it is `extensionIdsOf` — the session tree's ids against the ids
 *   the repertoire arrived with — recomputed when the tree changes.
 * - **The session is not saved.** The stored record is never written from
 *   here; leaving the screen drops the extensions. The way out is the
 *   download, which writes the session tree — repertoire, extensions, side
 *   lines and all — as one PGN.
 *
 * - **Two tabs: Moves · Settings.** The session's knobs — the side and the
 *   arrows — live in the Settings tab rather than the header, which keeps
 *   the actions (restart, download, back). A later drill mode's options go
 *   there too.
 * - **Arrows are the reader's call, and off by default.** A drill should not
 *   show the answer unless asked, so the Settings tab's switch draws the next-move
 *   arrows (`nextMoveArrowsOf`: the mainline's move in its own colour, the
 *   side lines in another) for every continuation at the node on screen —
 *   the repertoire's and the reader's additions alike, and a single one too,
 *   unlike the reading boards, which draw only where a line branches.
 *
 * What it deliberately does not do yet: count a deviation as a mistake, save
 * the extensions back, or pick the trainer's moves by anything but chance.
 * Each is an option on the module or a new policy — `chessboard-v2.md` §5.
 *
 * The tree is parsed after a paint, as on the board screen, and for the same
 * 9,146-node reason.
 */

/**
 * The tabs that stay mounted once opened — see `BoardPanel`'s `keepMounted`.
 * The Moves list of a 9,000-node repertoire takes most of a second to mount,
 * so a trip to Settings and back must not remount it.
 */
const KEEP_MOUNTED = ["moves"] as const;

/** Whether the repertoire's tree is on the board yet. */
type Shown = "loading" | "ready" | "unreadable";

type Side = "white" | "black";

/** A tree nothing holds yet — what the trainer answers from while reading. */
const NOTHING_YET: GameTree = emptyTree();

const STATUS_KEY: Record<TrainerStatus, string> = {
  "trainer-thinking": "repertoires.play.status.thinking",
  "your-move": "repertoires.play.status.yourMove",
  "out-of-book": "repertoires.play.status.outOfBook",
};

function RepertoirePlay() {
  const { id } = useParams();
  const repertoires = useSavedRepertoires();
  const saved = repertoires.find((row) => row.id === id);

  if (saved === undefined) return <MissingRepertoire />;
  // A record from before the one-game rule is not one line to drill: its own
  // route offers the merge-or-split choice.
  if (isMultiGameRepertoire(saved)) {
    return <Navigate to={`/repertoires/${encodeURIComponent(saved.id)}`} replace />;
  }
  // Keyed: every arrival is initial state.
  return <RepertoirePlayScreen key={saved.id} saved={saved} />;
}

function RepertoirePlayScreen({ saved }: { saved: SavedRepertoire }) {
  const { t } = useTranslation();
  const boardPath = `/repertoires/${encodeURIComponent(saved.id)}`;

  const [side, setSide] = useState<Side>(saved.settings.color);
  const core = useBoardCore({ orientation: saved.settings.color });
  const { loadTree, goToNode, setOrientation } = core;

  /** The repertoire as it arrived — what the trainer answers from. */
  const [repertoire, setRepertoire] = useState<GameTree>(NOTHING_YET);
  const [shown, setShown] = useState<Shown>("loading");

  const trainer = useTrainerModule({
    enabled: shown === "ready",
    core,
    repertoire,
    trainerColor: side === "white" ? "b" : "w",
  });
  const { requestReply } = trainer;

  /*
    The parse, behind a timer (the header note). Only the timer's callback
    writes state. The session starts where the tree lands: at the start
    position, with a reply owed there — which the trainer pays only when it is
    its turn, i.e. when the reader is Black.
  */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    timer.current = setTimeout(() => {
      timer.current = null;
      const parsed = repertoireTreeOf(saved);
      const tree = parsed ?? emptyTree();
      setRepertoire(tree);
      loadTree(tree);
      requestReply(null);
      setShown(parsed === undefined ? "unreadable" : "ready");
    }, 0);
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, [loadTree, requestReply, saved]);

  const [tab, setTab] = useState("moves");
  const [showArrows, setShowArrows] = useState(false);
  const continuations = useMemo(
    () =>
      core.nodeId === null
        ? core.tree.moves
        : (findNode(core.tree, core.nodeId)?.children ?? []),
    [core.tree, core.nodeId],
  );
  const boardOptions: ChessboardOptions = {
    arrows: showArrows ? nextMoveArrowsOf(continuations) : [],
  };

  const originalIds = useMemo(() => nodeIdsOf(repertoire), [repertoire]);
  const extensionIds = useMemo(
    () => extensionIdsOf(core.tree, originalIds),
    [core.tree, originalIds],
  );

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

  const download = () =>
    downloadPgn(slugify(saved.name) || "repertoire", [core.pgn]);

  const reading = shown === "loading" && (
    <Box
      data-testid="repertoire-play-line-loading"
      sx={{ display: "flex", alignItems: "center", gap: 1, p: 1, color: "text.secondary" }}
    >
      <CircularProgress size={16} />
      <Typography variant="body2">{t("repertoires.detail.loading")}</Typography>
    </Box>
  );

  return (
    <BoardShell
      id="repertoire-play"
      // The reader's moves go through the trainer's wrappers, which note that
      // a move was made — the one thing the trainer replies to.
      core={{
        ...core,
        onPieceDrop: trainer.onPieceDrop,
        resolvePromotion: trainer.resolvePromotion,
      }}
      showEvalBar={false}
      boardOptions={boardOptions}
      panel={{
        header: (
          <>
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography
                variant="subtitle2"
                data-testid="repertoire-play-name"
                sx={{ fontWeight: 700, lineHeight: 1.3 }}
                noWrap
              >
                {saved.name || t("repertoires.untitled")}
              </Typography>
            </Box>
            {shown === "loading" && (
              <CircularProgress
                size={16}
                data-testid="repertoire-play-reading"
                aria-label={t("repertoires.detail.loading")}
                sx={{ flexShrink: 0 }}
              />
            )}
            <Tooltip title={t("repertoires.play.restart")}>
              <IconButton
                size="small"
                onClick={restart}
                aria-label={t("repertoires.play.restart")}
                data-testid="repertoire-play-restart"
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
                  data-testid="repertoire-play-download"
                  sx={{ flexShrink: 0 }}
                >
                  <DownloadRoundedIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title={t("repertoires.play.back")}>
              <IconButton
                size="small"
                component={RouterLink}
                to={boardPath}
                aria-label={t("repertoires.play.back")}
                data-testid="repertoire-play-back"
                sx={{ flexShrink: 0 }}
              >
                <ArrowBackRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </>
        ),
        activeTab: tab,
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
                />
              )),
          },
          {
            id: "settings",
            label: t("repertoires.play.tabs.settings"),
            content: (
              <PlaySettings
                side={side}
                onSideChange={changeSide}
                showArrows={showArrows}
                onShowArrowsChange={setShowArrows}
              />
            ),
          },
        ],
        footer:
          shown === "ready" ? (
            <Typography
              variant="body2"
              data-testid="repertoire-play-status"
              data-status={trainer.status}
              sx={{
                px: 1,
                py: 0.5,
                color: trainer.status === "out-of-book" ? "success.main" : "text.secondary",
              }}
            >
              {t(STATUS_KEY[trainer.status])}
            </Typography>
          ) : undefined,
      }}
    />
  );
}

/**
 * The Settings tab: the session's knobs, one labelled row each. Presentational
 * — the screen owns the state, since changing side restarts the session.
 */
function PlaySettings({
  side,
  onSideChange,
  showArrows,
  onShowArrowsChange,
}: {
  side: Side;
  onSideChange: (next: Side | null) => void;
  showArrows: boolean;
  onShowArrowsChange: (next: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <Box
      data-testid="repertoire-play-settings"
      sx={{ display: "flex", flexDirection: "column", gap: 2, p: 1 }}
    >
      <Box>
        <Typography variant="subtitle2" id="repertoire-play-side-label" sx={{ fontWeight: 600 }}>
          {t("repertoires.play.side")}
        </Typography>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={side}
          onChange={(_, next: Side | null) => onSideChange(next)}
          aria-labelledby="repertoire-play-side-label"
          data-testid="repertoire-play-side"
          sx={{ my: 0.5 }}
        >
          <ToggleButton value="white" data-testid="repertoire-play-side-white">
            {t("repertoires.play.white")}
          </ToggleButton>
          <ToggleButton value="black" data-testid="repertoire-play-side-black">
            {t("repertoires.play.black")}
          </ToggleButton>
        </ToggleButtonGroup>
        <Typography variant="caption" sx={{ display: "block", color: "text.secondary" }}>
          {t("repertoires.play.sideHelp")}
        </Typography>
      </Box>
      <Box>
        <FormControlLabel
          sx={{ m: 0 }}
          control={
            <Switch
              size="small"
              checked={showArrows}
              data-testid="repertoire-play-arrows"
              onChange={(event) => onShowArrowsChange(event.target.checked)}
            />
          }
          label={t("repertoires.play.arrows")}
        />
        <Typography variant="caption" sx={{ display: "block", color: "text.secondary" }}>
          {t("repertoires.play.arrowsHelp")}
        </Typography>
      </Box>
    </Box>
  );
}

export default RepertoirePlay;
