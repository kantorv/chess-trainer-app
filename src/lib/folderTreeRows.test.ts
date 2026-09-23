import { describe, expect, it } from "vitest";

import { folderTreeRows, type FolderTreeRow, type FolderTreeRowsOptions } from "./folderTreeRows";
import type { GameFolder } from "./savedGameFolders";

/*
  A folder tree as a details view's rows (CTA-88): folders before items at
  every level, a pinned folder first, sizes over whole subtrees, closed
  folders hiding their contents, and a filter that opens the way down to what
  matches.
*/

const at = (id: string, parentId: string | null = null): GameFolder => ({
  id,
  name: id,
  parentId,
  savedAt: "",
  updatedAt: "",
});

type Item = { id: string; folderId: string | null; size: number };
const item = (id: string, folderId: string | null, size = 1): Item => ({ id, folderId, size });

const FOLDERS = [at("b"), at("a"), at("pin"), at("a1", "a"), at("a2", "a"), at("gone-parent", "nowhere")];
const ITEMS = [item("x", null, 5), item("in-a", "a", 2), item("deep", "a1", 3), item("lost", "nowhere", 7), item("builtin", "pin", 4)];

const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);

const build = (options: Partial<FolderTreeRowsOptions<Item>> = {}) =>
  folderTreeRows<Item>({
    folders: FOLDERS,
    items: ITEMS,
    isOpen: () => true,
    compareFolders: byId,
    compareItems: byId,
    sizeOf: (row) => row.size,
    pinned: ["pin"],
    ...options,
  });

const shape = (rows: FolderTreeRow<Item>[]) =>
  rows.map((row) => `${"  ".repeat(row.depth)}${row.kind === "folder" ? `[${row.folder.id} ${row.size}]` : row.item.id}`);

describe("folderTreeRows", () => {
  it("puts folders before items at every level, the pinned one first, sized over their subtrees", () => {
    expect(shape(build().rows)).toEqual([
      "[pin 4]",
      "  builtin",
      "[a 5]",
      "  [a1 3]",
      "    deep",
      "  [a2 0]",
      "  in-a",
      "[b 0]",
      "[gone-parent 0]",
      "lost",
      "x",
    ]);
  });

  it("leaves a closed folder's contents out, and says which folders are empty", () => {
    const { rows } = build({ isOpen: (id) => id !== "a" });
    expect(shape(rows)).toEqual(["[pin 4]", "  builtin", "[a 5]", "[b 0]", "[gone-parent 0]", "lost", "x"]);
    const empty = rows.flatMap((row) => (row.kind === "folder" && row.empty ? [row.folder.id] : []));
    expect(empty).toEqual(["b", "gone-parent"]);
  });

  it("filters to the matches and the way down to them, opening the folders above a match", () => {
    const opened: string[] = [];
    const { rows, shownItems } = build({
      isOpen: (id, auto) => {
        if (auto) opened.push(id);
        return auto;
      },
      match: { folder: () => false, item: (row) => row.id === "deep" },
    });
    expect(shape(rows)).toEqual(["[a 5]", "  [a1 3]", "    deep"]);
    expect(opened).toEqual(["a", "a1"]);
    expect(shownItems).toBe(1);
  });

  it("shows a matching folder with everything under it, closed until opened", () => {
    const closed = build({
      isOpen: (_id, auto) => auto,
      match: { folder: (folder) => folder.id === "a1", item: () => false },
    });
    expect(shape(closed.rows)).toEqual(["[a 5]", "  [a1 3]"]);
    expect(closed.shownItems).toBe(1);

    const opened = build({
      isOpen: (id, auto) => auto || id === "a1",
      match: { folder: (folder) => folder.id === "a1", item: () => false },
    });
    expect(shape(opened.rows)).toEqual(["[a 5]", "  [a1 3]", "    deep"]);
  });
});
