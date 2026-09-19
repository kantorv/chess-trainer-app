import { afterEach, describe, expect, it, vi } from "vitest";
import { Chess } from "chess.js";

import { DEFAULT_ENGINE_SETTINGS } from "./engineSettings";
import { gameFromChess } from "./gameModel";
import { savedGameOf } from "./savedGames";
import {
  MAX_GAME_FOLDERS,
  createGameFolder,
  findGameFolder,
  GAME_FOLDERS_STORAGE_KEY,
  gameFoldersSnapshot,
  moveGameFolder,
  removeGameFolder,
  renameGameFolder,
  subscribeGameFolders,
} from "./savedGameFolderStore";
import {
  MAX_SAVED_GAMES,
  fileSavedGame,
  saveGame,
  savedGamesSnapshot,
} from "./savedGameStore";

/*
  `src/test/setup.ts` clears `localStorage` between tests, and both stores'
  caches are checked against revisions that live *in* storage — so a clear takes
  the caches with it and each test below starts from an empty tree without this
  file reaching into either module's internals.

  The games store is *not* stubbed: the delete test writes real games and
  asserts they are re-filed, because that rule spans both stores and is the
  whole of what deleting a folder means.
*/

const AT = new Date("2026-09-07T10:00:00.000Z");
const LATER = new Date("2026-09-08T11:00:00.000Z");

/** One game filed into `folderId`. The moves are irrelevant to the writes. */
const saveGameIn = (id: string, folderId: string | null) => {
  saveGame(
    savedGameOf(
      id,
      gameFromChess(new Chess()),
      DEFAULT_ENGINE_SETTINGS,
      AT,
      AT.toISOString(),
      folderId,
    ),
  );
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the saved-game-folders store — creating", () => {
  it("starts empty, and hands back the folder it creates", () => {
    expect(gameFoldersSnapshot()).toEqual([]);

    const created = createGameFolder("Endgames", null, AT);

    expect(created).toEqual({
      id: expect.any(String),
      name: "Endgames",
      parentId: null,
      savedAt: AT.toISOString(),
      updatedAt: AT.toISOString(),
    });
    expect(gameFoldersSnapshot().map((folder) => folder.name)).toEqual([
      "Endgames",
    ]);
  });

  it("finds one by id", () => {
    const created = createGameFolder("Endgames", null, AT);

    expect(findGameFolder(created?.id)?.name).toBe("Endgames");
    expect(findGameFolder("nope")).toBeUndefined();
    expect(findGameFolder(null)).toBeUndefined();
  });

  it("refuses a name that trims to nothing", () => {
    expect(createGameFolder("   ", null, AT)).toBeUndefined();
    expect(gameFoldersSnapshot()).toEqual([]);
  });

  it("refuses a parent that is not there — a subtree no reader can reach", () => {
    expect(createGameFolder("Orphan", "gone", AT)).toBeUndefined();
    expect(gameFoldersSnapshot()).toEqual([]);
  });

  it("trims a name to MAX_GAME_FOLDER_NAME", () => {
    const created = createGameFolder("a".repeat(150), null, AT);

    expect(created?.name).toHaveLength(100);
  });

  it("keeps at most MAX_GAME_FOLDERS", () => {
    for (let index = 0; index < MAX_GAME_FOLDERS; index += 1) {
      createGameFolder(`folder-${index}`, null, AT);
    }

    expect(createGameFolder("one too many", null, AT)).toBeUndefined();
    expect(gameFoldersSnapshot()).toHaveLength(MAX_GAME_FOLDERS);
  });

  it("reports a full quota instead of throwing out of the create", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    expect(createGameFolder("Endgames", null, AT)).toBeUndefined();
  });
});

describe("the saved-game-folders store — renaming", () => {
  it("renames in place, stamping updatedAt and keeping the record's place", () => {
    const first = createGameFolder("Before", null, AT);
    createGameFolder("Second", null, AT);

    renameGameFolder(first?.id ?? "", "After", LATER);

    const [top, second] = gameFoldersSnapshot();
    expect(top?.name).toBe("After");
    expect(top?.updatedAt).toBe(LATER.toISOString());
    expect(second?.name).toBe("Second");
  });

  it("is a no-op for a name that trims to nothing — not a wipe", () => {
    const created = createGameFolder("Kept", null, AT);

    expect(renameGameFolder(created?.id ?? "", "   ", LATER)).toBe(undefined);
    expect(findGameFolder(created?.id)?.name).toBe("Kept");
  });

  it("is a no-op for a name that has not changed, and an id that is not there", () => {
    const created = createGameFolder("Same", null, AT);
    const before = gameFoldersSnapshot();

    expect(renameGameFolder(created?.id ?? "", "Same", LATER)).toBe(undefined);
    expect(renameGameFolder("nope", "x", LATER)).toBe(undefined);
    expect(gameFoldersSnapshot()).toBe(before);
  });
});

describe("the saved-game-folders store — moving", () => {
  const tree = () => {
    const root = createGameFolder("Games", null, AT);
    const child = createGameFolder("e4 games", root?.id ?? null, AT);
    const deep = createGameFolder("Deep inside", child?.id ?? null, AT);
    const sibling = createGameFolder("Endgames", null, AT);
    return { root, child, deep, sibling };
  };

  it("moves a folder under another, and to the top level", () => {
    const { root, deep, sibling } = tree();

    moveGameFolder(deep?.id ?? "", sibling?.id ?? null, LATER);
    expect(findGameFolder(deep?.id)?.parentId).toBe(sibling?.id);

    moveGameFolder(sibling?.id ?? "", null, LATER);
    expect(findGameFolder(sibling?.id)?.parentId).toBeNull();

    // A move that happened is stamped; nothing else is.
    expect(findGameFolder(deep?.id)?.updatedAt).toBe(LATER.toISOString());
    expect(findGameFolder(root?.id)?.updatedAt).toBe(AT.toISOString());
  });

  it("refuses a folder moved into its own subtree — the one move that loops", () => {
    const { root, deep } = tree();

    expect(
      moveGameFolder(root?.id ?? "", deep?.id ?? null, LATER),
    ).toBe(undefined);
    expect(findGameFolder(root?.id)?.parentId).toBeNull();
    expect(
      moveGameFolder(root?.id ?? "", root?.id ?? null, LATER),
    ).toBe(undefined);
  });

  it("is a no-op for an id that is not there, a missing parent, and a move that changes nothing", () => {
    const { root, child } = tree();
    const before = gameFoldersSnapshot();

    expect(moveGameFolder("nope", null, LATER)).toBe(undefined);
    expect(moveGameFolder(root?.id ?? "", "gone", LATER)).toBe(undefined);
    expect(moveGameFolder(child?.id ?? "", root?.id ?? null, LATER)).toBe(
      undefined,
    );
    expect(gameFoldersSnapshot()).toBe(before);
  });
});

describe("the saved-game-folders store — deleting", () => {
  it("removes an empty folder outright", () => {
    const created = createGameFolder("Empty", null, AT);

    removeGameFolder(created?.id ?? "", LATER);

    expect(gameFoldersSnapshot()).toEqual([]);
  });

  it("is a no-op for an id that is not there", () => {
    expect(removeGameFolder("nope", LATER)).toBe(undefined);
  });

  it("re-parents sub-folders to the deleted folder's own parent, so the tree closes up", () => {
    const root = createGameFolder("Games", null, AT);
    const child = createGameFolder("e4 games", root?.id ?? null, AT);
    const deep = createGameFolder("Deep inside", child?.id ?? null, AT);

    removeGameFolder(child?.id ?? "", LATER);

    expect(
      gameFoldersSnapshot().map((folder) => folder.id).sort(),
    ).toEqual([root?.id, deep?.id].sort());
    // The orphaned sub-folder lands on the deleted folder's parent, not on
    // nothing.
    expect(findGameFolder(deep?.id)?.parentId).toBe(root?.id);
  });

  it("files games filed in it back to Unfiled — and leaves deeper ones alone", () => {
    const root = createGameFolder("Games", null, AT);
    const child = createGameFolder("e4 games", root?.id ?? null, AT);
    saveGameIn("direct", root?.id ?? null);
    saveGameIn("nested", child?.id ?? null);
    saveGameIn("elsewhere", null);

    removeGameFolder(root?.id ?? "", LATER);

    // Directly-filed games become Unfiled...
    expect(
      savedGamesSnapshot().find((row) => row.id === "direct")?.folderId,
    ).toBeNull();
    // ...games deeper down keep their folder, which re-parented up...
    expect(
      savedGamesSnapshot().find((row) => row.id === "nested")?.folderId,
    ).toBe(child?.id);
    // ...and a game that was never in the subtree is untouched.
    expect(
      savedGamesSnapshot().find((row) => row.id === "elsewhere")?.folderId,
    ).toBeNull();
  });

  it("unfiles the games even when the folder write fails", () => {
    const created = createGameFolder("Games", null, AT);
    saveGameIn("direct", created?.id ?? null);

    // Only the folders' own writes fail — the half-done delete the rule is
    // about. Other keys write through, so the games' re-filing lands.
    const realSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (String(key).startsWith("chessapp.savedGameFolders")) {
        throw new Error("QuotaExceededError");
      }
      realSetItem.call(this, key, value);
    });

    expect(removeGameFolder(created?.id ?? "", LATER)).toBe("storage");
    // The folder write failed — the folder itself is still there...
    expect(findGameFolder(created?.id)?.name).toBe("Games");
    // ...but the games are re-filed to Unfiled regardless.
    expect(
      savedGamesSnapshot().find((row) => row.id === "direct")?.folderId,
    ).toBeNull();
  });
});

describe("the saved-game-folders store — surviving and sharing", () => {
  it("survives a reload — the folders are read back out of storage", () => {
    const created = createGameFolder("Endgames", null, AT);
    const stored: unknown = JSON.parse(
      localStorage.getItem(GAME_FOLDERS_STORAGE_KEY)!,
    );

    expect(Array.isArray(stored)).toBe(true);
    expect(
      (stored as { id: string }[]).some((row) => row.id === created?.id),
    ).toBe(true);
  });

  it("reads an empty list rather than throwing on a corrupt entry", () => {
    localStorage.setItem(GAME_FOLDERS_STORAGE_KEY, "{ not json");
    localStorage.setItem(`${GAME_FOLDERS_STORAGE_KEY}.rev`, "1");

    expect(gameFoldersSnapshot()).toEqual([]);
  });

  it("normalises a broken row on read and keeps the rest", () => {
    localStorage.setItem(
      GAME_FOLDERS_STORAGE_KEY,
      JSON.stringify([
        { id: "broken", name: null, parentId: "", savedAt: "x", updatedAt: "x" },
        { nonsense: true },
        { id: "kept", name: "Kept", parentId: null, savedAt: "x", updatedAt: "x" },
      ]),
    );
    localStorage.setItem(`${GAME_FOLDERS_STORAGE_KEY}.rev`, "2");

    const rows = gameFoldersSnapshot();
    expect(rows.map((row) => row.id)).toEqual(["broken", "kept"]);
    // The broken row still renders one folder — a half-broken record beats a
    // tree with a hole in it.
    expect(findGameFolder("broken")).toEqual({
      id: "broken",
      name: "",
      parentId: null,
      savedAt: "x",
      updatedAt: "x",
    });
  });

  it("reads nothing rather than throwing when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });

    expect(gameFoldersSnapshot()).toEqual([]);
  });

  it("tells its subscribers when one is created, and stops when they leave", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeGameFolders(listener);

    createGameFolder("Endgames", null, AT);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    createGameFolder("Openings", null, AT);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("lives beside the games' own store, in its own key — so a folder is not a game", () => {
    createGameFolder("Endgames", null, AT);
    saveGameIn("g1", null);

    // Two stores, two keys, two snapshots; a folder is not a game and a game
    // is not a folder.
    expect(gameFoldersSnapshot()).toHaveLength(1);
    expect(savedGamesSnapshot()).toHaveLength(1);
    expect(gameFoldersSnapshot()[0].id).not.toBe(savedGamesSnapshot()[0].id);
  });

  it("caps the folders with their own bound, separate from the games' cap", () => {
    expect(MAX_GAME_FOLDERS).toBeGreaterThan(0);
    expect(MAX_SAVED_GAMES).toBeGreaterThan(0);
    expect(MAX_GAME_FOLDERS).not.toBe(MAX_SAVED_GAMES);
  });
});

describe("fileSavedGame — the one write that changes a folder", () => {
  it("files a game in place, keeping its position in the list", () => {
    saveGameIn("g1", null);
    saveGameIn("g2", null);

    fileSavedGame("g1", "folder-a");

    // Still at the top of the list, where it was — filing is not playing.
    expect(savedGamesSnapshot().map((row) => row.id)).toEqual(["g2", "g1"]);
    expect(
      savedGamesSnapshot().find((row) => row.id === "g1")?.folderId,
    ).toBe("folder-a");
  });

  it("unfiles with null, and is a no-op for an unchanged folder and an unknown id", () => {
    saveGameIn("g1", "folder-a");
    const before = savedGamesSnapshot();

    expect(fileSavedGame("g1", "folder-a")).toBe(undefined);
    expect(savedGamesSnapshot()).toBe(before);

    expect(fileSavedGame("nope", "folder-a")).toBe(undefined);

    fileSavedGame("g1", null);
    expect(
      savedGamesSnapshot().find((row) => row.id === "g1")?.folderId,
    ).toBeNull();
  });
});
