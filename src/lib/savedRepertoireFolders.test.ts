import { describe, expect, it, vi } from "vitest";

import {
  repertoireFolderFrom,
  repertoiresInFolder,
  sortedRepertoireFolders,
  type RepertoireFolder,
} from "./savedRepertoireFolders";
import {
  createRepertoireFolder,
  MAX_REPERTOIRE_FOLDERS,
  removeRepertoireFolder,
  renameRepertoireFolder,
  REPERTOIRE_FOLDERS_STORAGE_KEY,
  repertoireFoldersSnapshot,
} from "./savedRepertoireFolderStore";
import { readRepertoireText, savedRepertoireOf } from "./savedRepertoires";
import {
  fileRepertoire,
  saveRepertoire,
  savedRepertoiresSnapshot,
  subscribeSavedRepertoires,
} from "./savedRepertoireStore";

/* `src/test/setup.ts` clears `localStorage` between tests, caches included. */

const repertoire = (id: string, folderId: string | null = null) => {
  const reading = readRepertoireText("1. e4 e5 *");
  if (!reading.ok) throw new Error("fixture did not read");
  return { ...savedRepertoireOf(id, reading.games[0], id, undefined), folderId };
};

const folder = (id: string, name: string): RepertoireFolder => ({
  id,
  name,
  savedAt: "",
  updatedAt: "",
});

describe("repertoire folders — the pure half", () => {
  it("normalise a stored row, dropping one with no id and ignoring any parent", () => {
    expect(repertoireFolderFrom({ id: "f", name: 7, parentId: "g" })).toEqual({
      id: "f",
      name: "",
      savedAt: "",
      updatedAt: "",
    });
    expect(repertoireFolderFrom({ name: "x" })).toBeUndefined();
    expect(repertoireFolderFrom("junk")).toBeUndefined();
  });

  it("sort by name", () => {
    expect(
      sortedRepertoireFolders([folder("b", "Sicilian"), folder("a", "Caro")]).map((f) => f.name),
    ).toEqual(["Caro", "Sicilian"]);
  });

  it("list a folder's repertoires, and read one filed under a missing folder as Unfiled", () => {
    const folders = [folder("f", "Caro")];
    const rows = [repertoire("a", "f"), repertoire("b"), repertoire("c", "gone")];
    expect(repertoiresInFolder(rows, folders, "f").map((row) => row.id)).toEqual(["a"]);
    expect(repertoiresInFolder(rows, folders, null).map((row) => row.id)).toEqual(["b", "c"]);
  });
});

describe("repertoire folders — the store", () => {
  it("creates a folder and hands it back, and refuses an empty name", () => {
    const made = createRepertoireFolder("  Caro  ");
    expect(made?.name).toBe("Caro");
    expect(repertoireFoldersSnapshot()).toEqual([made]);
    expect(localStorage.getItem(REPERTOIRE_FOLDERS_STORAGE_KEY)).toContain('"Caro"');

    expect(createRepertoireFolder("   ")).toBeUndefined();
    expect(repertoireFoldersSnapshot()).toHaveLength(1);
  });

  it("stops at the cap", () => {
    for (let i = 0; i < MAX_REPERTOIRE_FOLDERS; i += 1) createRepertoireFolder(`f${i}`);
    expect(createRepertoireFolder("one more")).toBeUndefined();
    expect(repertoireFoldersSnapshot()).toHaveLength(MAX_REPERTOIRE_FOLDERS);
  });

  it("renames in place, and ignores an empty name", () => {
    const made = createRepertoireFolder("Caro")!;
    renameRepertoireFolder(made.id, "Caro-Kann");
    renameRepertoireFolder(made.id, "  ");
    expect(repertoireFoldersSnapshot()[0].name).toBe("Caro-Kann");
  });

  it("deletes a folder and keeps its repertoires, back in Unfiled", () => {
    const made = createRepertoireFolder("Caro")!;
    saveRepertoire(repertoire("a", made.id));
    saveRepertoire(repertoire("b"));

    expect(removeRepertoireFolder(made.id)).toBeUndefined();
    expect(repertoireFoldersSnapshot()).toEqual([]);
    expect(savedRepertoiresSnapshot().map((row) => [row.id, row.folderId])).toEqual([
      ["b", null],
      ["a", null],
    ]);
  });
});

describe("filing a repertoire", () => {
  it("moves it in place, keeping the list order, and a no-op move writes nothing", () => {
    const made = createRepertoireFolder("Caro")!;
    saveRepertoire(repertoire("a"));
    saveRepertoire(repertoire("b"));

    fileRepertoire("a", made.id);
    expect(savedRepertoiresSnapshot().map((row) => [row.id, row.folderId])).toEqual([
      ["b", null],
      ["a", made.id],
    ]);

    const listener = vi.fn();
    const unsubscribe = subscribeSavedRepertoires(listener);
    fileRepertoire("a", made.id);
    fileRepertoire("nope", null);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });
});
