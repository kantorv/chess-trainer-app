import { useCallback, useMemo, useState } from "react";
import {
  DEFAULT_ENGINE_SETTINGS,
  SETTING_UCI_OPTION,
  type EngineSettings,
} from "../../../lib/engineSettings";
import { mainlineGame } from "../../../lib/gameTree";
import { parsePgnTree } from "../../../lib/pgn";
import {
  newSavedGameId,
  savedGameEvalsMap,
  savedGameOf,
  type SavedGame,
} from "../../../lib/savedGames";
import { saveDevGame } from "../core/devStores";
import { useAutosave } from "../core/useAutosave";
import { isTerminal, turnOf, useBoardCore } from "../core/useBoardCore";
import { useEngineModule } from "../core/useEngineModule";

/**
 * **Play with Engine v2, and Masked Pieces v2** — §4 of
 * [`.claude/rules/chessboard-v2.md`](../../../../.claude/rules/chessboard-v2.md).
 *
 * One hook, called by two screens. That is the point: Masked Pieces v2 derives
 * from Play v2 by **adding a mask** and nothing else — the same composition,
 * the same board, the same panel — so there is no mode flag anywhere in the
 * core, and the masking stays where `.claude/rules/chessboard.md` §5 requires
 * it, between the state and the pixels.
 *
 * ```
 * useBoardCore      — the tree, plus `canMoveAt: isLive`, which is what keeps it linear
 * useEngineModule   — the search, the per-FEN evals, AND the reply (`onBestMove`)
 * useAutosave       — the game written down as it is played, to the DEV key
 * ```
 *
 * ## The linear board is the degenerate tree, not a second shape
 *
 * The base holds a `GameTree` here as it does everywhere. What makes this a
 * game rather than an analysis is one predicate: `canMoveAt: (_, { isLive })
 * => isLive`, so a drag from an earlier ply is refused and no branch can ever
 * form. Stepping back and looking is still free — that is what the move list is
 * for — and the engine's reply goes to the **end of the mainline** through
 * `appendMove`, never under the node being looked at.
 *
 * What the board gains by holding a tree anyway is everything written against
 * one: the merged move list (CTA-53), the next-moves bar (CTA-54) and the
 * pinned click-to-play variations (CTA-55), none of which the shipped play
 * screen ever got.
 *
 * ## The reply, and its guard
 *
 * The engine module calls `onBestMove` for every finished search. **This** hook
 * owns the decision, because only it knows whose turn it is:
 *
 * - the search must have been for the **live** position, or a result the reader
 *   stepped away from would move a piece behind their back;
 * - it must be the engine's turn there;
 * - the game must not be over.
 *
 * With `engineOn` off the reader plays both sides and the reply is not played
 * at all — the switch gates the module's searching, and this guard gates the
 * move.
 */

export type PlayBoardStart = {
  /** The position the game starts from — the `?fen=` hand-off. */
  fen?: string;
  /** A dev saved game to play on from — the `?saved=` hand-off. */
  resume?: SavedGame;
  /** Whether the game is written to the dev games store as it is played. */
  persist?: boolean;
};

export const usePlayBoard = ({
  fen: initialFen,
  resume,
  persist = false,
}: PlayBoardStart = {}) => {
  /*
    A resumed game, parsed once. The PGN is the only record there is, so playing
    on means loading it — and a linear PGN through `parsePgnTree` is a tree with
    one line, which is exactly the degenerate case the base is built for. A
    record that will not parse resumes as nothing at all, the same answer an
    unreadable `?fen=` gets.
  */
  const reopened = useMemo(() => {
    if (resume === undefined) return undefined;
    try {
      const tree = parsePgnTree(resume.pgn);
      return { tree, game: mainlineGame(tree) };
    } catch {
      return undefined;
    }
  }, [resume]);

  const core = useBoardCore({
    fen: initialFen,
    tree: reopened?.tree,
    /*
      A resumed game opens at its **last** ply, not at ply 0. Every other
      arrival here is a position, where ply 0 is all there is; a resumed game is
      one the reader is in the middle of, and the live position is the only one
      it can be played on from.
    */
    ply: reopened === undefined ? undefined : reopened.game.moves.length,
    // Facing the side the human plays — otherwise a game handed over with
    // Black to move opens from behind the opponent's pieces.
    orientation:
      resume !== undefined
        ? resume.settings.playAs
        : initialFen !== undefined && turnOf(initialFen) === "b"
          ? "black"
          : undefined,
    dirty: resume !== undefined,
    // The one seam that makes this board linear — see the header note.
    canMoveAt: useCallback(
      (_fen: string, { isLive }: { isLive: boolean }) => isLive,
      [],
    ),
  });

  const [settings, setSettings] = useState<EngineSettings>(() => {
    // A resumed game brings its own: the engine has to go on playing at the
    // strength, and on the side, the game was played at.
    if (resume !== undefined) return resume.settings;
    return initialFen === undefined || turnOf(initialFen) === "w"
      ? DEFAULT_ENGINE_SETTINGS
      : { ...DEFAULT_ENGINE_SETTINGS, playAs: "black" };
  });
  const [engineOn, setEngineOn] = useState(true);
  const [showEvalBar, setShowEvalBar] = useState(true);

  const humanColor = settings.playAs === "white" ? "w" : "b";

  /*
    The engine's reply. `appendMove` puts it at the end of the mainline
    whatever the reader is looking at, and the guard is the whole of what makes
    that safe: a result for a position they stepped away from, or for the
    human's own turn, is analysis and nothing more.
  */
  const { liveFen, appendMove } = core;
  const onBestMove = useCallback(
    (bestMove: string, searchedFen: string) => {
      if (!engineOn) return;
      if (searchedFen !== liveFen) return;
      if (turnOf(liveFen) === humanColor) return;
      if (isTerminal(liveFen)) return;
      appendMove(bestMove);
    },
    /*
      The two pieces of the core it actually reads, rather than the whole
      object: the engine module takes this as an effect dependency, so naming
      `core` here would re-subscribe on every render instead of only when the
      live position moves.
    */
    [appendMove, engineOn, humanColor, liveFen],
  );

  const onUciOptionsReady = useCallback(
    (clamped: Readonly<Record<string, number>>) =>
      setSettings((current) => {
        const next: EngineSettings = {
          ...current,
          skillLevel:
            clamped[SETTING_UCI_OPTION.skillLevel] ?? current.skillLevel,
          multiPv: clamped[SETTING_UCI_OPTION.multiPv] ?? current.multiPv,
          threads: clamped[SETTING_UCI_OPTION.threads] ?? current.threads,
          hashMb: clamped[SETTING_UCI_OPTION.hashMb] ?? current.hashMb,
        };
        // A new object here would re-run the search effect for nothing.
        return next.skillLevel === current.skillLevel &&
          next.multiPv === current.multiPv &&
          next.threads === current.threads &&
          next.hashMb === current.hashMb
          ? current
          : next;
      }),
    [],
  );

  const engine = useEngineModule({
    enabled: engineOn,
    // The position ON SCREEN, not the live one: everything the panel shows
    // describes the ply being looked at.
    fen: core.fen,
    depth: settings.depth,
    moveTimeMs: settings.moveTimeMs,
    uciOptions: useMemo(
      () => ({
        [SETTING_UCI_OPTION.skillLevel]: settings.skillLevel,
        [SETTING_UCI_OPTION.multiPv]: settings.multiPv,
        [SETTING_UCI_OPTION.threads]: settings.threads,
        [SETTING_UCI_OPTION.hashMb]: settings.hashMb,
      }),
      [
        settings.skillLevel,
        settings.multiPv,
        settings.threads,
        settings.hashMb,
      ],
    ),
    onUciOptionsReady,
    onBestMove,
  });

  /*
    A resumed game's evals come out of its record, keyed back to the FENs the
    engine reported them under; everything learned from here on comes from the
    engine module. The two are merged rather than seeded into it, because the
    module owns what it learned and this hook owns what arrived.
  */
  const resumedEvals = useMemo(
    () =>
      reopened === undefined
        ? undefined
        : savedGameEvalsMap(resume?.evals, reopened.game),
    [reopened, resume],
  );
  const evalsByFen = useMemo(() => {
    if (resumedEvals === undefined || resumedEvals.size === 0) {
      return engine.evalsByFen;
    }
    const merged = new Map(resumedEvals);
    for (const [fen, score] of engine.evalsByFen) merged.set(fen, score);
    return merged;
  }, [engine.evalsByFen, resumedEvals]);

  const [savedId, setSavedId] = useState<string | null>(resume?.id ?? null);
  const nextSavedId = savedId ?? newSavedGameId();

  /*
    The game as a record, or `undefined` while there is nothing worth writing: a
    game with no moves is not a game yet, so an untouched board writes no row.
    It is the **mainline** that is written, which on this board is the whole
    game — `canMoveAt` is what guarantees there is nothing else.
  */
  const record = useMemo(() => {
    const game = mainlineGame(core.tree);
    if (game.moves.length === 0) return undefined;
    return savedGameOf(
      nextSavedId,
      game,
      settings,
      undefined,
      undefined,
      undefined,
      evalsByFen,
    );
  }, [core.tree, evalsByFen, nextSavedId, settings]);

  const save = useCallback((game: SavedGame) => {
    // Remembering the id is what makes "save on every move" one growing row.
    setSavedId(game.id);
    saveDevGame(game);
  }, []);

  useAutosave({ enabled: persist, record, save });

  /**
   * Back to the position this screen opened on — the handed-over one when there
   * was one. A new row for the new game: the one just abandoned keeps the id it
   * was saved under, so it stays in the list rather than being overwritten,
   * which is the whole difference between a saved game and an autosave slot.
   */
  const newGame = useCallback(() => {
    core.reset();
    engine.clearAnalysis();
    setSavedId(null);
  }, [core, engine]);

  const updateSettings = useCallback(
    (patch: Partial<EngineSettings>) =>
      setSettings((current) => ({ ...current, ...patch })),
    [],
  );

  return {
    ...core,
    ...engine,
    evalsByFen,
    settings,
    updateSettings,
    engineOn,
    setEngineOn,
    showEvalBar,
    setShowEvalBar,
    humanColor,
    newGame,
    /**
     * True while it is the engine's turn at the live position and the game is
     * on — the board locks on it. Off, the reader plays both sides, so the
     * engine is never "thinking".
     */
    isEngineThinking:
      engineOn &&
      core.isLive &&
      !isTerminal(core.fen) &&
      turnOf(core.fen) !== humanColor,
  };
};

export type PlayBoardState = ReturnType<typeof usePlayBoard>;
