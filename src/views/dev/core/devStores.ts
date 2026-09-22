import { sameEngineSettings } from "../../../lib/engineSettings";
import { recordStore } from "../../../lib/recordStore";
import {
  sameSavedGameEvals,
  savedGameFrom,
  type SavedGame,
} from "../../../lib/savedGames";

/**
 * **Where a dev board writes** — §2.4 of
 * [`.claude/rules/chessboard-v2.md`](../../../../.claude/rules/chessboard-v2.md).
 *
 * The Development screens persist to **separate dev-prefixed `localStorage`
 * keys**, through the shipped [`lib/recordStore.ts`](../../../lib/recordStore.ts)
 * factory and the shipped normaliser (`savedGameFrom`). Same record shape,
 * same code path, different key. (The dev analyses key went with Analysis v2,
 * which shipped as the Analysis Board in CTA-73 and writes the real store —
 * explicitly, on the reader's say-so; the dev openings key went with Openings
 * v2 in CTA-78, when the shipped Openings explorer stopped saving at all.)
 *
 * That is the whole point of the arrangement: autosave, resume and reopen are
 * genuinely exercised — not stubbed, not mocked — while a v2 bug can never
 * damage a real saved game. Wiping the dev keys leaves the
 * shipped records untouched, which `devStores.test.ts` asserts in both
 * directions.
 *
 * The caps and the idempotency comparisons are the shipped stores', reused
 * rather than restated: `sameEngineSettings` and `sameSavedGameEvals` live in `src/lib/`, so "a record identical to the
 * one stored is a no-op" means here exactly what it means there. The
 * cross-store folder operations are **not** reproduced: a dev board files
 * nothing, so the folder stores stay out of the Development section entirely.
 *
 * When v2 replaces the shipped screens, these keys go away with this
 * directory — nothing in `src/lib/` knows they exist.
 */

/** The dev keys. `dev` sits between the namespace and the record name. */
export const DEV_SAVED_GAMES_STORAGE_KEY = "chessapp.dev.savedGames.v1";

/** Every dev key, so a test — or a wipe — can name the whole set at once. */
export const DEV_STORAGE_KEYS = [DEV_SAVED_GAMES_STORAGE_KEY] as const;

/** The same budgets the shipped stores keep; a dev row is the same size. */
const MAX_DEV_ROWS = 30;

/** What went wrong with a write. One case, but named rather than boolean. */
export type DevStoreProblem = "storage";

/* ── dev saved games ──────────────────────────────────────────────────────── */

const devGames = recordStore<SavedGame>(
  DEV_SAVED_GAMES_STORAGE_KEY,
  savedGameFrom,
);

export const devSavedGamesSnapshot = devGames.snapshot;
export const subscribeDevSavedGames = devGames.subscribe;

/**
 * Keep one dev game, newest first — `saveGame`'s rules, over the dev key: a
 * game already there is replaced in place, and a record identical to the one
 * stored is a no-op, so mounting a resumed game does not re-order the list.
 * `savedAt` is the stored one, because a game begun yesterday is still
 * yesterday's game.
 */
export const saveDevGame = (game: SavedGame): DevStoreProblem | undefined => {
  const current = devSavedGamesSnapshot();
  const existing = current.find((row) => row.id === game.id);

  if (
    existing !== undefined &&
    existing.pgn === game.pgn &&
    sameEngineSettings(existing.settings, game.settings) &&
    sameSavedGameEvals(existing.evals, game.evals)
  ) {
    return undefined;
  }

  return devGames.write(
    [
      { ...game, savedAt: existing?.savedAt ?? game.savedAt },
      ...current.filter((row) => row.id !== game.id),
    ].slice(0, MAX_DEV_ROWS),
  );
};

export const findDevSavedGame = (
  id: string | null | undefined,
): SavedGame | undefined =>
  id === null || id === undefined
    ? undefined
    : devSavedGamesSnapshot().find((row) => row.id === id);

export const clearDevSavedGames = (): DevStoreProblem | undefined =>
  devGames.write([]);

/** Wipe every dev key at once — what a Development screen's reset offers. */
export const clearDevStores = (): void => {
  clearDevSavedGames();
};
