import { useCallback, useEffect, useRef, useState } from "react";
import Engine, { type EngineOption } from "../../../lib/engine";
import {
  EMPTY_ANALYSIS,
  pvToSan,
  scoreFromUci,
  withEngineLine,
  type Analysis,
  type Score,
} from "../../../lib/engineAnalysis";
import { isTerminal, turnOf } from "./useBoardCore";

/**
 * **The engine capability** — §9.2.1 of
 * [`.claude/rules/chessboard.md`](../../../../.claude/rules/chessboard.md),
 * and the whole of §4 of `.claude/rules/chessboard.md` in one file.
 *
 * A board composes this beside {@link useBoardCore} when it wants an engine.
 * Nothing about it is a flag inside the base, and nothing here knows which
 * screen is calling: it is handed a position and some numbers, and it reports
 * what the engine says about that position.
 *
 * ## What it owns, once, for every board
 *
 * - **The lifecycle discipline.** A lazy ref resolved at call time — never read
 *   during render, because StrictMode's mount → unmount → remount runs the
 *   cleanups and then the effects again with no render in between, so an engine
 *   captured during render would be dead for the rest of the session. The
 *   subscribe effect is declared **first**, so on that remount it is the one
 *   that rebuilds the worker before the search effect asks it for anything. And
 *   `terminate()` on unmount.
 * - **The `uci` handshake.** What the running worker declared is published as
 *   {@link EngineModule.engineOptions}, so a settings tab can say which knobs
 *   this build does not have rather than showing controls that do nothing. And
 *   the caller's requested values are **clamped into the bounds it declared**
 *   and reported back through {@link EngineModuleStart.onUciOptionsReady} — the
 *   generalization of the two shipped clamps, so this module never learns what
 *   a setting *means*. Without it the panel would show a number the engine
 *   never accepts (this build pins `Hash` to 16 and `Threads` to 1).
 * - **Option pushes before the search.** The `setOption` effect is declared
 *   ahead of the search effect, so on any render where both run the options go
 *   out before the `go` that should honour them. `Engine.setOption` itself
 *   buffers, drops a name this build does not have, and never posts during a
 *   search — §4.1.
 * - **Searching the position on screen**, not the live one. Switching off stops
 *   the running search rather than letting it finish quietly in the background:
 *   the worker shares the tab with the UI. A terminal position is not searched.
 * - **Per-FEN evals** (CTA-50/51): the score a search *finished* with, recorded
 *   when its `bestmove` lands — not per streamed line, each of which is
 *   shallower than the last. Keyed by FEN, so a position reached twice reads
 *   the same score twice, and never cleared by a load.
 * - **Normalising the score** through `lib/engineAnalysis.ts` against the turn
 *   of the **searched** FEN. On a board that can show an earlier ply that is a
 *   different side from the live one, and mixing them inverts every evaluation.
 *
 * ## The reply is a callback, and that is the whole Play/Analysis difference
 *
 * A board that passes no {@link EngineModuleStart.onBestMove} has no branch
 * that moves a piece — it does not exist for it. A board that passes one is
 * responsible for the guard: play it only if the search was for the live
 * position, it is the engine's turn, and the game is not over. That keeps the
 * property `useAnalysisBoard` defends today ("an analysis board never moves a
 * piece by itself") without a mode flag anywhere.
 */

export type EngineModuleStart = {
  /** The engine's switch. Off: nothing is searched and no lines are shown. */
  enabled: boolean;
  /** The position **on screen** — not necessarily the live one. */
  fen: string;
  /** `go depth`. Clamped to 24 by the wrapper. */
  depth: number;
  /** `go movetime`, in milliseconds. Omitted by the wrapper when 0. */
  moveTimeMs: number;
  /**
   * The UCI options this board wants set, by name. Pushed on change; a name
   * this build does not have is dropped by `Engine.setOption`.
   *
   * **Memoise it.** Three effects here take it as a dependency (rather than
   * reading it out of a ref, which `react-hooks/refs` rejects — the shipped
   * hooks make the same trade), so a fresh object literal every render would
   * restart the search on every render.
   */
  uciOptions: Readonly<Record<string, number>>;
  /**
   * The same names, with each value pulled into the bounds the running worker
   * declared — called once the handshake lands, and only when something
   * actually changed. The screen writes the clamped numbers back into its own
   * settings, which is what makes the panel and the engine agree.
   */
  onUciOptionsReady?: (clamped: Readonly<Record<string, number>>) => void;
  /**
   * The engine's move, and the position it was searched for. Present only on a
   * board where the engine plays — see the note above.
   */
  onBestMove?: (bestMove: string, searchedFen: string) => void;
};

export type EngineModule = {
  /** The lines for the position on screen, or an empty set. Never stale. */
  analysis: Analysis;
  /** The scores the engine has finished searching, keyed by the FEN they describe. */
  evalsByFen: ReadonlyMap<string, Score>;
  /** What the *running worker* declared it supports. Empty until `uciok`. */
  engineOptions: ReadonlyMap<string, EngineOption>;
  /** Clear the lines — what loading a different game does. */
  clearAnalysis: () => void;
};

export const useEngineModule = ({
  enabled,
  fen,
  depth,
  moveTimeMs,
  uciOptions,
  onUciOptionsReady,
  onBestMove,
}: EngineModuleStart): EngineModule => {
  const engineRef = useRef<Engine | null>(null);
  // Resolved at call time, never during render: see the header note.
  const getEngine = useCallback(() => (engineRef.current ??= new Engine()), []);

  const [analysis, setAnalysis] = useState<Analysis>(EMPTY_ANALYSIS);
  const [evals, setEvals] = useState<ReadonlyMap<string, Score>>(
    () => new Map(),
  );
  const [engineOptions, setEngineOptions] = useState<
    ReadonlyMap<string, EngineOption>
  >(() => new Map());

  /*
    The final score of the search in flight, remembered from the last top-line
    `info` and written down when that search's `bestmove` lands: a position's
    score is recorded when the search for it *completes*.
  */
  const latestScoreRef = useRef<{ fen: string; score: Score } | null>(null);

  /*
    Subscribe once per Engine instance — and re-subscribe when the caller's
    reply handler changes, because it closes over the position the reply has to
    be judged against. That is a dependency rather than a ref read because
    re-subscribing costs
    one Set entry (no worker is rebuilt), and the alternative is writing a ref
    during render, which `react-hooks/refs` rejects.

    Declared first: on a StrictMode remount this is the effect that rebuilds the
    worker, before the search effect below asks it for anything.
  */
  useEffect(() => {
    const unsubscribe = getEngine().onMessage((message) => {
      const { fen: searchedFen, pv, depth: reached, multipv, bestMove } = message;
      /*
        `fen` has no UCI equivalent — the wrapper stamps it on. Without it there
        is no telling a result for the position on screen from one still
        draining out of the search it replaced.
      */
      if (!searchedFen) return;

      if (pv && reached) {
        const score = scoreFromUci(message, turnOf(searchedFen));
        const rank = multipv ?? 1;

        if (rank === 1 && score !== null) {
          latestScoreRef.current = { fen: searchedFen, score };
        }

        setAnalysis((previous) =>
          withEngineLine(previous, searchedFen, {
            multipv: rank,
            score,
            depth: reached,
            san: pvToSan(searchedFen, pv),
          }),
        );
      }

      if (!bestMove) return;

      /*
        The search for this position is over: its final score is what the move
        list keeps, keyed by FEN. A search the switch interrupted still
        finished, so its score is recorded even with the engine off.
      */
      const final = latestScoreRef.current;
      latestScoreRef.current = null;
      if (final !== null && final.fen === searchedFen) {
        setEvals((previous) => {
          const existing = previous.get(searchedFen);
          if (
            existing !== undefined &&
            existing.kind === final.score.kind &&
            existing.value === final.score.value
          ) {
            return previous;
          }
          const next = new Map(previous);
          next.set(searchedFen, final.score);
          return next;
        });
      }

      // The reply. Absent on every board but the one that plays — and that
      // board owns the guard, because only it knows whose turn it is.
      onBestMove?.(bestMove, searchedFen);
    });

    return unsubscribe;
  }, [getEngine, onBestMove]);

  // Tear the worker down on unmount (and on StrictMode remount).
  useEffect(() => {
    return () => {
      engineRef.current?.terminate();
      engineRef.current = null;
    };
  }, []);

  /*
    Publish what the worker says it supports, once the handshake completes, and
    hand back the caller's option values pulled into the bounds it declared.
    The names are the caller's — this module never learns what one means.
  */
  useEffect(() => {
    const engine = getEngine();
    return engine.whenOptionsReady(() => {
      const options = new Map(engine.options);
      setEngineOptions(options);

      const clamped: Record<string, number> = {};
      let changed = false;
      for (const [name, value] of Object.entries(uciOptions)) {
        const option = options.get(name);
        const next =
          option?.min === undefined || option.max === undefined
            ? value
            : Math.min(Math.max(value, option.min), option.max);
        clamped[name] = next;
        if (next !== value) changed = true;
      }

      /*
        Only a real change goes back: an unconditional callback would set state
        on every mount and re-run everything keyed on the settings. It is also
        what makes this effect safe to re-run — once the caller has taken the
        clamped values, the requested ones equal them and nothing is reported
        again.
      */
      if (changed) onUciOptionsReady?.(clamped);
    });
  }, [getEngine, uciOptions, onUciOptionsReady]);

  /*
    Push the option-backed settings. Declared *before* the search effect so
    that on any render where both run, the options go out ahead of the `go`
    that should honour them.
  */
  useEffect(() => {
    const engine = getEngine();
    for (const [name, value] of Object.entries(uciOptions)) {
      engine.setOption(name, value);
    }
  }, [getEngine, uciOptions]);

  /*
    Search the position on screen — and only while the engine is switched on.
    Switching it off stops the running search rather than letting it finish
    quietly in the background: the worker shares the tab with the UI, and a
    switch labelled "off" that leaves a search running is a lie. The engine is
    not *created* to be stopped, though, so one that was never built stays
    unbuilt.
  */
  useEffect(() => {
    if (!enabled) {
      engineRef.current?.stop();
      return;
    }

    // Nothing to think about in a finished position. No state is cleared for
    // that: the analysis below is only handed on when its FEN matches.
    if (isTerminal(fen)) return;

    getEngine().search(fen, { depth, movetime: moveTimeMs });
    // `uciOptions` is a dependency so that changing a setting restarts the
    // search and is reflected in the lines immediately, rather than waiting
    // for the next move — which is what "takes effect on the next search"
    // means in practice.
  }, [getEngine, enabled, fen, depth, moveTimeMs, uciOptions]);

  const clearAnalysis = useCallback(() => setAnalysis(EMPTY_ANALYSIS), []);

  /*
    The lines only describe the position on screen once a result for it has
    come back, and only while the engine is on. Until then the previous
    position's lines are still in state, and showing them under a new board
    would be a lie.
  */
  const currentAnalysis: Analysis =
    enabled && analysis.fen === fen ? analysis : { fen, depth: 0, lines: [] };

  return {
    analysis: currentAnalysis,
    evalsByFen: evals,
    engineOptions,
    clearAnalysis,
  };
};
