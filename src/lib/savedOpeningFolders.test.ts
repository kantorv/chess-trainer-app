import { describe, expect, it } from "vitest";

import { emptyTree } from "./gameTree";
import { savedOpeningOf, type SavedOpening } from "./savedOpenings";
import {
  flattenOpeningFolders,
  openingFolderChildren,
  openingFolderPath,
  openingFolderSubtree,
  openingsUnderFolder,
  openingFolderFrom,
  type OpeningFolder,
} from "./savedOpeningFolders";

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
): OpeningFolder => ({
  id,
  name,
  parentId,
  savedAt: AT.toISOString(),
  updatedAt: AT.toISOString(),
});

/** One opening filed into `folderId`. */
const opening = (id: string, folderId: string | null): SavedOpening =>
  savedOpeningOf(id, emptyTree(), "white", "", folderId, AT);

describe("openingFolderFrom — reading a stored row back", () => {
  it("keeps a folder whose fields all parse", () => {
    const back = openingFolderFrom({
      id: "a",
      name: "Openings",
      parentId: null,
      savedAt: AT.toISOString(),
      updatedAt: AT.toISOString(),
    });

    expect(back).toEqual({
      id: "a",
      name: "Openings",
      parentId: null,
      savedAt: AT.toISOString(),
      updatedAt: AT.toISOString(),
    });
  });

  it("normalises a parentId that is neither null nor a non-empty string", () => {
    expect(
      openingFolderFrom({
        id: "a",
        name: "Openings",
        parentId: "",
        savedAt: AT.toISOString(),
        updatedAt: AT.toISOString(),
      })?.parentId,
    ).toBeNull();
    expect(
      openingFolderFrom({
        id: "a",
        name: "Openings",
        parentId: 7,
        savedAt: AT.toISOString(),
        updatedAt: AT.toISOString(),
      })?.parentId,
    ).toBeNull();
  });

  it("never drops a folder — a half-broken name reads as empty", () => {
    const back = openingFolderFrom({
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
    expect(openingFolderFrom("not a folder")).toBeUndefined();
    expect(openingFolderFrom({ id: "", name: "x", parentId: null })).toBeUndefined();
    expect(openingFolderFrom(null)).toBeUndefined();
  });
});

describe("openingFolderChildren — what drilling in shows", () => {
  it("lists the direct children of one parent, sorted by name", () => {
    const tree = [
      folder("open", "Openings", null),
      folder("e4", "e4 lines", "open"),
      folder("d4", "d4 lines", "open"),
      folder("sic", "Sicilian", "open"),
      folder("deep", "Deep inside", "e4"),
    ];

    expect(openingFolderChildren(tree, "open").map((f) => f.id)).toEqual([
      "d4",
      "e4",
      "sic",
    ]);
    expect(openingFolderChildren(tree, "e4").map((f) => f.id)).toEqual(["deep"]);
  });

  it("treats a parent that does not resolve as the top level", () => {
    // `lost` names a parent that is not in the list: it still belongs
    // somewhere, so it reads as a child of null.
    const tree = [
      folder("kept", "Kept", null),
      folder("lost", "Lost", "gone"),
    ];

    expect(openingFolderChildren(tree, null).map((f) => f.id)).toEqual([
      "kept",
      "lost",
    ]);
  });

  it("never counts a folder as its own child, even if a store says so", () => {
    const tree = [folder("self", "Self", "self")];
    expect(openingFolderChildren(tree, "self")).toEqual([]);
    expect(openingFolderChildren(tree, null).map((f) => f.id)).toEqual(["self"]);
  });

  it("sorts in Hebrew order too, so a Hebrew list browses naturally", () => {
    const tree = [
      folder("alef", "אלף", null),
      folder("bet", "בית", null),
      folder("gimel", "גימל", null),
    ];

    expect(openingFolderChildren(tree, null).map((f) => f.id)).toEqual([
      "alef",
      "bet",
      "gimel",
    ]);
  });
});

describe("openingFolderPath — the breadcrumb chain", () => {
  it("walks from the top level down to and including one folder", () => {
    const tree = [
      folder("open", "Openings", null),
      folder("e4", "e4 lines", "open"),
      folder("deep", "Deep inside", "e4"),
    ];

    expect(openingFolderPath(tree, "deep").map((f) => f.id)).toEqual([
      "open",
      "e4",
      "deep",
    ]);
    expect(openingFolderPath(tree, "open").map((f) => f.id)).toEqual(["open"]);
  });

  it("cuts a cycle at the folder it was entered on", () => {
    // a → b → a: a naive walk loops forever. The chain is the ancestors each
    // folder's parent pointers name, then the folder itself — the loop's first
    // lap, cut rather than never finishing.
    const tree = [
      folder("a", "A", "b"),
      folder("b", "B", "a"),
    ];

    expect(openingFolderPath(tree, "a").map((f) => f.id)).toEqual(["b", "a"]);
    expect(openingFolderPath(tree, "b").map((f) => f.id)).toEqual(["a", "b"]);
  });

  it("is empty for an id that is not there", () => {
    expect(openingFolderPath([folder("a", "A", null)], "gone")).toEqual([]);
  });
});

describe("openingFolderSubtree — one folder and everything under it", () => {
  it("includes the folder's own id and every descendant", () => {
    const tree = [
      folder("open", "Openings", null),
      folder("e4", "e4 lines", "open"),
      folder("deep", "Deep inside", "e4"),
      folder("d4", "d4 lines", "open"),
    ];

    expect(openingFolderSubtree(tree, "open")).toEqual(
      new Set(["open", "e4", "deep", "d4"]),
    );
    expect(openingFolderSubtree(tree, "deep")).toEqual(new Set(["deep"]));
  });

  it("stops at a cycle rather than looping — and never grows the second lap", () => {
    const tree = [
      folder("a", "A", "b"),
      folder("b", "B", "a"),
      folder("c", "C", "a"),
    ];

    expect(openingFolderSubtree(tree, "a")).toEqual(
      new Set(["a", "b", "c"]),
    );
    expect(openingFolderSubtree(tree, "c")).toEqual(new Set(["c"]));
  });
});

describe("openingsUnderFolder — the count a folder card stands for", () => {
  it("counts openings across the whole subtree, directly and not", () => {
    const tree = [
      folder("open", "Openings", null),
      folder("e4", "e4 lines", "open"),
    ];
    const rows = [
      opening("o1", "open"),
      opening("o2", "e4"),
      opening("o3", "e4"),
      opening("o4", null),
    ];

    expect(openingsUnderFolder(rows, tree, "open")).toBe(3);
    expect(openingsUnderFolder(rows, tree, "e4")).toBe(2);
  });

  it("ignores openings that name a folder no longer there", () => {
    const tree = [folder("open", "Openings", null)];
    const rows = [opening("o1", "open"), opening("o2", "gone")];

    expect(openingsUnderFolder(rows, tree, "open")).toBe(1);
  });

  it("is zero for an empty folder — the delete rule's cue", () => {
    const tree = [folder("open", "Openings", null)];
    const rows = [opening("o1", null)];

    expect(openingsUnderFolder(rows, tree, "open")).toBe(0);
  });
});

describe("flattenOpeningFolders — the picker's one indented list", () => {
  it("annotates every folder with its depth, parents before children", () => {
    const tree = [
      folder("open", "Openings", null),
      folder("e4", "e4 lines", "open"),
      folder("deep", "Deep inside", "e4"),
      folder("d4", "d4 lines", "open"),
      folder("games", "Games", null),
    ];

    expect(flattenOpeningFolders(tree)).toEqual([
      { folder: folder("games", "Games", null), depth: 0 },
      { folder: folder("open", "Openings", null), depth: 0 },
      { folder: folder("d4", "d4 lines", "open"), depth: 1 },
      { folder: folder("e4", "e4 lines", "open"), depth: 1 },
      { folder: folder("deep", "Deep inside", "e4"), depth: 2 },
    ]);
  });

  it("cuts a cycle rather than looping — a pure cycle has no top level at all", () => {
    const tree = [
      folder("a", "A", "b"),
      folder("b", "B", "a"),
    ];

    expect(flattenOpeningFolders(tree)).toEqual([]);
  });
});
