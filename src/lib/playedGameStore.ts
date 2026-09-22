import { sameEngineSettings } from "./engineSettings";
import type { GameCatalog } from "./gameCatalog";
import {
  playedGameCatalogOf,
  playedGameFrom,
  samePlayedGameEvals,
  samePlayedGameMask,
  type PlayedGame,
} from "./playedGames";
import { recordStore } from "./recordStore";

/**
 * Where the games against the engine are kept (CTA-74; Masked Pieces' too
 * since CTA-79): one `localStorage` key, a JSON array of {@link PlayedGame},
 * newest first — over the shared [`recordStore.ts`](./recordStore.ts), which
 * carries the reasoning for the scaffolding. Flat: no folders.
 *
 * ### Idempotent, and only a move re-orders
 *
 * The writer is the autosave effect, which runs on every change of the record
 * — a move, but also a step to another node (the record carries where the
 * reader stands), an engine score arriving and the settings clamp. So
 * {@link savePlayedGame} does nothing when the record is the one stored, and
 * **only a change of the moves moves a game to the top**: a new place in the
 * tree, a new eval, new settings or a new mask are written *in place*, with the stored
 * `updatedAt`. Newest first means the game last played, not last looked at.
 */

/** The `localStorage` key. Versioned, so a future shape change is a new key. */
export const PLAYED_GAMES_STORAGE_KEY = "chessapp.playedGames.v1";

/**
 * How many games are kept. A game is written on every move, and a tree with
 * its evals runs to a few kilobytes, so the bound keeps the origin's quota
 * safe; the oldest falls off the end rather than the newest being refused.
 */
export const MAX_PLAYED_GAMES = 100;

/** What went wrong with a write. */
export type PlayedGameProblem = "storage";

const games = recordStore<PlayedGame>(PLAYED_GAMES_STORAGE_KEY, playedGameFrom);

/** The played games, newest first. Stable between changes. */
export const playedGamesSnapshot = games.snapshot;

/** Subscribe to changes — this tab's writes, and other tabs' through `storage`. */
export const subscribePlayedGames = games.subscribe;

const write = games.write;

const samePath = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((san, index) => san === b[index]);

/**
 * Keep one game. A new id goes to the top; a changed PGN is replaced and
 * moved to the top; anything else that changed is written in place, keeping
 * the stored `updatedAt`; an identical record is a no-op. `savedAt` is always
 * the stored one.
 */
export const savePlayedGame = (game: PlayedGame): PlayedGameProblem | undefined => {
  const current = playedGamesSnapshot();
  const existing = current.find((row) => row.id === game.id);

  if (existing === undefined) {
    return write([game, ...current].slice(0, MAX_PLAYED_GAMES));
  }
  const movesChanged = existing.pgn !== game.pgn;
  if (
    !movesChanged &&
    samePath(existing.path, game.path) &&
    sameEngineSettings(existing.settings, game.settings) &&
    existing.resigned === game.resigned &&
    samePlayedGameMask(existing.mask, game.mask) &&
    samePlayedGameEvals(existing.evals, game.evals)
  ) {
    return undefined;
  }

  const next: PlayedGame = {
    ...game,
    savedAt: existing.savedAt,
    updatedAt: movesChanged ? game.updatedAt : existing.updatedAt,
  };
  return write(
    movesChanged
      ? [next, ...current.filter((row) => row.id !== game.id)]
      : current.map((row) => (row.id === game.id ? next : row)),
  );
};

/** One played game by id, or `undefined` — what resuming one starts from. */
export const findPlayedGame = (id: string | null | undefined): PlayedGame | undefined =>
  id === null || id === undefined
    ? undefined
    : playedGamesSnapshot().find((row) => row.id === id);

/** Forget one. Unknown ids are a no-op, not an error. */
export const removePlayedGame = (id: string): PlayedGameProblem | undefined =>
  write(playedGamesSnapshot().filter((row) => row.id !== id));

/** Forget all of them. */
export const clearPlayedGames = (): PlayedGameProblem | undefined => write([]);

/* Memoised on the snapshot's identity, as `savedAnalysesCatalog()` is. */
let live: { games: readonly PlayedGame[]; catalog: GameCatalog } | undefined;

/**
 * **The played games as a game catalog**, so `?game=play/games/<id>`
 * resolves through the ordinary hand-off (`lib/gameReference.ts`).
 */
export const playedGamesCatalog = (): GameCatalog => {
  const snapshot = playedGamesSnapshot();
  if (live === undefined || live.games !== snapshot) {
    live = { games: snapshot, catalog: playedGameCatalogOf(snapshot) };
  }
  return live.catalog;
};
