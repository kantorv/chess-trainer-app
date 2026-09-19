import { afterEach, describe, expect, it, vi } from "vitest";

import { savedOpeningOf } from "./savedOpenings";
import { emptyTree } from "./gameTree";
import {
  MAX_OPENING_FOLDERS,
  createOpeningFolder,
  ensureOpeningFolder,
  findOpeningFolder,
  moveOpeningFolder,
  OPENING_FOLDERS_STORAGE_KEY,
  removeOpeningFolder,
  renameOpeningFolder,
  openingFoldersSnapshot,
  subscribeOpeningFolders,
} from "./savedOpeningFolderStore";
import {
  MAX_SAVED_OPENINGS,
  saveOpening,
  savedOpeningsSnapshot,
} from "./savedOpeningStore";

/*
  `src/test/setup.ts` clears `localStorage` between tests, and both stores'
  caches are checked against revisions that live *in* storage — so a clear takes
  the caches with it and each test below starts from an empty tree without this
  file reaching into either module's internals.

  The openings store is *not* stubbed: the delete test writes real openings and
  asserts they are re-filed, because that rule spans both stores and is the
  whole of what deleting a folder means.
*/

const AT = new Date("2026-09-07T10:00:00.000Z");
const LATER = new Date("2026-09-08T11:00:00.000Z");

/** One opening filed into `folderId`. */
const saveOpeningIn = (id: string, folderId: string | null) => {
  saveOpening(savedOpeningOf(id, emptyTree(), "white", "", folderId, AT));
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the saved-opening-folders store — creating", () => {
  it("starts empty, and hands back the folder it creates", () => {
    expect(openingFoldersSnapshot()).toEqual([]);

    const created = createOpeningFolder("Sicilian", null, AT);

    expect(created).toEqual({
      id: expect.any(String),
      name: "Sicilian",
      parentId: null,
      savedAt: AT.toISOString(),
      updatedAt: AT.toISOString(),
    });
    expect(openingFoldersSnapshot().map((folder) => folder.name)).toEqual([
      "Sicilian",
    ]);
  });

  it("finds one by id", () => {
    const created = createOpeningFolder("Sicilian", null, AT);

    expect(findOpeningFolder(created?.id)?.name).toBe("Sicilian");
    expect(findOpeningFolder("nope")).toBeUndefined();
    expect(findOpeningFolder(null)).toBeUndefined();
  });

  it("refuses a name that trims to nothing", () => {
    expect(createOpeningFolder("   ", null, AT)).toBeUndefined();
    expect(openingFoldersSnapshot()).toEqual([]);
  });

  it("refuses a parent that is not there — a subtree no reader can reach", () => {
    expect(createOpeningFolder("Orphan", "gone", AT)).toBeUndefined();
    expect(openingFoldersSnapshot()).toEqual([]);
  });

  it("trims a name to MAX_OPENING_FOLDER_NAME", () => {
    const created = createOpeningFolder("a".repeat(150), null, AT);

    expect(created?.name).toHaveLength(100);
  });

  it("keeps at most MAX_OPENING_FOLDERS", () => {
    for (let index = 0; index < MAX_OPENING_FOLDERS; index += 1) {
      createOpeningFolder(`folder-${index}`, null, AT);
    }

    expect(createOpeningFolder("one too many", null, AT)).toBeUndefined();
    expect(openingFoldersSnapshot()).toHaveLength(MAX_OPENING_FOLDERS);
  });

  it("reports a full quota instead of throwing out of the create", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    expect(createOpeningFolder("Sicilian", null, AT)).toBeUndefined();
  });
});

describe("the saved-opening-folders store — the default rule's helper", () => {
  it("returns an existing folder with that name and parent, and never duplicates it", () => {
    const first = createOpeningFolder("King's Pawn Game", null, AT);

    const again = ensureOpeningFolder("King's Pawn Game", null, LATER);

    expect(again?.id).toBe(first?.id);
    expect(openingFoldersSnapshot()).toHaveLength(1);
  });

  it("creates one when there is no such folder yet", () => {
    const created = ensureOpeningFolder("King's Pawn Game", null, AT);

    expect(created?.name).toBe("King's Pawn Game");
    expect(openingFoldersSnapshot()).toHaveLength(1);
  });

  it("matches on parent too — two folders named alike at different levels stay apart", () => {
    const root = createOpeningFolder("Sicilian", null, AT);
    const child = createOpeningFolder("Inside", null, AT);

    const nested = ensureOpeningFolder("Sicilian", child?.id ?? null, LATER);

    expect(nested?.id).not.toBe(root?.id);
    // The first "Sicilian", the level's folder, and the second "Sicilian" —
    // three records, the two alike ones at different levels.
    expect(openingFoldersSnapshot()).toHaveLength(3);
  });
});

describe("the saved-opening-folders store — renaming", () => {
  it("renames in place, stamping updatedAt and keeping the record's place", () => {
    const first = createOpeningFolder("Before", null, AT);
    createOpeningFolder("Second", null, AT);

    renameOpeningFolder(first?.id ?? "", "After", LATER);

    const [top, second] = openingFoldersSnapshot();
    expect(top?.name).toBe("After");
    expect(top?.updatedAt).toBe(LATER.toISOString());
    expect(second?.name).toBe("Second");
  });

  it("is a no-op for a name that trims to nothing — not a wipe", () => {
    const created = createOpeningFolder("Kept", null, AT);

    expect(renameOpeningFolder(created?.id ?? "", "   ", LATER)).toBe(undefined);
    expect(findOpeningFolder(created?.id)?.name).toBe("Kept");
  });

  it("is a no-op for a name that has not changed, and an id that is not there", () => {
    const created = createOpeningFolder("Same", null, AT);
    const before = openingFoldersSnapshot();

    expect(renameOpeningFolder(created?.id ?? "", "Same", LATER)).toBe(undefined);
    expect(renameOpeningFolder("nope", "x", LATER)).toBe(undefined);
    expect(openingFoldersSnapshot()).toBe(before);
  });
});

describe("the saved-opening-folders store — moving", () => {
  const tree = () => {
    const root = createOpeningFolder("Openings", null, AT);
    const child = createOpeningFolder("e4 lines", root?.id ?? null, AT);
    const deep = createOpeningFolder("Deep inside", child?.id ?? null, AT);
    const sibling = createOpeningFolder("Games", null, AT);
    return { root, child, deep, sibling };
  };

  it("moves a folder under another, and to the top level", () => {
    const { root, deep, sibling } = tree();

    moveOpeningFolder(deep?.id ?? "", sibling?.id ?? null, LATER);
    expect(findOpeningFolder(deep?.id)?.parentId).toBe(sibling?.id);

    moveOpeningFolder(sibling?.id ?? "", null, LATER);
    expect(findOpeningFolder(sibling?.id)?.parentId).toBeNull();

    // A move that happened is stamped; nothing else is.
    expect(findOpeningFolder(deep?.id)?.updatedAt).toBe(LATER.toISOString());
    expect(findOpeningFolder(root?.id)?.updatedAt).toBe(AT.toISOString());
  });

  it("refuses a folder moved into its own subtree — the one move that loops", () => {
    const { root, deep } = tree();

    expect(
      moveOpeningFolder(root?.id ?? "", deep?.id ?? null, LATER),
    ).toBe(undefined);
    expect(findOpeningFolder(root?.id)?.parentId).toBeNull();
    expect(
      moveOpeningFolder(root?.id ?? "", root?.id ?? null, LATER),
    ).toBe(undefined);
  });

  it("is a no-op for an id that is not there, a missing parent, and a move that changes nothing", () => {
    const { root, child } = tree();
    const before = openingFoldersSnapshot();

    expect(moveOpeningFolder("nope", null, LATER)).toBe(undefined);
    expect(moveOpeningFolder(root?.id ?? "", "gone", LATER)).toBe(undefined);
    expect(moveOpeningFolder(child?.id ?? "", root?.id ?? null, LATER)).toBe(
      undefined,
    );
    expect(openingFoldersSnapshot()).toBe(before);
  });
});

describe("the saved-opening-folders store — deleting", () => {
  it("removes an empty folder outright", () => {
    const created = createOpeningFolder("Empty", null, AT);

    removeOpeningFolder(created?.id ?? "", LATER);

    expect(openingFoldersSnapshot()).toEqual([]);
  });

  it("is a no-op for an id that is not there", () => {
    expect(removeOpeningFolder("nope", LATER)).toBe(undefined);
  });

  it("re-parents sub-folders to the deleted folder's own parent, so the tree closes up", () => {
    const root = createOpeningFolder("Openings", null, AT);
    const child = createOpeningFolder("e4 lines", root?.id ?? null, AT);
    const deep = createOpeningFolder("Deep inside", child?.id ?? null, AT);

    removeOpeningFolder(child?.id ?? "", LATER);

    expect(
      openingFoldersSnapshot().map((folder) => folder.id).sort(),
    ).toEqual([root?.id, deep?.id].sort());
    // The orphaned sub-folder lands on the deleted folder's parent, not on
    // nothing.
    expect(findOpeningFolder(deep?.id)?.parentId).toBe(root?.id);
  });

  it("files openings filed in it back to Unfiled — and leaves deeper ones alone", () => {
    const root = createOpeningFolder("Openings", null, AT);
    const child = createOpeningFolder("e4 lines", root?.id ?? null, AT);
    saveOpeningIn("direct", root?.id ?? null);
    saveOpeningIn("nested", child?.id ?? null);
    saveOpeningIn("elsewhere", null);

    removeOpeningFolder(root?.id ?? "", LATER);

    // Directly-filed openings become Unfiled...
    expect(findOpeningFolder("direct")).toBeUndefined();
    expect(
      savedOpeningsSnapshot().find((row) => row.id === "direct")?.folderId,
    ).toBeNull();
    // ...openings deeper down keep their folder, which re-parented up...
    expect(
      savedOpeningsSnapshot().find((row) => row.id === "nested")?.folderId,
    ).toBe(child?.id);
    // ...and an opening that was never in the subtree is untouched.
    expect(
      savedOpeningsSnapshot().find((row) => row.id === "elsewhere")?.folderId,
    ).toBeNull();
  });

  it("unfiles the openings even when the folder write fails", () => {
    const created = createOpeningFolder("Openings", null, AT);
    saveOpeningIn("direct", created?.id ?? null);

    // Only the folders' own writes fail — the half-done delete the rule is
    // about. Other keys write through, so the openings' re-filing lands.
    const realSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (String(key).startsWith("chessapp.savedOpeningFolders")) {
        throw new Error("QuotaExceededError");
      }
      realSetItem.call(this, key, value);
    });

    expect(removeOpeningFolder(created?.id ?? "", LATER)).toBe("storage");
    // The folder write failed — the folder itself is still there...
    expect(findOpeningFolder(created?.id)?.name).toBe("Openings");
    // ...but the openings are re-filed to Unfiled regardless.
    expect(
      savedOpeningsSnapshot().find((row) => row.id === "direct")?.folderId,
    ).toBeNull();
  });
});

describe("the saved-opening-folders store — surviving and sharing", () => {
  it("survives a reload — the folders are read back out of storage", () => {
    const created = createOpeningFolder("Sicilian", null, AT);
    const stored: unknown = JSON.parse(
      localStorage.getItem(OPENING_FOLDERS_STORAGE_KEY)!,
    );

    expect(Array.isArray(stored)).toBe(true);
    expect(
      (stored as { id: string }[]).some((row) => row.id === created?.id),
    ).toBe(true);
  });

  it("reads an empty list rather than throwing on a corrupt entry", () => {
    localStorage.setItem(OPENING_FOLDERS_STORAGE_KEY, "{ not json");
    localStorage.setItem(`${OPENING_FOLDERS_STORAGE_KEY}.rev`, "1");

    expect(openingFoldersSnapshot()).toEqual([]);
  });

  it("normalises a broken row on read and keeps the rest", () => {
    localStorage.setItem(
      OPENING_FOLDERS_STORAGE_KEY,
      JSON.stringify([
        { id: "broken", name: null, parentId: "", savedAt: "x", updatedAt: "x" },
        { nonsense: true },
        { id: "kept", name: "Kept", parentId: null, savedAt: "x", updatedAt: "x" },
      ]),
    );
    localStorage.setItem(`${OPENING_FOLDERS_STORAGE_KEY}.rev`, "2");

    const rows = openingFoldersSnapshot();
    expect(rows.map((row) => row.id)).toEqual(["broken", "kept"]);
    // The broken row still renders one folder — a half-broken record beats a
    // tree with a hole in it.
    expect(findOpeningFolder("broken")).toEqual({
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

    expect(openingFoldersSnapshot()).toEqual([]);
  });

  it("tells its subscribers when one is created, and stops when they leave", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeOpeningFolders(listener);

    createOpeningFolder("Sicilian", null, AT);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    createOpeningFolder("Games", null, AT);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("lives beside the openings' own store, in its own key — so a folder is not an opening", () => {
    createOpeningFolder("Sicilian", null, AT);
    saveOpeningIn("a1", null);

    // Two stores, two keys, two snapshots; a folder is not an opening and an
    // opening is not a folder.
    expect(openingFoldersSnapshot()).toHaveLength(1);
    expect(savedOpeningsSnapshot()).toHaveLength(1);
    expect(openingFoldersSnapshot()[0].id).not.toBe(savedOpeningsSnapshot()[0].id);
  });

  it("caps the folders with their own bound, separate from the openings' cap", () => {
    expect(MAX_OPENING_FOLDERS).toBeGreaterThan(0);
    expect(MAX_SAVED_OPENINGS).toBeGreaterThan(0);
    expect(MAX_OPENING_FOLDERS).not.toBe(MAX_SAVED_OPENINGS);
  });
});
