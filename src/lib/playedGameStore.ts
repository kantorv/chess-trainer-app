import { sameEngineSettings } from "./engineSettings";
import type { GameCatalog } from "./gameCatalog";
import {
  playedGameCatalogOf,
  playedGameFrom,
  samePlayedGameEvals,
  samePlayedGameMask,
  type PlayedGame,
} from "./playedGames";
import { idbDatabase } from "./idb";
import { idbRecordStore, mergedNewestFirst } from "./idbRecordStore";

/**
 * Where the games against the engine are kept (CTA-74; Masked Pieces' too
 * since CTA-79): **IndexedDB** — `chessapp.engine`, its `games` object store,
 * one record per {@link PlayedGame}, listed newest first — over the shared
 * [`idbRecordStore.ts`](./idbRecordStore.ts), which owns the kept snapshot,
 * the queued writes answered once committed, the other tabs'
 * `BroadcastChannel`. Flat:
 * no folders. The app's storage as a whole is `.claude/rules/database.md`.
 *
 * Every read of the list is the kept snapshot — `undefined` until the first
 * read lands ({@link loadPlayedGames}, or the first subscriber) — and every
 * write a promise of `undefined` or a {@link PlayedGameProblem}. Nothing here
 * throws.
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
 * The comparison runs inside the queued write, against the rows as they are
 * once every earlier write has landed — so a burst of autosaves stays one
 * record.
 */

/** The database Play with Engine's (and Masked Pieces') games live in. */
const ENGINE_DB_NAME = "chessapp.engine";
const DB_VERSION = 1;
const GAMES_STORE = "games";

const engineDb = idbDatabase(ENGINE_DB_NAME, DB_VERSION, [GAMES_STORE]);

/** **For tests**: close the connection and delete the database. */
export const deleteEngineDb = engineDb.remove;

/**
 * How many games are kept — a bound on a flat, unpaged list rather than on
 * the storage (it was the quota's while the games lived in `localStorage`).
 * The oldest falls off the end rather than the newest being refused.
 */
export const MAX_PLAYED_GAMES = 100;

/** What went wrong with a write. */
export type PlayedGameProblem = "storage";

const games = idbRecordStore<PlayedGame>({
  db: engineDb.open,
  store: GAMES_STORE,
  normalise: playedGameFrom,
  order: "newest-first",
  channel: ENGINE_DB_NAME,
});

/** The played games, newest first — `undefined` until the first read lands. Stable between changes. */
export const playedGamesSnapshot = games.snapshot;

/** Subscribe to changes — this tab's writes, and other tabs'. The first subscriber starts the read. */
export const subscribePlayedGames = games.subscribe;

/** The played games, read now if they have not been. */
export const loadPlayedGames = games.load;

/** Resolves once every write issued so far has landed — what a test waits on before it resets. */
export const settledPlayedGames = games.settled;

/** **For tests**: forget what was read (the database is {@link deleteEngineDb}'s). */
export const resetPlayedGameStore = games.reset;

const write = games.write;

const samePath = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((san, index) => san === b[index]);

/**
 * Keep one game. A new id goes to the top; a changed PGN is replaced and
 * moved to the top; anything else that changed is written in place, keeping
 * the stored `updatedAt`; an identical record is a no-op. `savedAt` is always
 * the stored one.
 */
export const savePlayedGame = (game: PlayedGame): Promise<PlayedGameProblem | undefined> =>
  write((current) => {
    const existing = current.find((row) => row.id === game.id);
    if (existing === undefined) return [game, ...current].slice(0, MAX_PLAYED_GAMES);

    const movesChanged = existing.pgn !== game.pgn;
    if (
      !movesChanged &&
      samePath(existing.path, game.path) &&
      sameEngineSettings(existing.settings, game.settings) &&
      existing.resigned === game.resigned &&
      samePlayedGameMask(existing.mask, game.mask) &&
      samePlayedGameEvals(existing.evals, game.evals)
    ) {
      return current;
    }

    const next: PlayedGame = {
      ...game,
      savedAt: existing.savedAt,
      updatedAt: movesChanged ? game.updatedAt : existing.updatedAt,
    };
    return movesChanged
      ? [next, ...current.filter((row) => row.id !== game.id)]
      : current.map((row) => (row.id === game.id ? next : row));
  });

/**
 * **An import's games** (CTA-89, Settings' Import): the `remove` ids go, then
 * `add` comes in — each replacing a stored game with its id — merged by date
 * (`mergedNewestFirst`), in one write. The cap is kept as {@link savePlayedGame}
 * keeps it, the oldest falling off; nothing to change is a no-op.
 */
export const importPlayedGames = (
  add: readonly PlayedGame[],
  remove: readonly string[] = [],
): Promise<PlayedGameProblem | undefined> =>
  write((current) => {
    const gone = new Set([...remove, ...add.map((game) => game.id)]);
    const kept = current.filter((row) => !gone.has(row.id));
    if (add.length === 0 && kept.length === current.length) return current;
    return mergedNewestFirst(kept, add).slice(0, MAX_PLAYED_GAMES);
  });

/**
 * One played game by id, out of what has been read — what resuming one starts
 * from. `undefined` for an unknown id, and also before the first read has
 * landed (a screen arriving by `?saved=` waits for {@link loadPlayedGames}).
 */
export const findPlayedGame = (id: string | null | undefined): PlayedGame | undefined =>
  id === null || id === undefined
    ? undefined
    : playedGamesSnapshot()?.find((row) => row.id === id);

/** Forget one. Unknown ids are a no-op, not an error. */
export const removePlayedGame = (id: string): Promise<PlayedGameProblem | undefined> =>
  write((current) =>
    current.some((row) => row.id === id) ? current.filter((row) => row.id !== id) : current,
  );

/* Memoised on the snapshot's identity. */
let live: { games: readonly PlayedGame[]; catalog: GameCatalog } | undefined;

const NO_GAMES: readonly PlayedGame[] = [];

/**
 * **The played games as a game catalog**, so `?game=play/games/<id>`
 * resolves through the ordinary hand-off (`lib/gameReference.ts`) — out of
 * what has been read, so the Analysis Board waits for that read first
 * (`isReferenceRead` / `loadReferencedGames`).
 */
export const playedGamesCatalog = (): GameCatalog => {
  const snapshot = playedGamesSnapshot() ?? NO_GAMES;
  if (live === undefined || live.games !== snapshot) {
    live = { games: snapshot, catalog: playedGameCatalogOf(snapshot) };
  }
  return live.catalog;
};
