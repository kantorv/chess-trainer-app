import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { Chess } from "chess.js";

import i18n from "../../../i18n";
import { DEFAULT_ENGINE_SETTINGS } from "../../../lib/engineSettings";
import { gameFromChess } from "../../../lib/gameModel";
import { savedGameOf, type SavedGame } from "../../../lib/savedGames";
import type { GameFolder } from "../../../lib/savedGameFolders";
import { useFolderBrowser } from "./useFolderBrowser";

/*
  The unit test the split screen was made for: the folder browsing is a hook
  over plain parameters — `games` and `folders` are arrays, not a store — so
  this drives it without the screen, and the screen's own suite covers the same
  behavior end to end through the pixels. The openings' hook test again, over
  the games' own types.
*/

/** One game filed nowhere, or under the folder id given. The moves are noise. */
const game = (id: string, folderId: string | null): SavedGame =>
  savedGameOf(
    id,
    gameFromChess(new Chess()),
    DEFAULT_ENGINE_SETTINGS,
    new Date("2026-09-07T10:00:00.000Z"),
    new Date("2026-09-07T10:00:00.000Z").toISOString(),
    folderId,
  );

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

describe("useFolderBrowser", () => {
  it("starts at the top level: root folders and the Unfiled games", () => {
    const root: GameFolder = {
      id: "root",
      name: "Root",
      parentId: null,
      savedAt: "x",
      updatedAt: "x",
    };
    const nested: GameFolder = { ...root, id: "nested", name: "Nested", parentId: "root" };

    const { result } = renderHook(() =>
      useFolderBrowser(
        [game("loose", null), game("filed", "root")],
        [root, nested],
      ),
    );

    expect(result.current.currentFolder).toBeUndefined();
    expect(result.current.browseId).toBeNull();
    // Only the roots drill from here; the nested one is a level down.
    expect(result.current.foldersHere.map((f) => f.name)).toEqual(["Root"]);
    // The Unfiled game is a top-level item; the filed one is not.
    expect(result.current.gamesHere.map((g) => g.id)).toEqual(["loose"]);
    // No chain to show at the top.
    expect(result.current.crumbs).toEqual([]);
  });

  it("drills in and shows that folder's sub-folders and games", () => {
    const root: GameFolder = {
      id: "root",
      name: "Root",
      parentId: null,
      savedAt: "x",
      updatedAt: "x",
    };
    const nested: GameFolder = { ...root, id: "nested", name: "Nested", parentId: "root" };

    const { result } = renderHook(() =>
      useFolderBrowser(
        [game("loose", null), game("filed", "root")],
        [root, nested],
      ),
    );

    act(() => result.current.open("root"));

    expect(result.current.currentFolder?.id).toBe("root");
    expect(result.current.browseId).toBe("root");
    expect(result.current.foldersHere.map((f) => f.id)).toEqual(["nested"]);
    expect(result.current.gamesHere.map((g) => g.id)).toEqual(["filed"]);
    // The breadcrumb chain is top down, this folder included.
    expect(result.current.crumbs.map((c) => c.name)).toEqual(["Root"]);
  });

  it("reads a folder deleted out from under the browser as the top level", () => {
    const root: GameFolder = {
      id: "root",
      name: "Root",
      parentId: null,
      savedAt: "x",
      updatedAt: "x",
    };

    const { result, rerender } = renderHook(
      ({ folders }: { folders: readonly GameFolder[] }) =>
        useFolderBrowser([], folders),
      { initialProps: { folders: [root] as readonly GameFolder[] } },
    );

    act(() => result.current.open("root"));
    expect(result.current.browseId).toBe("root");

    // Another tab's delete: the id no longer resolves. The next render reads
    // as the top level rather than as a hole in the tree.
    rerender({ folders: [] });
    expect(result.current.browseId).toBeNull();
    expect(result.current.currentFolder).toBeUndefined();
    expect(result.current.foldersHere).toEqual([]);
  });

  it("returns to the top level when told to, and by way of a parent id", () => {
    const root: GameFolder = {
      id: "root",
      name: "Root",
      parentId: null,
      savedAt: "x",
      updatedAt: "x",
    };
    const sub: GameFolder = { ...root, id: "sub", name: "Sub", parentId: "root" };

    const { result } = renderHook(() => useFolderBrowser([], [root, sub]));

    act(() => result.current.open("sub"));
    expect(result.current.browseId).toBe("sub");

    // A delete standing down here goes to the deleted folder's own parent.
    act(() => result.current.open("root"));
    expect(result.current.browseId).toBe("root");

    act(() => result.current.open(null));
    expect(result.current.browseId).toBeNull();
  });
});
