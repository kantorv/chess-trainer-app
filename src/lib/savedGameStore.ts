import { sameEngineSettings } from "./engineSettings";
import type { LibraryCatalog } from "./libraryCatalog";
import {
  savedGameCatalogOf,
  savedGameFrom,
  type SavedGame,
} from "./savedGames";

/**
 * Where the reader's engine games are kept: one `localStorage` key, holding a
 * JSON array of {@link SavedGame}, newest first.
 *
 * The store half of [`savedGames.ts`](./savedGames.ts), written the way
 * [`pgnUploadStore.ts`](./pgnUploadStore.ts) is — no React, so the pure code can
 * use it and `views/engine/saved/useSavedGames.ts` can wrap it in a
 * `useSyncExternalStore` without either knowing about the other. Everything
 * about that module's shape applies here for the same reasons, so only what is
 * *different* is written out below.
 *
 * ### Nothing here throws
 *
 * `localStorage` is not a reliable dependency — private mode can throw on
 * access, another tab can leave something that is not JSON under the key, a
 * write can exceed the quota. Each is answered with an empty list on read and a
 * reported problem on write, because the alternative is a game screen that will
 * not render.
 *
 * ### The snapshot is checked against a revision, not against the data
 *
 * `useSyncExternalStore` calls `getSnapshot` on every render and must get the
 * same value back when nothing changed, so the parsed array is cached and the
 * cache is checked against a short **revision** stamped under a second key. A
 * game of forty moves is a couple of kilobytes and fifty of them are read from
 * a render, so the parse is not something to repeat per keystroke. Keeping the
 * revision in storage rather than in a variable is what makes the cache
 * self-correcting: another tab's write moves it, and a `localStorage.clear()` —
 * between two tests, or from the browser's own controls — removes it, so the
 * next snapshot goes back to the data and finds it gone.
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

/** Where the revision is stamped — a few bytes, read on every snapshot. */
export const SAVED_GAMES_REVISION_KEY = `${SAVED_GAMES_STORAGE_KEY}.rev`;

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

const EMPTY: readonly SavedGame[] = [];

const listeners = new Set<() => void>();

/** Cached parse, and the revision it was read at. `undefined` = never read. */
let lastRevision: string | null | undefined;
let cached: readonly SavedGame[] = EMPTY;

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    // Private mode, or storage disabled: the screen still works, with nothing
    // saved and every write reporting a problem.
    return null;
  }
};

const parse = (raw: string | null): readonly SavedGame[] => {
  if (raw === null || raw.trim() === "") return EMPTY;
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return EMPTY;
    // A row that is not a saved game is dropped rather than rendered as one.
    const rows = value
      .map(savedGameFrom)
      .filter((row): row is SavedGame => row !== undefined);
    return rows.length === 0 ? EMPTY : rows;
  } catch {
    return EMPTY;
  }
};

/** The saved games, newest first. Stable between changes — see the note above. */
export const savedGamesSnapshot = (): readonly SavedGame[] => {
  const revision = read(SAVED_GAMES_REVISION_KEY);
  if (revision !== lastRevision) {
    lastRevision = revision;
    cached = parse(read(SAVED_GAMES_STORAGE_KEY));
  }
  return cached;
};

const emit = () => {
  for (const listener of listeners) listener();
};

const onStorageEvent = (event: StorageEvent) => {
  // `key === null` is a `clear()` from another tab, which affects us too.
  if (
    event.key === null ||
    event.key === SAVED_GAMES_STORAGE_KEY ||
    event.key === SAVED_GAMES_REVISION_KEY
  ) {
    emit();
  }
};

/** Subscribe to changes — this tab's writes, and other tabs' through `storage`. */
export const subscribeSavedGames = (onChange: () => void): (() => void) => {
  listeners.add(onChange);

  if (listeners.size === 1 && typeof window !== "undefined") {
    window.addEventListener("storage", onStorageEvent);
  }

  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && typeof window !== "undefined") {
      window.removeEventListener("storage", onStorageEvent);
    }
  };
};

/** Bumped on every write, so a snapshot can tell "changed" from "unchanged". */
let writes = 0;

/** Write the list, or say why it could not be written. Never throws. */
const write = (games: readonly SavedGame[]): SavedGameProblem | undefined => {
  try {
    localStorage.setItem(SAVED_GAMES_STORAGE_KEY, JSON.stringify(games));
    // After the data, so a revision never claims a write that did not land.
    writes += 1;
    localStorage.setItem(SAVED_GAMES_REVISION_KEY, `${Date.now()}-${writes}`);
  } catch {
    // Quota exceeded, or storage unavailable. The list on screen is unchanged,
    // because nothing was mutated before this point.
    return "storage";
  }
  emit();
  return undefined;
};

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
      // The date the game started is the stored one, not this write's: a game
      // begun yesterday and continued today is still yesterday's game.
      { ...game, savedAt: existing?.savedAt ?? game.savedAt },
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
