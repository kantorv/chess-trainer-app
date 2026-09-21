import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import Switch from "@mui/material/Switch";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import FolderOpenRoundedIcon from "@mui/icons-material/FolderOpenRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import {
  createSearchParams,
  Link as RouterLink,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router";
import { useTranslation } from "react-i18next";
import type { ChessboardOptions } from "react-chessboard";

import { parseFen } from "../../../lib/fen";
import { initialPlyOf, parseMoveParam } from "../../../lib/gameNavigation";
import { resolveGameReference } from "../../../lib/gameReference";
import type { GameTree } from "../../../lib/gameTree";
import { parsePgnTree } from "../../../lib/pgn";
import { slugify } from "../../../lib/pgnLibrary";
import { atParamOf, REPERTOIRE_AT_PARAM } from "../../../lib/repertoireLink";
import { savedAnalysisDerivedName } from "../../../lib/savedAnalyses";
import { findSavedAnalysis } from "../../../lib/savedAnalysisStore";
import BoardShell from "../../dev/core/BoardShell";
import { useVariationsExplorer } from "../../explorer/useVariationsExplorer";
import RepertoireChangesBar from "../../repertoires/RepertoireChangesBar";
import CurrentOpening from "../../shared/CurrentOpening";
import AnalysisExport from "./AnalysisExport";
import EngineThinking from "./EngineThinking";
import PlayToggleButton from "./PlayToggleButton";
import AnalysisLoad from "./AnalysisLoad";
import AnalysisSettingsPanel from "./AnalysisSettings";
import SaveAnalysisDialog from "./SaveAnalysisDialog";
import { useAnalysisBoard, type AnalysisBoardStart } from "./useAnalysisBoard";

/**
 * **The Analysis Board** (`/tools/analysis`, CTA-73) — the board a game or a
 * position is taken apart on: both colours move from any node, side lines
 * branch off wherever the reader plays something else, and the engine reads
 * the position on screen — moving a piece only while the header's **Play** is
 * on, and then only for the side not at the bottom of the board, until
 * paused or until the reader steps back (`useAnalysisBoard`).
 *
 * Composed from the v2 core
 * ([`.claude/rules/chessboard-v2.md`](../../../../.claude/rules/chessboard-v2.md))
 * and the shared tree view
 * ([`.claude/rules/tree-views.md`](../../../../.claude/rules/tree-views.md)) —
 * functionally the repertoire player without its trainer and its protection:
 *
 * | Capability | Taken | Because |
 * | --- | --- | --- |
 * | Base | `useBoardCore`, through `useAnalysisBoard` | the tree, the node, the oracle, promotion, orientation |
 * | Engine | switch, **on by default**; its best move played **only while Play is on, for the opponent's side** (`onBestMove`, `useAnalysisBoard`) | the pinned lines, the eval bar and the Engine tab; Play is disabled while the engine is off, and a step back pauses it |
 * | Tree view | `useVariationsExplorer` | Moves (side lines, comment marks, evals, the move menu), Map, the comment block, the next-moves bar and arrows — editing on, *Play chances…* off (nothing here plays by chance) |
 * | Saving | `useAnalysisBoard` — explicit | no autosave: the header's Save lights while the board differs from its record, and opens the changes strip (Update / Save as copy / Discard); a board with no record yet saves through a name-and-folder dialog |
 *
 * **Tabs: Moves · Map · Load · Export · Engine.** Load brings a PGN (a file or
 * a paste — several games are merged onto the board or split into a folder of
 * saved analyses) or a FEN; Export copies the FEN, and copies or downloads the
 * PGN with or without comments, NAGs and side lines.
 *
 * **Arrivals, read once** (arriving at the URL is what mounts the screen, and
 * the screen writes its own URL as the reader moves): `?fen=` (a position —
 * the board turns to the side to move), `?game=` + `?move=` (a game out of a
 * catalog, re-read with `parsePgnTree` for its side lines; the ply or its
 * `StartPly`), `?analysis=<id>` (a saved analysis, where the reader left it,
 * facing the way it faced). **`?at=`** — the moves from the start as SAN
 * (`lib/repertoireLink.ts`) — is written back on every step with history
 * replace, so the address bar is always a permanent link to the position on
 * screen; it beats `?move=` and the record's own place on the way in. Once a
 * board is saved, its URL becomes `?analysis=<id>`.
 */

/**
 * The tabs that stay mounted once opened — `BoardPanel`'s `keepMounted`: a long
 * move list is costly to mount, and the Map keeps where it was panned.
 */
const KEEP_MOUNTED = ["moves", "map"] as const;

/** Everything the URL hands the screen, read once. */
const arrivalOf = (params: URLSearchParams): AnalysisBoardStart => {
  // A link nobody can read opens as if that parameter were not there.
  let fen: string | undefined;
  const requestedFen = params.get("fen");
  if (requestedFen !== null) {
    try {
      fen = parseFen(requestedFen);
    } catch {
      fen = undefined;
    }
  }

  const arrived = resolveGameReference(params.get("game"));
  let tree: GameTree | undefined;
  if (arrived !== undefined) {
    try {
      tree = parsePgnTree(arrived.pgn);
    } catch {
      tree = undefined;
    }
  }

  return {
    fen,
    tree,
    ply:
      parseMoveParam(params.get("move")) ??
      (arrived === undefined ? undefined : initialPlyOf(arrived.game)),
    resume: findSavedAnalysis(params.get("analysis")),
    at: params.get(REPERTOIRE_AT_PARAM),
  };
};

function AnalysisBoard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [arrival] = useState(() => arrivalOf(searchParams));

  const state = useAnalysisBoard(arrival);
  const { core, engine, record } = state;

  const [tab, setTab] = useState("moves");
  const location = useLocation();
  // Opens as the record's settings say (on for a new board); the Engine tab's
  // switch is the session's.
  const [showArrows, setShowArrows] = useState(record?.showArrows ?? true);
  const [changesOpen, setChangesOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  // The strip closes itself once the changes are kept or dropped — adjusted
  // during render (`react-hooks/set-state-in-effect`).
  if (changesOpen && !state.changed) setChangesOpen(false);

  const name =
    record?.name || savedAnalysisDerivedName(core.tree.headers) || t("savedAnalyses.untitled");

  /*
    The variations explorer (CTA-72): the parts are placed below. Editing is
    on — the menu's edits and the comment block's go through `replaceTree`,
    session changes like a move added — and *Play chances…* off: no trainer
    here plays by them. The map draws the session, the moves added since the
    baseline ringed, every dot a link.
  */
  const explorer = useVariationsExplorer({
    testId: "analysis",
    source: core,
    evalsByFen: engine.evalsByFen,
    extensionIds: state.extensionIds,
    onEditTree: core.replaceTree,
    playChances: false,
    annotations: true,
    arrows: { show: showArrows },
    map: { addedIds: state.extensionIds, linked: true },
  });
  const boardOptions: ChessboardOptions = { arrows: explorer.arrows };
  const topLine = engine.analysis.lines.find((line) => line !== undefined);

  /*
    The URL, derived and written back with history replace: what the board
    *is* — the arrival's parameters, `?analysis=<id>` once it is a record,
    nothing once the reader loads something new — plus **`?at=`**, where the
    reader stands, so the address bar is always a permanent link. `?move=` is
    the arrival's alone; the link says where the reader is now. One write
    from one value, so a save and a step cannot race each other's URL.
  */
  const [urlBase, setUrlBase] = useState<Record<string, string>>(() => {
    const base: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      if (key !== REPERTOIRE_AT_PARAM && key !== "move") base[key] = value;
    });
    return base;
  });
  const linkedAt = useMemo(
    () => atParamOf(core.tree, core.nodeId),
    [core.tree, core.nodeId],
  );
  const wantedSearch = useMemo(
    () =>
      createSearchParams(
        linkedAt === "" ? urlBase : { ...urlBase, [REPERTOIRE_AT_PARAM]: linkedAt },
      ).toString(),
    [urlBase, linkedAt],
  );
  useEffect(() => {
    if (searchParams.toString() === wantedSearch) return;
    setSearchParams(wantedSearch, { replace: true });
  }, [wantedSearch, searchParams, setSearchParams]);

  /** The URL of a board that is a record now: `?analysis=<id>`. */
  const pointUrlAt = (id: string) => setUrlBase({ analysis: id });

  /** A new board loaded: the URL no longer names what arrived. */
  const clearArrivalUrl = () => setUrlBase({});

  // Leaving with changes unsaved — a reload, a closed tab — asks first.
  useEffect(() => {
    if (!state.unsaved) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state.unsaved]);

  const onSaveClick = () => {
    if (record === null) setSaveOpen(true);
    else setChangesOpen((open) => !open);
  };

  const saveCopy = () => {
    const copy = state.saveCopy(
      t("analysis.changes.copyName", { name: record?.name || name }),
    );
    if (copy !== undefined) pointUrlAt(copy.id);
  };

  const saveLabel = t(
    record === null
      ? "analysis.save.open"
      : state.changed
        ? "analysis.changes.saveOpen"
        : "analysis.changes.saveNothing",
  );

  return (
    <>
      <BoardShell
        id="analysis"
        core={core}
        score={topLine?.score ?? null}
        showEvalBar={state.engineOn && state.showEvalBar}
        boardOptions={boardOptions}
        overlay={explorer.overlay}
        panel={{
          header: (
            <>
              <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                <Typography
                  variant="subtitle2"
                  data-testid="analysis-name"
                  dir="auto"
                  sx={{ fontWeight: 700, lineHeight: 1.3 }}
                  noWrap
                >
                  {name}
                </Typography>
                {record !== null && record.description !== "" && (
                  // The reader's notes on it: one line here, all of it on hover.
                  <Typography
                    variant="caption"
                    data-testid="analysis-description"
                    dir="auto"
                    title={record.description}
                    sx={{ color: "text.secondary", display: "block" }}
                    noWrap
                  >
                    {record.description}
                  </Typography>
                )}
                <CurrentOpening fen={core.fen} testId="analysis-current-opening" />
              </Box>
              <Tooltip title={saveLabel}>
                <span>
                  <IconButton
                    size="small"
                    disabled={!state.canSave}
                    color={state.unsaved ? "primary" : "default"}
                    onClick={onSaveClick}
                    aria-label={saveLabel}
                    aria-pressed={record !== null && state.changed ? changesOpen : undefined}
                    data-testid="analysis-save"
                    sx={{ flexShrink: 0 }}
                  >
                    <SaveRoundedIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <PlayToggleButton
                testId="analysis-play"
                engineOn={state.engineOn}
                playing={state.playing}
                thinking={state.thinking}
                onToggle={state.togglePlaying}
              />
              <Tooltip title={t("savedAnalyses.title")}>
                <IconButton
                  size="small"
                  component={RouterLink}
                  to="/tools/analysis/saved"
                  aria-label={t("savedAnalyses.title")}
                  data-testid="analysis-saved-list"
                  sx={{ flexShrink: 0 }}
                >
                  <FolderOpenRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              {record !== null && (
                // Its settings — off while there are unsaved changes, which
                // leaving the board would lose.
                <Tooltip
                  title={t(
                    state.unsaved ? "analysis.settingsLink.unsaved" : "analysis.settingsLink.open",
                  )}
                >
                  <span>
                    <IconButton
                      size="small"
                      component={RouterLink}
                      to={`/tools/analysis/saved/${encodeURIComponent(record.id)}/settings`}
                      state={{ from: `${location.pathname}${location.search}` }}
                      disabled={state.unsaved}
                      aria-label={t("analysis.settingsLink.open")}
                      data-testid="analysis-settings"
                      sx={{ flexShrink: 0 }}
                    >
                      <SettingsRoundedIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              )}
              <FormControlLabel
                sx={{ flexShrink: 0, marginInlineEnd: 0 }}
                control={
                  <Switch
                    size="small"
                    checked={state.engineOn}
                    data-testid="analysis-setting-engine"
                    onChange={(event) => state.setEngineOn(event.target.checked)}
                  />
                }
                label={t("analysis.engineSwitch")}
              />
            </>
          ),
          analysis: engine.analysis,
          requestedMultiPv: state.settings.multiPv,
          engineOn: state.engineOn,
          // Present, so the pinned lines are clickable (CTA-55).
          onPlayVariation: core.playVariation,
          activeTab: tab,
          onTabChange: setTab,
          keepMounted: KEEP_MOUNTED,
          tabs: [
            { id: "moves", label: t("analysis.tabs.moves"), content: explorer.moves },
            { id: "map", label: t("analysis.tabs.map"), content: explorer.map },
            {
              id: "load",
              label: t("analysis.tabs.load"),
              content: (
                <AnalysisLoad
                  settings={state.settings}
                  onLoadTree={(tree) => {
                    state.loadNew(tree);
                    clearArrivalUrl();
                  }}
                  onLoadFen={(fen) => {
                    state.loadFen(fen);
                    clearArrivalUrl();
                  }}
                  onSplit={(folderId) =>
                    navigate(`/tools/analysis/saved?folder=${encodeURIComponent(folderId)}`)
                  }
                />
              ),
            },
            {
              id: "export",
              label: t("analysis.tabs.export"),
              content: (
                <AnalysisExport
                  fen={core.fen}
                  tree={core.tree}
                  fileStem={slugify(name) || "analysis"}
                />
              ),
            },
            {
              id: "engine",
              label: t("analysis.tabs.engine"),
              content: (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  <FormControlLabel
                    sx={{ m: 0, px: 1 }}
                    control={
                      <Switch
                        size="small"
                        checked={showArrows}
                        data-testid="analysis-arrows"
                        onChange={(event) => setShowArrows(event.target.checked)}
                      />
                    }
                    label={t("analysis.settings.arrows")}
                  />
                  <AnalysisSettingsPanel
                    settings={state.settings}
                    onChange={state.updateSettings}
                    engineOptions={engine.engineOptions}
                    engineOn={state.engineOn}
                    showEvalBar={state.showEvalBar}
                    onShowEvalBarChange={state.setShowEvalBar}
                    onClear={() => {
                      state.clearBoard();
                      clearArrivalUrl();
                    }}
                  />
                </Box>
              ),
            },
          ],
          footer: (
            <>
              {explorer.annotations}
              {record !== null && state.changed && changesOpen && (
                <RepertoireChangesBar
                  testId="analysis-changes"
                  labelKey="analysis.changes"
                  summary={
                    state.extensionIds.size === 0
                      ? t("analysis.changes.edited")
                      : t("analysis.changes.added", { count: state.extensionIds.size })
                  }
                  problem={state.problem}
                  onUpdate={() => void state.update()}
                  onCopy={saveCopy}
                  onDiscard={state.discard}
                />
              )}
              {record === null && state.problem !== null && (
                <Typography
                  variant="caption"
                  role="alert"
                  data-testid="analysis-save-problem"
                  sx={{ display: "block", color: "error.main", px: 1 }}
                >
                  {t(`analysis.changes.problem.${state.problem}`)}
                </Typography>
              )}
              {/* Play's status — the engine thinking, or the reader's move. */}
              {state.playing && (
                <EngineThinking
                  thinking={state.thinking}
                  depth={engine.analysis.fen === core.fen ? engine.analysis.depth : 0}
                />
              )}
              {tab === "moves" && explorer.nextMoves}
            </>
          ),
        }}
      />
      <SaveAnalysisDialog
        open={saveOpen}
        initialName={savedAnalysisDerivedName(core.tree.headers)}
        onSave={(typed, folderId) => {
          const saved = state.saveNew(typed, folderId, showArrows);
          if (saved !== undefined) pointUrlAt(saved.id);
        }}
        onClose={() => setSaveOpen(false)}
      />
    </>
  );
}

export default AnalysisBoard;
