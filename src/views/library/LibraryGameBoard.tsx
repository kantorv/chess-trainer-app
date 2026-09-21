import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import Switch from "@mui/material/Switch";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import NavigateBeforeRoundedIcon from "@mui/icons-material/NavigateBeforeRounded";
import NavigateNextRoundedIcon from "@mui/icons-material/NavigateNextRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import { Link as RouterLink, useLocation, useNavigate, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { ChessboardOptions } from "react-chessboard";

import { indexGame } from "../../lib/collectionIndex";
import { initialPlyOf } from "../../lib/gameNavigation";
import { mainlineGame, sanPathTo, treeToPgn, type GameTree } from "../../lib/gameTree";
import {
  insertCollectionGame,
  replaceCollectionGame,
} from "../../lib/libraryCollectionStore";
import {
  collectionRowOf,
  gameTitleOf,
  type LibraryCollection,
} from "../../lib/libraryCollections";
import { slugify } from "../../lib/pgnText";
import { atParamOf, nodeAtParam, REPERTOIRE_AT_PARAM } from "../../lib/repertoireLink";
import { newSavedAnalysisId, savedAnalysisOf } from "../../lib/savedAnalyses";
import { saveAnalysis } from "../../lib/savedAnalysisStore";
import BoardShell from "../dev/core/BoardShell";
import { useVariationsExplorer } from "../explorer/useVariationsExplorer";
import RepertoireChangesBar from "../repertoires/RepertoireChangesBar";
import CurrentOpening from "../shared/CurrentOpening";
import GameInfo from "../shared/GameInfo";
import AnalysisExport from "../tools/analysis/AnalysisExport";
import AnalysisSettingsPanel from "../tools/analysis/AnalysisSettings";
import EngineThinking from "../tools/analysis/EngineThinking";
import PlayToggleButton from "../tools/analysis/PlayToggleButton";
import { useAnalysisSession } from "../tools/analysis/useAnalysisSession";

/**
 * **A Library game** (`/library/<collection>/<game>`, CTA-75) — a game of a
 * collection on a **full analysis board**, composed exactly as the Analysis
 * Board is ([`chessboard-v2.md`](../../../.claude/rules/chessboard-v2.md) §5 —
 * no behaviour hook of its own):
 *
 * | Capability | Taken |
 * | --- | --- |
 * | Base + engine + Play + baseline | `useAnalysisSession` — the Analysis Board's own session: `useBoardCore`, `useEngineModule` (on), `usePlayToggle` (off at the start) |
 * | Tree view | `useVariationsExplorer` — Moves, Map, the comment block, the next-moves bar, the arrows, the move menu; editing on, *Play chances…* off |
 * | Shell | `BoardShell` / `BoardPanel` — tabs Moves · Map · Info · Export · Engine |
 *
 * **Nothing is written unless the reader asks**, and what may be written
 * depends on where the collection came from — the changes strip, opened by
 * the header's Save while the tree differs from the game as it arrived:
 *
 * - an **uploaded** collection's game: **Update** (the game is rewritten in
 *   place in the collection), **Save as copy** (a copy inserted right after
 *   it, and the board goes on in the copy) or **Discard** — each write taking
 *   the game's new index row with it (`indexGame`), so the table is in step;
 * - a **shipped** collection's game is read-only: **Save as copy** writes it
 *   into **Saved analyses** and opens it there (`?analysis=<id>`), or
 *   **Discard**.
 *
 * `?at=` — the moves from the start as SAN — is read on arrival and written
 * back on every step (history replace), so the address is a permanent link to
 * the position on screen. Without one, a game opens at its `StartPly` tag
 * (`initialPlyOf`), else at its start.
 */

const KEEP_MOUNTED = ["moves", "map"] as const;

export type LibraryGameBoardProps = {
  collection: LibraryCollection;
  /** 1-based: the game's place in the collection. */
  number: number;
  /** The game, parsed with its side lines. */
  tree: GameTree;
};

function LibraryGameBoard({ collection, number, tree }: LibraryGameBoardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  // Where it opens: a `?at=` link, else the game's own `StartPly` tag, else its start.
  const [start] = useState(() => ({
    nodeId: nodeAtParam(tree, searchParams.get(REPERTOIRE_AT_PARAM)) ?? undefined,
    ply: initialPlyOf(mainlineGame(tree)),
  }));

  const session = useAnalysisSession({ tree, nodeId: start.nodeId, ply: start.ply });
  const { core, engine } = session;

  const [tab, setTab] = useState("moves");
  const [showArrows, setShowArrows] = useState(true);
  const [changesOpen, setChangesOpen] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // The strip closes itself once the changes are kept or dropped.
  if (changesOpen && !session.changed) setChangesOpen(false);

  const shipped = collection.source === "shipped";
  const row = useMemo(
    () => collectionRowOf(collection.games[number - 1] ?? "", number),
    [collection, number],
  );
  const title = gameTitleOf(row);
  const caption = [row.event, row.round, row.date, row.result].filter(Boolean).join(" · ");

  const explorer = useVariationsExplorer({
    testId: "library-game",
    source: core,
    evalsByFen: engine.evalsByFen,
    extensionIds: session.extensionIds,
    onEditTree: core.replaceTree,
    playChances: false,
    annotations: true,
    arrows: { show: showArrows },
    map: { addedIds: session.extensionIds, linked: true },
  });
  const boardOptions: ChessboardOptions = { arrows: explorer.arrows };
  const topLine = engine.analysis.lines.find((line) => line !== undefined);

  /* `?at=`, written back with history replace — keeping the route's state (the table's URL). */
  const linkedAt = useMemo(() => atParamOf(core.tree, core.nodeId), [core.tree, core.nodeId]);
  useEffect(() => {
    if ((searchParams.get(REPERTOIRE_AT_PARAM) ?? "") === linkedAt) return;
    const next = new URLSearchParams(searchParams);
    if (linkedAt === "") next.delete(REPERTOIRE_AT_PARAM);
    else next.set(REPERTOIRE_AT_PARAM, linkedAt);
    setSearchParams(next, { replace: true, state: location.state });
  }, [linkedAt, searchParams, setSearchParams, location.state]);

  // Leaving with changes unsaved — a reload, a closed tab — asks first.
  useEffect(() => {
    if (!session.changed) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [session.changed]);

  const from = (location.state as { from?: string } | null)?.from;
  const tablePath = from ?? `/library/${encodeURIComponent(collection.id)}`;
  const gamePath = (other: number) => `/library/${encodeURIComponent(collection.id)}/${other}`;

  /** **Update** — an uploaded collection's game, rewritten in place. */
  const update = async () => {
    const tree = core.tree;
    const pgn = treeToPgn(tree);
    const failed = await replaceCollectionGame(collection.id, number, pgn, await indexGame(pgn));
    if (failed !== undefined) {
      setProblem(failed);
      return;
    }
    setProblem(null);
    session.rebase(tree);
  };

  /** **Save as copy** — beside the original in an upload; into Saved analyses from a shipped file. */
  const saveCopy = async () => {
    if (shipped) {
      const record = {
        ...savedAnalysisOf(
          newSavedAnalysisId(),
          core.tree,
          sanPathTo(core.tree, core.nodeId),
          session.settings,
          core.orientation,
        ),
        name: t("library.shippedChanges.copyName", { name: title }),
        showArrows,
      };
      const failed = saveAnalysis(record);
      if (failed !== undefined) {
        setProblem(failed);
        return;
      }
      navigate(`/tools/analysis?analysis=${encodeURIComponent(record.id)}`);
      return;
    }
    const pgn = treeToPgn(core.tree);
    const failed = await insertCollectionGame(collection.id, number + 1, pgn, await indexGame(pgn));
    if (failed !== undefined) {
      setProblem(failed);
      return;
    }
    const at = linkedAt === "" ? "" : `?${REPERTOIRE_AT_PARAM}=${encodeURIComponent(linkedAt)}`;
    navigate(`${gamePath(number + 1)}${at}`, { state: location.state });
  };

  const discard = () => {
    session.discard();
    setProblem(null);
  };

  const saveLabel = t(session.changed ? "library.changes.saveOpen" : "library.changes.saveNothing");
  const labelKey = shipped ? "library.shippedChanges" : "library.changes";

  return (
    <BoardShell
      id="library-game"
      core={core}
      score={topLine?.score ?? null}
      showEvalBar={session.engineOn && session.showEvalBar}
      boardOptions={boardOptions}
      overlay={explorer.overlay}
      panel={{
        header: (
          <>
            <Tooltip title={t("library.game.back", { name: collection.name })}>
              <IconButton
                size="small"
                component={RouterLink}
                to={tablePath}
                aria-label={t("library.game.back", { name: collection.name })}
                data-testid="library-game-back"
                sx={{ flexShrink: 0 }}
              >
                <ArrowBackRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography
                variant="subtitle2"
                data-testid="library-game-title"
                dir="auto"
                sx={{ fontWeight: 700, lineHeight: 1.3 }}
                noWrap
              >
                {title}
              </Typography>
              <Typography
                variant="caption"
                data-testid="library-game-caption"
                dir="auto"
                title={caption}
                sx={{ color: "text.secondary", display: "block" }}
                noWrap
              >
                {t("library.game.of", { number, count: collection.games.length })}
                {caption === "" ? "" : ` · ${caption}`}
              </Typography>
              <CurrentOpening fen={core.fen} testId="library-game-current-opening" />
            </Box>
            <Tooltip title={t("library.game.previous")}>
              <span>
                <IconButton
                  size="small"
                  component={RouterLink}
                  to={gamePath(number - 1)}
                  state={location.state}
                  disabled={number <= 1}
                  aria-label={t("library.game.previous")}
                  data-testid="library-game-previous"
                >
                  <NavigateBeforeRoundedIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title={t("library.game.next")}>
              <span>
                <IconButton
                  size="small"
                  component={RouterLink}
                  to={gamePath(number + 1)}
                  state={location.state}
                  disabled={number >= collection.games.length}
                  aria-label={t("library.game.next")}
                  data-testid="library-game-next"
                >
                  <NavigateNextRoundedIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title={saveLabel}>
              <span>
                <IconButton
                  size="small"
                  disabled={!session.changed}
                  color={session.changed ? "primary" : "default"}
                  onClick={() => setChangesOpen((open) => !open)}
                  aria-label={saveLabel}
                  aria-pressed={session.changed ? changesOpen : undefined}
                  data-testid="library-game-save"
                  sx={{ flexShrink: 0 }}
                >
                  <SaveRoundedIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <PlayToggleButton
              testId="library-game-play"
              engineOn={session.engineOn}
              playing={session.playing}
              thinking={session.thinking}
              onToggle={session.togglePlaying}
            />
            <FormControlLabel
              sx={{ flexShrink: 0, marginInlineEnd: 0 }}
              control={
                <Switch
                  size="small"
                  checked={session.engineOn}
                  data-testid="library-game-setting-engine"
                  onChange={(event) => session.setEngineOn(event.target.checked)}
                />
              }
              label={t("library.game.engineSwitch")}
            />
          </>
        ),
        analysis: engine.analysis,
        requestedMultiPv: session.settings.multiPv,
        engineOn: session.engineOn,
        onPlayVariation: core.playVariation,
        activeTab: tab,
        onTabChange: setTab,
        keepMounted: KEEP_MOUNTED,
        tabs: [
          { id: "moves", label: t("library.game.tabs.moves"), content: explorer.moves },
          { id: "map", label: t("library.game.tabs.map"), content: explorer.map },
          {
            id: "info",
            label: t("library.game.tabs.info"),
            content: <GameInfo game={mainlineGame(core.tree)} />,
          },
          {
            id: "export",
            label: t("library.game.tabs.export"),
            content: (
              <AnalysisExport
                fen={core.fen}
                tree={core.tree}
                fileStem={slugify(title) || "game"}
              />
            ),
          },
          {
            id: "engine",
            label: t("library.game.tabs.engine"),
            content: (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <FormControlLabel
                  sx={{ m: 0, px: 1 }}
                  control={
                    <Switch
                      size="small"
                      checked={showArrows}
                      data-testid="library-game-arrows"
                      onChange={(event) => setShowArrows(event.target.checked)}
                    />
                  }
                  label={t("library.game.arrows")}
                />
                <AnalysisSettingsPanel
                  settings={session.settings}
                  onChange={session.updateSettings}
                  engineOptions={engine.engineOptions}
                  engineOn={session.engineOn}
                  showEvalBar={session.showEvalBar}
                  onShowEvalBarChange={session.setShowEvalBar}
                />
              </Box>
            ),
          },
        ],
        footer: (
          <>
            {explorer.annotations}
            {session.changed && changesOpen && (
              <RepertoireChangesBar
                testId="library-game-changes"
                labelKey={labelKey}
                readOnly={shipped}
                summary={
                  session.extensionIds.size === 0
                    ? t("library.changes.edited")
                    : t("library.changes.added", { count: session.extensionIds.size })
                }
                problem={problem}
                onUpdate={() => void update()}
                onCopy={() => void saveCopy()}
                onDiscard={discard}
              />
            )}
            {session.playing && (
              <EngineThinking
                thinking={session.thinking}
                depth={engine.analysis.fen === core.fen ? engine.analysis.depth : 0}
              />
            )}
            {tab === "moves" && explorer.nextMoves}
          </>
        ),
      }}
    />
  );
}

export default LibraryGameBoard;
