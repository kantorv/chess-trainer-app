import { useEffect } from "react";

/**
 * **The persistence capability** — §9.2.3 of
 * [`.claude/rules/chessboard.md`](../../../../.claude/rules/chessboard.md).
 *
 * Write-on-change, and nothing else. A board composes this when its work is
 * worth keeping by the fact of having been done; the record is built by the
 * screen, because only the screen knows what its record *is*.
 *
 * Three things it deliberately does not do:
 *
 * - **It does not decide what is worth writing.** `record` is `undefined` while
 *   there is nothing — an untouched board, a game with no moves, a board the
 *   reader has only looked at — so merely visiting a screen writes no row.
 * - **It does not de-duplicate.** The stores are idempotent already
 *   (`saveGame` / `saveAnalysis` compare against what is stored and do nothing
 *   when the record would be identical), which is what keeps a mount, or the
 *   clamp that pulls the settings into the running build's bounds, from
 *   re-ordering a list sorted by when each row was last worked on. Repeating
 *   that comparison here would be a second copy of a rule that already has an
 *   owner.
 * - **It does not know which store.** `save` is passed in, which is how the
 *   same capability serves the dev games store, the dev analyses store and
 *   whatever the sixth board writes to.
 *
 * It is an effect on the record rather than a call inside the move handlers
 * because on most boards more than one thing produces a change — a human move,
 * the engine's reply, a settings change, a step to a different node — and only
 * one of them would otherwise be covered.
 *
 * **The Openings explorer does not use this** (CTA-78): an opening is
 * explored, not kept — it saves nothing, and hands its tree to the Analysis
 * Board instead. That is the screen's semantics, not an omission.
 */
export const useAutosave = <T>({
  enabled,
  record,
  save,
}: {
  /** The screen's `persist`. Off, nothing is ever written. */
  enabled: boolean;
  /** What to write, or `undefined` while there is nothing worth writing. */
  record: T | undefined;
  /**
   * The store's write. Expected to be idempotent — see the note above.
   *
   * **Memoise it.** It is a dependency of the effect rather than a ref read
   * (`react-hooks/refs` rejects writing a ref during render, and the shipped
   * hooks make the same trade), so an inline arrow would re-run the write on
   * every render — harmless, because the stores compare before writing, but
   * wasteful for nothing.
   */
  save: (record: T) => void;
}): void => {
  useEffect(() => {
    if (!enabled || record === undefined) return;
    save(record);
  }, [enabled, record, save]);
};
