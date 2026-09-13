import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";

import { DEFAULT_ENGINE_SETTINGS } from "./engineSettings";
import { gameFromChess } from "./gameModel";
import { savedGameOf, type SavedGame } from "./savedGames";
import {
  flattenGameFolders,
  gameFolderChildren,
  gameFolderFrom,
  gameFolderPath,
  gameFolderSubtree,
  gamesInFolder,
  gamesUnderFolder,
  type GameFolder,
} from "./savedGameFolders";

/*
  Pure reads over hand-built trees — no storage, no React. The trees below are
  small enough to reason about: every test names its shape inline.
*/

const AT = new Date("2026-09-07T10:00:00.000Z");

/** One folder with the id/name/parent the test asks for. */
const folder = (
  id: string,
  name: string,
  parentId: string | null,
): GameFolder => ({
  id,
  name,
  parentId,
  savedAt: AT.toISOString(),
  updatedAt: AT.toISOString(),
});

/** One game filed into `folderId`. The moves are irrelevant to the reads. */
const game = (id: string, folderId: string | null): SavedGame =>
  savedGameOf(
    id,
    gameFromChess(new Chess()),
    DEFAULT_ENGINE_SETTINGS,
    AT,
    AT.toISOString(),
    folderId,
  );

describe("gameFolderFrom — reading a stored row back", () => {
  it("keeps a folder whose fields all parse", () => {
    const back = gameFolderFrom({
      id: "a",
      name: "Games",
      parentId: null,
      savedAt: AT.toISOString(),
      updatedAt: AT.toISOString(),
    });

    expect(back).toEqual({
      id: "a",
      name: "Games",
      parentId: null,
      savedAt: AT.toISOString(),
      updatedAt: AT.toISOString(),
    });
  });

  it("normalises a parentId that is neither null nor a non-empty string", () => {
    expect(
      gameFolderFrom({
        id: "a",
        name: "Games",
        parentId: "",
        savedAt: AT.toISOString(),
        updatedAt: AT.toISOString(),
      })?.parentId,
    ).toBeNull();
    expect(
      gameFolderFrom({
        id: "a",
        name: "Games",
        parentId: 7,
        savedAt: AT.toISOString(),
        updatedAt: AT.toISOString(),
      })?.parentId,
    ).toBeNull();
  });

  it("never drops a folder — a half-broken name reads as empty", () => {
    const back = gameFolderFrom({
      id: "a",
      name: null,
      parentId: null,
      savedAt: AT.toISOString(),
      updatedAt: AT.toISOString(),
    });

    expect(back).not.toBeUndefined();
    expect(back?.name).toBe("");
  });

  it("drops a row that is not a folder at all", () => {
    expect(gameFolderFrom("not a folder")).toBeUndefined();
    expect(gameFolderFrom({ id: "", name: "x", parentId: null })).toBeUndefined();
    expect(gameFolderFrom(null)).toBeUndefined();
  });
});

describe("gameFolderChildren — what drilling in shows", () => {
  it("lists the direct children of one parent, sorted by name", () => {
    const tree = [
      folder("games", "Games", null),
      folder("e4", "e4 games", "games"),
      folder("d4", "d4 games", "games"),
      folder("end", "Endgames", "games"),
      folder("deep", "Deep inside", "e4"),
    ];

    expect(gameFolderChildren(tree, "games").map((f) => f.id)).toEqual([
      "d4",
      "e4",
      "end",
    ]);
    expect(gameFolderChildren(tree, "e4").map((f) => f.id)).toEqual(["deep"]);
  });

  it("treats a parent that does not resolve as the top level", () => {
    // `lost` names a parent that is not in the list: it still belongs
    // somewhere, so it reads as a child of null.
    const tree = [
      folder("kept", "Kept", null),
      folder("lost", "Lost", "gone"),
    ];

    expect(gameFolderChildren(tree, null).map((f) => f.id)).toEqual([
      "kept",
      "lost",
    ]);
  });

  it("never counts a folder as its own child, even if a store says so", () => {
    const tree = [folder("self", "Self", "self")];
    expect(gameFolderChildren(tree, "self")).toEqual([]);
    expect(gameFolderChildren(tree, null).map((f) => f.id)).toEqual(["self"]);
  });

  it("sorts in Hebrew order too, so a Hebrew list browses naturally", () => {
    const tree = [
      folder("alef", "אלף", null),
      folder("bet", "בית", null),
      folder("gimel", "גימל", null),
    ];

    expect(gameFolderChildren(tree, null).map((f) => f.id)).toEqual([
      "alef",
      "bet",
      "gimel",
    ]);
  });
});

describe("gameFolderPath — the breadcrumb chain", () => {
  it("walks from the top level down to and including one folder", () => {
    const tree = [
      folder("games", "Games", null),
      folder("e4", "e4 games", "games"),
      folder("deep", "Deep inside", "e4"),
    ];

    expect(gameFolderPath(tree, "deep").map((f) => f.id)).toEqual([
      "games",
      "e4",
      "deep",
    ]);
    expect(gameFolderPath(tree, "games").map((f) => f.id)).toEqual(["games"]);
  });

  it("cuts a cycle at the folder it was entered on", () => {
    // a → b → a: a naive walk loops forever. The chain is the ancestors each
    // folder's parent pointers name, then the folder itself — the loop's first
    // lap, cut rather than never finishing.
    const tree = [
      folder("a", "A", "b"),
      folder("b", "B", "a"),
    ];

    expect(gameFolderPath(tree, "a").map((f) => f.id)).toEqual(["b", "a"]);
    expect(gameFolderPath(tree, "b").map((f) => f.id)).toEqual(["a", "b"]);
  });

  it("is empty for an id that is not there", () => {
    expect(gameFolderPath([folder("a", "A", null)], "gone")).toEqual([]);
  });
});

describe("gameFolderSubtree — one folder and everything under it", () => {
  it("includes the folder's own id and every descendant", () => {
    const tree = [
      folder("games", "Games", null),
      folder("e4", "e4 games", "games"),
      folder("deep", "Deep inside", "e4"),
      folder("d4", "d4 games", "games"),
    ];

    expect(gameFolderSubtree(tree, "games")).toEqual(
      new Set(["games", "e4", "deep", "d4"]),
    );
    expect(gameFolderSubtree(tree, "deep")).toEqual(new Set(["deep"]));
  });

  it("stops at a cycle rather than looping — and never grows the second lap", () => {
    const tree = [
      folder("a", "A", "b"),
      folder("b", "B", "a"),
      folder("c", "C", "a"),
    ];

    expect(gameFolderSubtree(tree, "a")).toEqual(new Set(["a", "b", "c"]));
    expect(gameFolderSubtree(tree, "c")).toEqual(new Set(["c"]));
  });
});

describe("gamesUnderFolder — the count a folder card stands for", () => {
  it("counts games across the whole subtree, directly and not", () => {
    const tree = [
      folder("games", "Games", null),
      folder("e4", "e4 games", "games"),
    ];
    const rows = [
      game("g1", "games"),
      game("g2", "e4"),
      game("g3", "e4"),
      game("g4", null),
    ];

    expect(gamesUnderFolder(rows, tree, "games")).toBe(3);
    expect(gamesUnderFolder(rows, tree, "e4")).toBe(2);
  });

  it("ignores games that name a folder no longer there", () => {
    const tree = [folder("games", "Games", null)];
    const rows = [game("g1", "games"), game("g2", "gone")];

    expect(gamesUnderFolder(rows, tree, "games")).toBe(1);
  });

  it("is zero for an empty folder — the delete rule's cue", () => {
    const tree = [folder("games", "Games", null)];
    const rows = [game("g1", null)];

    expect(gamesUnderFolder(rows, tree, "games")).toBe(0);
  });
});

describe("gamesInFolder — the rows behind a folder click", () => {
  it("returns the games across the whole subtree, in the caller's order", () => {
    const tree = [
      folder("games", "Games", null),
      folder("e4", "e4 games", "games"),
    ];
    const rows = [
      game("g1", "games"),
      game("g2", "e4"),
      game("g3", "e4"),
      game("g4", null),
    ];

    expect(gamesInFolder(rows, tree, "games")).toEqual([rows[0], rows[1], rows[2]]);
    expect(gamesInFolder(rows, tree, "e4")).toEqual([rows[1], rows[2]]);
  });

  it("is the same set gamesUnderFolder counts, by construction", () => {
    const tree = [folder("games", "Games", null)];
    const rows = [game("g1", "games"), game("g2", "gone"), game("g3", null)];

    expect(gamesUnderFolder(rows, tree, "games")).toBe(
      gamesInFolder(rows, tree, "games").length,
    );
  });
});

describe("flattenGameFolders — the picker's one indented list", () => {
  it("annotates every folder with its depth, parents before children", () => {
    const tree = [
      folder("games", "Games", null),
      folder("e4", "e4 games", "games"),
      folder("deep", "Deep inside", "e4"),
      folder("d4", "d4 games", "games"),
      folder("end", "Endgames", null),
    ];

    expect(flattenGameFolders(tree)).toEqual([
      { folder: folder("end", "Endgames", null), depth: 0 },
      { folder: folder("games", "Games", null), depth: 0 },
      { folder: folder("d4", "d4 games", "games"), depth: 1 },
      { folder: folder("e4", "e4 games", "games"), depth: 1 },
      { folder: folder("deep", "Deep inside", "e4"), depth: 2 },
    ]);
  });

  it("cuts a cycle rather than looping — a pure cycle has no top level at all", () => {
    const tree = [
      folder("a", "A", "b"),
      folder("b", "B", "a"),
    ];

    expect(flattenGameFolders(tree)).toEqual([]);
  });
});
