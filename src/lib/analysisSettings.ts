/**
 * **The engine knobs an analysis is worked under** — the value the Analysis
 * Board's Engine tab drives, and the value a saved analysis carries so reopening
 * one puts the engine back the way it was.
 *
 * It lived in `views/tools/analysis/useAnalysisBoard.ts` until a saved analysis
 * had to record it, and then moved here for the reason
 * [`engineSettings.ts`](./engineSettings.ts) exists: `lib/savedAnalyses.ts` is
 * plain data and cannot import a hook. Nothing else changed —
 * `AnalysisSettings.tsx` still imports these from the hook, which re-exports
 * them, so that hook stays the one module a reader of the screen has to open.
 *
 * As there, it is **not** a description of the running engine. Which knobs the
 * worker actually has is `Engine.options`' business
 * (`.claude/rules/chessboard.md` §4.1), so a stored value is a *request* that
 * the hook clamps to whatever the running build declared.
 */

/** The knobs the Analysis Board's Engine tab drives. */
export type AnalysisSettings = {
  /** Plies per search. */
  depth: number;
  /** UCI `MultiPV` — how many lines the Variations tab shows. */
  multiPv: number;
  /** Milliseconds per search; `0` means "depth alone decides". */
  moveTimeMs: number;
};

export const DEFAULT_ANALYSIS_SETTINGS: AnalysisSettings = {
  depth: 16,
  multiPv: 3,
  moveTimeMs: 1000,
};

/**
 * Which UCI option each setting drives. The names are the engine's; whether the
 * running build *has* them is answered by `Engine.options`, never by this table.
 *
 * `Skill Level` is deliberately absent. An analysis board wants the engine's
 * best answer, so it never weakens it — and the build's own default is full
 * strength, so there is nothing to post.
 */
export const ANALYSIS_UCI_OPTION = {
  multiPv: "MultiPV",
} as const satisfies Partial<Record<keyof AnalysisSettings, string>>;

const finiteNumber = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;

/**
 * Read settings back out of stored JSON, filling in the default for anything
 * missing, mistyped or nonsensical. Never throws — a stored record is text
 * another version of this app wrote, so what cannot be read is replaced rather
 * than allowed to reach the engine.
 */
export const analysisSettingsFrom = (value: unknown): AnalysisSettings => {
  if (typeof value !== "object" || value === null) {
    return { ...DEFAULT_ANALYSIS_SETTINGS };
  }
  const row = value as Record<string, unknown>;

  return {
    depth: finiteNumber(row.depth, DEFAULT_ANALYSIS_SETTINGS.depth),
    multiPv: finiteNumber(row.multiPv, DEFAULT_ANALYSIS_SETTINGS.multiPv),
    moveTimeMs: finiteNumber(
      row.moveTimeMs,
      DEFAULT_ANALYSIS_SETTINGS.moveTimeMs,
    ),
  };
};

/** Whether two settings would drive the engine identically. */
export const sameAnalysisSettings = (
  a: AnalysisSettings,
  b: AnalysisSettings,
): boolean =>
  a.depth === b.depth &&
  a.multiPv === b.multiPv &&
  a.moveTimeMs === b.moveTimeMs;
