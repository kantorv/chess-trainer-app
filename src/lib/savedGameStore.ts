import { sameEngineSettings } from "./engineSettings";
import type { LibraryCatalog } from "./libraryCatalog";
import { recordStore } from "./recordStore";
import {
  savedGameCatalogOf,
  savedGameFrom,
  type SavedGame,
} from "./savedGames";

/**
 * Where the reader's engine games are kept: one `localStorage` key, holding a
 * JSON array of {@link SavedGame}, newest first.
 *
 * The store half of [`savedGames.ts`](./savedGames.ts), built over the shared
 * [`recordStore.ts`](./recordStore.ts) scaffolding — no React, so the pure
 * code can use it and `views/engine/saved/useSavedGames.ts` can wrap it in a
 * `useSyncExternalStore` without either knowing about the other. That module
 * owns the non-throwing read, the revision-stamped snapshot and the
 * `storage`-event subscription, and carries the reasoning for all of it. What
 * is this store's own:
 *
 * ### Writing is idempotent, because the writer is an effect
 *
 * The screen saves from an effect that runs whenever the game or the settings
 * change, and several of those changes produce a record identical to the one
 * already stored — resuming a game re-saves it on mount, and the settings clamp
 * runs once the engine's option handshake lands. {@link saveGame} therefore
 * compares against what is there and does nothing when the PGN and the settings
 * both match, so an unchanged game is not bumped to the top of a list sorted by
 * when it was last played.
 */

/** The `localStorage` key. Versioned, so a future shape change is a new key. */
export const SAVED_GAMES_STORAGE_KEY = "chessapp.savedGames.v1";

/**
 * How many games are kept.
 *
 * `localStorage` is a few megabytes for the whole origin, shared with the
 * reader's uploaded PGNs, and a game against the engine is written on every
 * move — so an unbounded list would fill it silently over a few evenings.
 * Fifty games of a couple of kilobytes is a small fraction of the budget, and
 * the oldest falls off the end rather than the newest being refused.
 */
export const MAX_SAVED_GAMES = 50;

/** What went wrong with a write. One case, but named rather than boolean. */
export type SavedGameProblem = "storage";

const games = recordStore<SavedGame>(SAVED_GAMES_STORAGE_KEY, savedGameFrom);

/** The saved games, newest first. Stable between changes — see `recordStore.ts`. */
export const savedGamesSnapshot = games.snapshot;

/** Subscribe to changes — this tab's writes, and other tabs' through `storage`. */
export const subscribeSavedGames = games.subscribe;

/** The store's write — every operation below funnels through it. */
const write = games.write;

/**
 * Keep one game, newest first.
 *
 * A game already there is **replaced in place and moved to the top**, which is
 * what makes "save on every move" one growing record rather than forty of them:
 * the id is stable for the life of a game, including across a resume, so the
 * same game written twice is the same row.
 *
 * A record identical to the one stored is a **no-op**, which is what keeps the
 * effect that calls this from re-ordering the list every time the screen
 * mounts — see the note on idempotence above.
 *
 * **The stored folder is carried forward** (CTA-46), as `savedAt` is: the
 * record the autosave effect builds carries no folder knowledge — it cannot,
 * the effect runs on Play with Engine and filing happens on /engine/saved — so
 * the idempotent compare does not read `folderId` (comparing it would make
 * every resume of a filed game a change and re-order the list) and the write
 * keeps the stored one. {@link fileSavedGame} is the only write that changes a
 * folder, so the store is the one place the rule lives.
 */
export const saveGame = (
  game: SavedGame,
): SavedGameProblem | undefined => {
  const current = savedGamesSnapshot();
  const existing = current.find((row) => row.id === game.id);

  if (
    existing !== undefined &&
    existing.pgn === game.pgn &&
    sameEngineSettings(existing.settings, game.settings)
  ) {
    return undefined;
  }

  return write(
    [
      // The date the game started and the folder it was filed under are the
      // stored ones, not this write's: a game begun yesterday and continued
      // today is still yesterday's game, in the folder the reader put it in.
      {
        ...game,
        savedAt: existing?.savedAt ?? game.savedAt,
        folderId: existing?.folderId ?? game.folderId,
      },
      ...current.filter((row) => row.id !== game.id),
    ].slice(0, MAX_SAVED_GAMES),
  );
};

/** One saved game by id, or `undefined` — what resuming one starts from. */
export const findSavedGame = (
  id: string | null | undefined,
): SavedGame | undefined =>
  id === null || id === undefined
    ? undefined
    : savedGamesSnapshot().find((row) => row.id === id);

/** Forget one game. Unknown ids are a no-op, not an error. */
export const removeSavedGame = (id: string): SavedGameProblem | undefined =>
  write(savedGamesSnapshot().filter((row) => row.id !== id));

/**
 * File one game under a folder — or to **Unfiled** with `null` — **in place**:
 * the record keeps its position in the list rather than jumping to the top,
 * because filing is organisation, not playing. A folder that has not actually
 * changed is a no-op, and an unknown id is one too.
 *
 * The parent is not checked against the folders store: the one caller is the
 * screen's move dialog, whose picker only offers folders that exist, and a
 * stale id a hand edit did produce reads as Unfiled on every
 * [`savedGameFolders.ts`](./savedGameFolders.ts) read anyway.
 */
export const fileSavedGame = (
  id: string,
  folderId: string | null,
): SavedGameProblem | undefined => {
  const current = savedGamesSnapshot();
  const existing = current.find((row) => row.id === id);
  if (existing === undefined || existing.folderId === folderId) return undefined;

  return write(
    current.map((row) =>
      row.id === id ? { ...row, folderId } : row,
    ),
  );
};

/**
 * File every game under a folder back to **Unfiled** — the games half of what
 * deleting a folder does to its contents
 * (`removeGameFolder` in [`savedGameFolderStore.ts`](./savedGameFolderStore.ts)).
 *
 * This is the one folder operation that changes *games*, which is why it lives
 * in the games store rather than beside the folder CRUD: a folder's own moves
 * (re-parenting sub-folders) are the folder store's to make, but the records
 * whose `folderId` is being set are these. Only the games *directly* in the
 * folder are unfiled — a sub-folder's games stay filed, because the sub-folder
 * itself is re-parented, not deleted. An unknown id changes nothing.
 */
export const unfileGamesIn = (
  folderId: string,
): SavedGameProblem | undefined => {
  const current = savedGamesSnapshot();
  if (!current.some((row) => row.folderId === folderId)) return undefined;

  return write(
    current.map((row) =>
      row.folderId === folderId ? { ...row, folderId: null } : row,
    ),
  );
};

/** Forget all of them. */
export const clearSavedGames = (): SavedGameProblem | undefined => write([]);

/*
  The saved games as a catalog, memoised on the identity of the snapshot.

  `savedGamesCatalog()` is called from `resolveGameReference` — on every
  `?game=` arrival — and parsing fifty PGNs is not something to do twice for the
  same data. The store returns the same array until its stored text changes, so
  this rebuilds when a game is saved or removed and never in between. The same
  arrangement `userPgnsLibrary()` uses over the uploads store.
*/
let live: { games: readonly SavedGame[]; catalog: LibraryCatalog } | undefined;

/**
 * **The saved games as a library catalog**, so `?game=engine/saved/<id>`
 * resolves through the ordinary hand-off (`lib/gameReference.ts`) rather than
 * through a transport of its own.
 */
export const savedGamesCatalog = (): LibraryCatalog => {
  const games = savedGamesSnapshot();
  if (live === undefined || live.games !== games) {
    live = { games, catalog: savedGameCatalogOf(games) };
  }
  return live.catalog;
};
