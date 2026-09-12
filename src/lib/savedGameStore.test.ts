import { afterEach, describe, expect, it, vi } from "vitest";
import { Chess } from "chess.js";

import { DEFAULT_ENGINE_SETTINGS } from "./engineSettings";
import { gameFromChess, type Game } from "./gameModel";
import { resolveGameReference } from "./gameReference";
import { savedGameOf, type SavedGame } from "./savedGames";
import {
  clearSavedGames,
  fileSavedGame,
  findSavedGame,
  MAX_SAVED_GAMES,
  removeSavedGame,
  SAVED_GAMES_STORAGE_KEY,
  saveGame,
  savedGamesCatalog,
  savedGamesSnapshot,
  subscribeSavedGames,
} from "./savedGameStore";

/*
  `src/test/setup.ts` clears `localStorage` between tests, and the store's cache
  is checked against a revision that lives *in* storage — so a clear takes the
  cache with it and each test below starts from an empty list without this file
  reaching into the module's internals.
*/

const playedGame = (moves: readonly string[]): Game => {
  const chess = new Chess();
  for (const san of moves) chess.move(san);
  return gameFromChess(chess);
};

const save = (
  id: string,
  moves: readonly string[],
  settings = DEFAULT_ENGINE_SETTINGS,
  now = new Date("2026-09-07T10:00:00.000Z"),
): SavedGame => savedGameOf(id, playedGame(moves), settings, now);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the saved-games store", () => {
  it("starts empty, and keeps a game that is written to it", () => {
    expect(savedGamesSnapshot()).toEqual([]);

    expect(saveGame(save("g1", ["e4", "e5"]))).toBe(undefined);

    expect(savedGamesSnapshot().map((row) => row.id)).toEqual(["g1"]);
    expect(findSavedGame("g1")?.settings).toEqual(DEFAULT_ENGINE_SETTINGS);
  });

  it("survives a reload — the games are read back out of storage", () => {
    saveGame(save("g1", ["e4"]));

    // What a reload sees: the raw text, read by a store with no cache warmed.
    const stored: unknown = JSON.parse(
      localStorage.getItem(SAVED_GAMES_STORAGE_KEY)!,
    );

    expect(Array.isArray(stored)).toBe(true);
    expect(savedGamesSnapshot()[0].pgn).toContain("1. e4");
  });

  it("replaces a game in place, so saving on every move is one row", () => {
    saveGame(save("g1", ["e4"]));
    saveGame(save("g1", ["e4", "e5"]));
    saveGame(save("g1", ["e4", "e5", "Nf3"]));

    expect(savedGamesSnapshot()).toHaveLength(1);
    expect(savedGamesSnapshot()[0].pgn).toContain("Nf3");
  });

  it("lists the games newest first", () => {
    saveGame(save("g1", ["e4"]));
    saveGame(save("g2", ["d4"]));
    saveGame(save("g3", ["c4"]));

    expect(savedGamesSnapshot().map((row) => row.id)).toEqual(["g3", "g2", "g1"]);
  });

  it("moves a game that was played on back to the top", () => {
    saveGame(save("g1", ["e4"]));
    saveGame(save("g2", ["d4"]));

    saveGame(save("g1", ["e4", "e5"]));

    expect(savedGamesSnapshot().map((row) => row.id)).toEqual(["g1", "g2"]);
  });

  it("keeps the date a game was started when it is played on", () => {
    saveGame(
      savedGameOf(
        "g1",
        playedGame(["e4"]),
        DEFAULT_ENGINE_SETTINGS,
        new Date("2026-09-01T08:00:00.000Z"),
      ),
    );

    saveGame(
      savedGameOf(
        "g1",
        playedGame(["e4", "e5"]),
        DEFAULT_ENGINE_SETTINGS,
        new Date("2026-09-07T10:00:00.000Z"),
      ),
    );

    expect(savedGamesSnapshot()[0].savedAt).toBe("2026-09-01T08:00:00.000Z");
    expect(savedGamesSnapshot()[0].updatedAt).toBe("2026-09-07T10:00:00.000Z");
  });

  it("does nothing at all when the record would be identical", () => {
    saveGame(save("g1", ["e4"]));
    saveGame(save("g2", ["d4"]));
    const before = savedGamesSnapshot();

    // What the screen's save effect does on mount: the same game, again.
    saveGame(save("g1", ["e4"]));

    // Not merely equal — the *same array*, so nothing downstream re-renders and
    // the list is not re-ordered by a game nobody played on.
    expect(savedGamesSnapshot()).toBe(before);
    expect(savedGamesSnapshot().map((row) => row.id)).toEqual(["g2", "g1"]);
  });

  it("does write when only the settings changed", () => {
    saveGame(save("g1", ["e4"]));

    saveGame(save("g1", ["e4"], { ...DEFAULT_ENGINE_SETTINGS, skillLevel: 20 }));

    expect(savedGamesSnapshot()[0].settings.skillLevel).toBe(20);
  });

  it("carries the stored folder forward when the effect writes over a filed game", () => {
    /*
      The autosave trap (CTA-46): the record `usePlayWithEngine` builds carries
      no folder knowledge — `savedGameOf` defaults `folderId` to null — so the
      first move after filing a game must not strip its folder. The store keeps
      the stored one, exactly as it keeps the stored `savedAt`.
    */
    saveGame(
      savedGameOf(
        "g1",
        playedGame(["e4"]),
        DEFAULT_ENGINE_SETTINGS,
        new Date("2026-09-07T10:00:00.000Z"),
        undefined,
        "folder-a",
      ),
    );
    expect(savedGamesSnapshot()[0].folderId).toBe("folder-a");

    // What the effect writes on the next move: same id, one move more, no
    // folder of its own.
    saveGame(save("g1", ["e4", "e5"]));

    expect(savedGamesSnapshot()).toHaveLength(1);
    expect(
      savedGamesSnapshot().find((row) => row.id === "g1")?.folderId,
    ).toBe("folder-a");
  });

  it("still treats a filed game as identical on resume, so mounting it re-orders nothing", () => {
    /*
      `folderId` is not in the idempotent compare — the effect cannot know it —
      so a filed game resumed and re-saved unchanged stays a no-op, and the
      list is not re-ordered by a game nobody played on.
    */
    saveGame(save("g1", ["e4"]));
    saveGame(save("g2", ["d4"]));
    fileSavedGame("g2", "folder-a");
    const before = savedGamesSnapshot();

    // What the screen's save effect does on mount of a resumed filed game:
    // the same game and settings, folderId defaulted to null.
    saveGame(
      savedGameOf(
        "g2",
        playedGame(["d4"]),
        DEFAULT_ENGINE_SETTINGS,
        new Date("2026-09-07T10:00:00.000Z"),
      ),
    );

    expect(savedGamesSnapshot()).toBe(before);
    expect(savedGamesSnapshot().map((row) => row.id)).toEqual(["g2", "g1"]);
  });

  it("gives a brand-new game the folder its record carries, and Unfiled to one that carries none", () => {
    saveGame(save("g1", ["e4"]));
    expect(savedGamesSnapshot()[0].folderId).toBeNull();

    saveGame(
      savedGameOf(
        "g2",
        playedGame(["d4"]),
        DEFAULT_ENGINE_SETTINGS,
        new Date("2026-09-07T10:00:00.000Z"),
        undefined,
        "folder-a",
      ),
    );
    expect(
      savedGamesSnapshot().find((row) => row.id === "g2")?.folderId,
    ).toBe("folder-a");
  });

  it("keeps at most MAX_SAVED_GAMES, dropping the oldest", () => {
    for (let index = 0; index <= MAX_SAVED_GAMES; index += 1) {
      saveGame(save(`g${index}`, ["e4"]));
    }

    const ids = savedGamesSnapshot().map((row) => row.id);
    expect(ids).toHaveLength(MAX_SAVED_GAMES);
    expect(ids[0]).toBe(`g${MAX_SAVED_GAMES}`);
    // The very first game is the one that fell off the end.
    expect(ids).not.toContain("g0");
  });

  it("forgets one game, and all of them", () => {
    saveGame(save("g1", ["e4"]));
    saveGame(save("g2", ["d4"]));

    removeSavedGame("g1");
    expect(savedGamesSnapshot().map((row) => row.id)).toEqual(["g2"]);

    // An id that is not there is a no-op rather than an error.
    expect(removeSavedGame("nope")).toBe(undefined);

    clearSavedGames();
    expect(savedGamesSnapshot()).toEqual([]);
  });

  it("returns the same array until something changes", () => {
    saveGame(save("g1", ["e4"]));

    expect(savedGamesSnapshot()).toBe(savedGamesSnapshot());

    const before = savedGamesSnapshot();
    saveGame(save("g2", ["d4"]));
    expect(savedGamesSnapshot()).not.toBe(before);
  });

  it("tells its subscribers when a game is saved, and stops when they leave", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSavedGames(listener);

    saveGame(save("g1", ["e4"]));
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    saveGame(save("g2", ["d4"]));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("the saved-games store — when storage will not co-operate", () => {
  it("reads an empty list rather than throwing on a corrupt entry", () => {
    localStorage.setItem(SAVED_GAMES_STORAGE_KEY, "{ not json");
    localStorage.setItem(`${SAVED_GAMES_STORAGE_KEY}.rev`, "1");

    expect(savedGamesSnapshot()).toEqual([]);
  });

  it("drops a row that is not a saved game and keeps the rest", () => {
    localStorage.setItem(
      SAVED_GAMES_STORAGE_KEY,
      JSON.stringify([{ nonsense: true }, save("g1", ["e4"])]),
    );
    localStorage.setItem(`${SAVED_GAMES_STORAGE_KEY}.rev`, "2");

    expect(savedGamesSnapshot().map((row) => row.id)).toEqual(["g1"]);
  });

  it("reports a full quota instead of throwing out of the save", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    expect(saveGame(save("g1", ["e4"]))).toBe("storage");
  });

  it("reads nothing rather than throwing when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });

    expect(savedGamesSnapshot()).toEqual([]);
  });
});

describe("the saved games as a `?game=` destination", () => {
  it("resolves a reference into the Analysis Board and Load PGN's hand-off", () => {
    saveGame(save("g1", ["e4", "e5", "Nf3"]));

    const resolved = resolveGameReference("engine/saved/g1");

    expect(resolved?.id).toBe("g1");
    expect(resolved?.game.moves.map((move) => move.san)).toEqual([
      "e4",
      "e5",
      "Nf3",
    ]);
  });

  it("ignores a reference to a game that has been deleted", () => {
    saveGame(save("g1", ["e4"]));
    removeSavedGame("g1");

    expect(resolveGameReference("engine/saved/g1")).toBe(undefined);
  });

  it("rebuilds the catalog only when the games change", () => {
    saveGame(save("g1", ["e4"]));

    expect(savedGamesCatalog()).toBe(savedGamesCatalog());

    const before = savedGamesCatalog();
    saveGame(save("g2", ["d4"]));
    expect(savedGamesCatalog()).not.toBe(before);
  });
});
