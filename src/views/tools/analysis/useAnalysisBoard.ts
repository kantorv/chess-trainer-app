import { useCallback, useState } from "react";
import { DEFAULT_POSITION } from "chess.js";

import type { AnalysisHandOff } from "../../../lib/analysisHandOff";
import { emptyTree, sanPathTo, type GameTree } from "../../../lib/gameTree";
import { parseFen } from "../../../lib/fen";
import { nodeAtParam } from "../../../lib/repertoireLink";
import {
  newSavedAnalysisId,
  savedAnalysisNode,
  savedAnalysisOf,
  savedAnalysisToTree,
  type SavedAnalysis,
} from "../../../lib/savedAnalyses";
import {
  findSavedAnalysis,
  saveAnalysis,
  type SavedAnalysisProblem,
} from "../../../lib/savedAnalysisStore";
import { turnOf } from "../../board/core/useBoardCore";
import { useAnalysisSession } from "./useAnalysisSession";

/**
 * **The Analysis Board's session** (CTA-73) — the v2 core
 * ([`.claude/rules/chessboard-v2.md`](../../../../.claude/rules/chessboard-v2.md))
 * composed for analysis, plus the one thing that is this screen's own: the
 * **saved record** the session is attached to, and what the reader does with
 * its changes.
 *
 * ```
 * useAnalysisSession — core + engine + Play + the baseline (shared with the Library's board)
 * (this hook)        — the record: Save / Update / Save as copy, the Load tab's new boards
 * ```
 *
 * **The engine moves a piece only when the reader presses Play** (CTA-73), and
 * then only **the opponent's**: the reader plays the side at the bottom of the
 * board (`orientation`), the engine the other. While `playing` is on — and the
 * engine is — a finished search of the position on screen (`onBestMove`) is
 * played there, under the node on screen, when it is the engine's side to
 * move; on the reader's turn nothing moves. Pressing Play at the engine's turn
 * with that search already finished plays its first move at once.
 *
 * **Any step that is not one move forward pauses it** — back, Home, a click on
 * an earlier move, ↑ / ↓ to another line, a load: the reader has gone to look
 * or to try something, and goes on moving by hand until pressing Play again.
 * A move played (the reader's or the engine's) is a step to a child of the
 * node that was on screen, and keeps it on. It also pauses when the board is
 * flipped (the engine's side changed under it), once the position is over,
 * and whenever the engine is switched off. Off, `onBestMove` does nothing:
 * nothing moves unasked. All of it is the shared `usePlayToggle`
 * (`views/board/core/`), which Play with Engine runs too (CTA-74).
 *
 * ## Explicit save, against a baseline
 *
 * Nothing is written unasked — the board used to write itself on every move
 * and no longer does. The session holds a **baseline**: the tree as it
 * arrived, was loaded, or was last saved. "Changed" is `tree !== baseline`,
 * the repertoire player's rule: every edit makes a new tree and replaying a
 * move already there does not (`addMove`), so it holds for moves added and
 * for every menu edit with nothing to keep in step. With a **record** (an
 * `?analysis=` arrival, or once saved) a change is kept by **Update** (the
 * record takes the tree, the place in it and the engine settings),
 * **Save as copy** (a new record, the session moves to it) or **Discard**
 * (back to the baseline). Without one — a blank board, a `?fen=` or `?game=`
 * arrival, a tree handed over by the Openings explorer, a PGN just loaded —
 * **Save** names it and files it.
 *
 * The moves added since the baseline are the explorer's extensions — tinted in
 * the list and ringed on the map (`extensionIdsOf`, recomputed, never tracked).
 *
 * **A record's settings are the settings screen's** — its name, description,
 * side (`orientation`), arrows and folder. Update keeps the stored ones: a
 * flip or an arrows switch on the board is the session's. A new board's first
 * save takes the side it faces and the arrows switch as it is; a copy takes
 * the original's.
 */

export type AnalysisBoardStart = {
  /** A position to open on — the `?fen=` hand-off. Turns the board. */
  fen?: string;
  /** A whole game to open on — a `?game=` arrival. Does not turn the board. */
  tree?: GameTree;
  /** The mainline ply an arriving game opens at — `?move=`, or its `StartPly`. */
  ply?: number;
  /** A saved analysis to go on working on — `?analysis=`. Beats everything else. */
  resume?: SavedAnalysis;
  /**
   * A whole tree handed over in the location state (`lib/analysisHandOff.ts`,
   * the Openings explorer's Analysis button): a new board, not yet saved,
   * facing the way it was handed over. Beats `tree` and `fen`.
   */
  handOff?: AnalysisHandOff;
  /** A permanent link's position, SAN from the start — `?at=`. Beats `ply` and the record's own place. */
  at?: string | null;
};

/** A tree that is nothing yet — the standard start, no moves. */
const isBlankTree = (tree: GameTree): boolean =>
  tree.moves.length === 0 && tree.startFen === DEFAULT_POSITION;

export const useAnalysisBoard = ({
  fen,
  tree: arrivedTree,
  ply,
  resume,
  handOff,
  at,
}: AnalysisBoardStart = {}) => {
  /*
    What the board opens on, built once: a reopened record (parsed, and its
    place in it), else a game, else a position, else the standard start. Built
    here rather than by the core so the baseline is the very tree the core
    holds — `tree !== baseline` would otherwise be true from the first render.
    A record that will not parse opens as nothing, like an unreadable `?fen=`.
  */
  const [start] = useState(() => {
    const reopened = resume === undefined ? undefined : savedAnalysisToTree(resume);
    const handedOver = reopened === undefined ? handOff : undefined;
    const tree =
      reopened ??
      handedOver?.tree ??
      arrivedTree ??
      (fen === undefined ? emptyTree() : emptyTree(fen));
    const linked = at === undefined || at === null ? null : nodeAtParam(tree, at);
    const nodeId =
      linked ??
      (reopened !== undefined && resume !== undefined
        ? savedAnalysisNode(resume, reopened)
        : undefined);
    // A position turns the board; a game does not; a record and a hand-off keep their own.
    const orientation: "white" | "black" =
      reopened !== undefined && resume !== undefined
        ? resume.orientation
        : handedOver !== undefined
          ? handedOver.orientation
          : arrivedTree === undefined && fen !== undefined && turnOf(fen) === "b"
          ? "black"
          : "white";
    return {
      tree,
      nodeId: nodeId ?? undefined,
      // `?move=` is a mainline ply of a game; a record or a link beats it.
      ply:
        reopened === undefined && handedOver === undefined && linked === null && arrivedTree !== undefined
          ? ply
          : undefined,
      orientation,
      record: reopened === undefined ? null : (resume ?? null),
      handedOver: handedOver !== undefined,
    };
  });

  const session = useAnalysisSession({
    tree: start.tree,
    ply: start.ply,
    nodeId: start.nodeId,
    orientation: start.orientation,
    settings: start.record?.settings,
  });
  const { core, engine, settings, changed, rebase } = session;
  const { loadTree, setOrientation } = core;
  const { clearAnalysis } = engine;

  const [record, setRecord] = useState<SavedAnalysis | null>(start.record);
  /** A tree the reader loaded (Load tab, Clear, a hand-off) and has not saved yet. */
  const [loadedUnsaved, setLoadedUnsaved] = useState(start.handedOver);
  const [problem, setProblem] = useState<SavedAnalysisProblem | null>(null);

  /** Whether leaving now would lose something — what `beforeunload` asks about. */
  const unsaved = changed || (loadedUnsaved && !isBlankTree(core.tree));
  /** Whether there is anything Save could write. */
  const canSave = changed || (record === null && !isBlankTree(core.tree));

  /** The record the session would write under `id` — the tree, where the reader is, how it faces. */
  const recordOf = (id: string, savedAt?: string): SavedAnalysis => {
    const now = new Date();
    return savedAnalysisOf(
      id,
      core.tree,
      sanPathTo(core.tree, core.nodeId),
      settings,
      core.orientation,
      now,
      savedAt ?? now.toISOString(),
    );
  };

  /** A record's settings as stored — what Update and Save as copy keep. */
  const storedSettings = () => {
    const stored = record === null ? null : (findSavedAnalysis(record.id) ?? record);
    return stored === null
      ? null
      : {
          name: stored.name,
          folderId: stored.folderId,
          orientation: stored.orientation,
          description: stored.description,
          showArrows: stored.showArrows,
        };
  };

  /** The session is the record now: its tree the baseline. */
  const settle = (saved: SavedAnalysis, tree: GameTree) => {
    setRecord(saved);
    rebase(tree);
    setLoadedUnsaved(false);
    setProblem(null);
  };

  /**
   * A board with no record yet, saved: named, filed, facing the way the board
   * faces and drawing arrows as the board does. `undefined` on failure.
   */
  const saveNew = (
    name: string,
    folderId: string | null,
    showArrows: boolean,
  ): Promise<SavedAnalysis | undefined> =>
    write({ ...recordOf(newSavedAnalysisId()), name: name.trim(), folderId, showArrows });

  /**
   * The write, and the session settled on it once it has landed — against the
   * tree that was written, not whatever the board holds by the time the
   * store answers.
   */
  const write = async (saved: SavedAnalysis): Promise<SavedAnalysis | undefined> => {
    const written = core.tree;
    const failed = await saveAnalysis(saved);
    if (failed !== undefined) {
      setProblem(failed);
      return undefined;
    }
    settle(saved, written);
    return saved;
  };

  /**
   * **Update**: the record takes the session's tree, place in it and engine
   * settings. Its own settings are the stored ones — edited on its settings
   * screen or filed on the saved list since it was opened, that stands.
   */
  const update = async (): Promise<SavedAnalysis | undefined> => {
    const stored = storedSettings();
    if (record === null || stored === null) return undefined;
    const savedAt = (findSavedAnalysis(record.id) ?? record).savedAt;
    return write({ ...recordOf(record.id, savedAt), ...stored });
  };

  /**
   * **Save as copy**: a new record with the original's settings and folder;
   * the session goes on in it.
   */
  const saveCopy = async (name: string): Promise<SavedAnalysis | undefined> => {
    const stored = storedSettings();
    if (stored === null) return undefined;
    return write({ ...recordOf(newSavedAnalysisId()), ...stored, name: name.trim() });
  };

  /** **Discard**: back to the baseline, on the last of its positions on the way here. */
  const discard = () => {
    session.discard();
    setProblem(null);
  };

  /**
   * A new game on the board — a PGN loaded, a merge, the Clear button: a new
   * analysis, not yet saved. The record the session was on is left as it was.
   */
  const loadNew = useCallback(
    (next: GameTree) => {
      loadTree(next);
      clearAnalysis();
      setRecord(null);
      rebase(next);
      setLoadedUnsaved(true);
      setProblem(null);
    },
    [clearAnalysis, loadTree, rebase],
  );

  /** A pasted FEN: a new analysis of that position, facing the side to move. Throws `FenParseError`. */
  const loadFen = useCallback(
    (text: string) => {
      const parsed = parseFen(text);
      loadNew(emptyTree(parsed));
      setOrientation(turnOf(parsed) === "b" ? "black" : "white");
    },
    [loadNew, setOrientation],
  );

  const clearBoard = useCallback(() => loadNew(emptyTree()), [loadNew]);

  return {
    core,
    engine,
    settings,
    updateSettings: session.updateSettings,
    engineOn: session.engineOn,
    setEngineOn: session.setEngineOn,
    playing: session.playing,
    thinking: session.thinking,
    togglePlaying: session.togglePlaying,
    showEvalBar: session.showEvalBar,
    setShowEvalBar: session.setShowEvalBar,
    record,
    changed,
    unsaved,
    canSave,
    extensionIds: session.extensionIds,
    problem,
    saveNew,
    update,
    saveCopy,
    discard,
    loadNew,
    loadFen,
    clearBoard,
  };
};
