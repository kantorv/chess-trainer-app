import { useCallback, useMemo, useRef, useState } from "react";

import {
  DEFAULT_ENGINE_SETTINGS,
  uciOptionsOf,
  withClampedUciOptions,
  type EngineSettings,
} from "../../../lib/engineSettings";
import { parseFen } from "../../../lib/fen";
import { emptyTree, sanPathTo } from "../../../lib/gameTree";
import { newGameRequestOf, type NewGameRequest } from "../../../lib/newGameLink";
import {
  findPlayedGame,
  removePlayedGame,
  savePlayedGame,
  type PlayedGameProblem,
} from "../../../lib/playedGameStore";
import {
  newPlayedGameId,
  playedGameEvalsMap,
  playedGameNode,
  playedGameOf,
  playedGameToTree,
  type PlayedGame,
  type PlayedGameMask,
} from "../../../lib/playedGames";
import { useAutosave } from "../../board/core/useAutosave";
import { turnOf, useBoardCore } from "../../board/core/useBoardCore";
import { useEngineModule } from "../../board/core/useEngineModule";
import { usePlayToggle } from "../../board/core/usePlayToggle";

/**
 * **Play with Engine's session** (CTA-74) — the v2 core
 * ([`.claude/rules/chessboard.md`](../../../../.claude/rules/chessboard.md) §9)
 * composed for a game against the engine: the Analysis Board's composition
 * (`useAnalysisBoard`), with three differences.
 *
 * ```
 * useBoardCore      — the tree, the node, the oracle, promotion, orientation
 * useEngineModule   — searching the position on screen, per-FEN evals, and the reply…
 * usePlayToggle     — …played for the side not at the bottom, only while Play is on
 * useAutosave       — the game written down on every move (lib/playedGameStore.ts)
 * ```
 *
 * 1. **Play is on from the start.** A new board — the standard start, or the
 *    `?fen=` hand-off (a position with Black to move sets the reader to Black
 *    and turns the board) — with the reader on the side at the bottom and the
 *    engine answering. The Lobby's Start link (CTA-82) adds the options —
 *    the settings, the side (which beats the FEN's) and the eval bar. Everything that pauses Play on the Analysis Board
 *    pauses it here (`usePlayToggle`): a step that is not one move forward,
 *    the reader switching side (the flip, or the header's side toggle), the
 *    engine off, the game over. Pressing Play goes on from wherever the reader
 *    stands, the engine now playing whichever side is at the top.
 * 2. **The game is a tree.** A move played by hand from an earlier position
 *    is a side line under it, and Play resumes from there — the Analysis
 *    Board's rule.
 * 3. **It saves itself.** No Save button — a game played is a game kept
 *    (`useAutosave`). The id is stable for the life of a game. **Replay**
 *    starts over and **discards** the game's saved progress — its record is
 *    removed, and the new game is written under a new id. The record is
 *    the tree, the settings (their `playAs` the reader's side, which is the
 *    orientation), where the reader stands and the evals; the store is
 *    idempotent, so a mount or the settings clamp re-orders nothing.
 *
 * The reader's side *is* the orientation, so the header's side toggle turns
 * the board, and the board's flip changes the side — one state, not two to
 * keep in step.
 *
 * **Resigning** ends the game: the reader's side loses (`resigned` on the
 * record, its PGN `Result` and `Termination`), Play stays off and the board
 * takes no more moves — it can still be stepped through and analysed.
 *
 * **A costume** (`mask`, Masked Pieces — CTA-79) is written on the record and
 * nothing else: this hook never reads it, so the game, the engine and Play
 * are the true position's. It is the screen's state (the Masking tab), passed
 * in on every render, and a change of it is written in place.
 */

export type PlayGameStart = {
  /** The position the game starts from — the `?fen=` hand-off. */
  fen?: string;
  /** A played game to go on with — the `?saved=` hand-off. Beats everything else. */
  resume?: PlayedGame;
  /**
   * A new game's options — the Lobby's Start link (`lib/newGameLink.ts`,
   * CTA-82): settings over the defaults, the reader's side (beats the side to
   * move of `fen`) and the eval bar. Ignored when `resume` opens.
   */
  request?: NewGameRequest;
};

/**
 * Everything the URL hands a play screen, read once by its route — `?fen=`
 * (validated; an unreadable one starts an ordinary game), `?saved=`, and a
 * new game's options (`side`, `skill`, `depth`, `movetime`, `lines`,
 * `threads`, `hash`, `evalbar` — `newGameRequestOf`, each field validated on
 * its own). `random` draws a `side=random`.
 */
export const arrivalOf = (
  params: URLSearchParams,
  random: () => number = Math.random,
): PlayGameStart => {
  let fen: string | undefined;
  const requestedFen = params.get("fen");
  if (requestedFen !== null) {
    try {
      fen = parseFen(requestedFen);
    } catch {
      // A link nobody can read starts an ordinary game.
      fen = undefined;
    }
  }
  return {
    fen,
    resume: findPlayedGame(params.get("saved")),
    request: newGameRequestOf(params, random),
  };
};

export const usePlayGame = (
  { fen, resume, request }: PlayGameStart = {},
  /** Masked Pieces' costume, stored on the record; absent, an unmasked game. */
  mask?: PlayedGameMask,
) => {
  /*
    What the board opens on, built once: a resumed game (parsed, at its place
    in the tree, facing its side), else a position, else the standard start —
    a new game under the link's options, if it carried any.
    A record that will not parse opens as a new game, like an unreadable
    `?fen=`.
  */
  const [start] = useState(() => {
    const tree = resume === undefined ? undefined : playedGameToTree(resume);
    if (resume !== undefined && tree !== undefined) {
      return {
        tree,
        nodeId: playedGameNode(resume, tree),
        orientation: resume.settings.playAs,
        settings: resume.settings,
        evals: playedGameEvalsMap(resume.evals),
        id: resume.id,
        startedAt: resume.savedAt,
        resigned: resume.resigned,
        stored: true,
        showEvalBar: true,
      };
    }
    /*
      A position turns the board, and the reader plays the side to move —
      unless the link names the reader's side, which is the reader's choice.
    */
    const orientation: "white" | "black" =
      request?.side ?? (fen !== undefined && turnOf(fen) === "b" ? "black" : "white");
    return {
      tree: fen === undefined ? emptyTree() : emptyTree(fen),
      nodeId: null,
      orientation,
      settings: { ...DEFAULT_ENGINE_SETTINGS, ...request?.settings, playAs: orientation },
      evals: new Map(),
      id: newPlayedGameId(),
      startedAt: new Date().toISOString(),
      resigned: undefined,
      stored: false,
      showEvalBar: request?.evalBar ?? true,
    };
  });

  const core = useBoardCore({
    tree: start.tree,
    nodeId: start.nodeId,
    orientation: start.orientation,
  });

  const [settings, setSettings] = useState<EngineSettings>(start.settings);
  const [engineOn, setEngineOn] = useState(true);
  const [showEvalBar, setShowEvalBar] = useState(start.showEvalBar);

  const onUciOptionsReady = useCallback(
    // The same object when nothing moved: a new one would re-run the search effect for nothing.
    (clamped: Readonly<Record<string, number>>) =>
      setSettings((current) => withClampedUciOptions(current, clamped)),
    [],
  );

  /** The side that resigned — the reader's; `undefined` while the game is on. */
  const [resigned, setResigned] = useState<"white" | "black" | undefined>(start.resigned);
  const play = usePlayToggle({
    core,
    engineOn,
    initial: start.resigned === undefined,
    finished: resigned !== undefined,
  });

  const engine = useEngineModule({
    enabled: engineOn,
    // The position ON SCREEN: everything the panel shows describes it.
    fen: core.fen,
    depth: settings.depth,
    moveTimeMs: settings.moveTimeMs,
    uciOptions: useMemo(
      () =>
        uciOptionsOf({
          skillLevel: settings.skillLevel,
          multiPv: settings.multiPv,
          threads: settings.threads,
          hashMb: settings.hashMb,
        }),
      [settings.skillLevel, settings.multiPv, settings.threads, settings.hashMb],
    ),
    onUciOptionsReady,
    onBestMove: play.onBestMove,
  });

  /*
    A resumed game's evals come out of its record; everything learned from here
    on comes from the engine module. Merged, not seeded: the module owns what
    it learned and this hook what arrived.
  */
  const evalsByFen = useMemo(() => {
    if (start.evals.size === 0) return engine.evalsByFen;
    const merged = new Map(start.evals);
    for (const [key, score] of engine.evalsByFen) merged.set(key, score);
    return merged;
  }, [engine.evalsByFen, start.evals]);

  /** The reader's side — the side at the bottom of the board. */
  const playAs = core.orientation;

  const [gameId, setGameId] = useState(start.id);
  /** When the game began — its `savedAt`, and so its PGN `Date`. */
  const [startedAt, setStartedAt] = useState(start.startedAt);
  /** Whether this game is a row of the store yet — what the URL names. */
  const [stored, setStored] = useState(start.stored);
  const [problem, setProblem] = useState<PlayedGameProblem | null>(null);

  /*
    The game as a record, or `undefined` while there is nothing worth writing:
    no moves, or a game the reader has not touched.
  */
  const record = useMemo(() => {
    if (core.tree.moves.length === 0 || !(core.dirty || stored)) return undefined;
    return playedGameOf(
      gameId,
      core.tree,
      sanPathTo(core.tree, core.nodeId),
      { ...settings, playAs },
      evalsByFen,
      new Date(),
      startedAt,
      resigned,
      mask,
    );
  }, [
    mask,
    core.tree,
    core.nodeId,
    core.dirty,
    stored,
    gameId,
    startedAt,
    resigned,
    settings,
    playAs,
    evalsByFen,
  ]);

  /*
    The write is a promise (IndexedDB). Its answer is taken only while it is
    about the game on screen: a Replay while a write is out gives the board a
    new id, and the old game's answer must not mark the new one stored.
  */
  const currentId = useRef(start.id);
  const save = useCallback((game: PlayedGame) => {
    void savePlayedGame(game).then((failed) => {
      if (currentId.current !== game.id) return;
      setProblem(failed ?? null);
      if (failed === undefined) setStored(true);
    });
  }, []);

  useAutosave({ enabled: true, record, save });

  const { reset, setOrientation } = core;
  const { clearAnalysis } = engine;

  /**
   * **Replay**: the game starts over from the position it started from, on the
   * same side, Play on — and its saved progress is **discarded**: the record
   * is removed from the list, and the new game is written under a new id.
   */
  const replay = () => {
    // Removed whether or not its first write has landed yet: the queue runs
    // this after it, and an id not there is a no-op.
    void removePlayedGame(gameId);
    reset();
    clearAnalysis();
    const nextId = newPlayedGameId();
    currentId.current = nextId;
    setGameId(nextId);
    setStartedAt(new Date().toISOString());
    setStored(false);
    setResigned(undefined);
    setProblem(null);
    play.restart();
  };

  /** Whether there is a game to resign: a move played, and not resigned yet. */
  const canResign = resigned === undefined && core.tree.moves.length > 0;

  /** **Resign**: the reader's side loses; Play stops and the board takes no more moves. */
  const resign = () => {
    if (!canResign) return;
    core.markDirty();
    setResigned(playAs);
  };

  /** The settings' changes — the Engine tab's, and the header's side (`playAs`, which is the orientation). */
  const updateSettings = useCallback(
    (patch: Partial<EngineSettings>) => {
      const { playAs: side, ...rest } = patch;
      if (side !== undefined) setOrientation(side);
      if (Object.keys(rest).length > 0) setSettings((current) => ({ ...current, ...rest }));
    },
    [setOrientation],
  );

  return {
    core,
    engine,
    evalsByFen,
    settings: { ...settings, playAs },
    updateSettings,
    engineOn,
    setEngineOn,
    showEvalBar,
    setShowEvalBar,
    playing: play.playing,
    thinking: play.thinking,
    togglePlaying: () => play.toggle(engine.analysis, evalsByFen),
    replay,
    resigned,
    canResign,
    resign,
    /** The id the game is written under, once it has been — what `?saved=` names. */
    savedId: stored ? gameId : null,
    problem,
  };
};
