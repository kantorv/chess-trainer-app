import { gameFolderPath, gameFolderSubtree, type FiledRecord, type GameFolder } from "./savedGameFolders";

/**
 * **A folder tree as the rows of a table** (CTA-88) — what a file manager's
 * details view draws: one row per folder or item, parents before children,
 * each at its depth, a folder's contents present only while it is open.
 * Pure, and generic over the items filed in the folders (anything with a
 * `folderId`), so another list can take the same table; the Library is its
 * first consumer (`views/shared/folders/FolderTreeTable.tsx`).
 *
 * - **Folders before items at every level**, as in a file manager, each group
 *   ordered by the caller's comparator; a **pinned** folder (the Library's
 *   Built-in) comes before every other folder of its level.
 * - **An item whose folder is not there sits at the top level**, and so does
 *   a folder whose parent is not there (`lib/savedGameFolders.ts`'s rule).
 * - **A folder's size is its whole subtree's** (`sizeOf` summed over every
 *   item under it), whatever is open or filtered.
 * - **Filtering** (`match`) keeps the items that match and the folders whose
 *   name does, everything under a matching folder, and the folders on the way
 *   down to any of them. The folders above a *match* are opened for it
 *   (`auto` in {@link FolderTreeRowsOptions.isOpen}); a matching folder is
 *   shown, and opens only when the reader opens it.
 */

export type FolderTreeRow<T> =
  | {
      kind: "folder";
      folder: GameFolder;
      depth: number;
      open: boolean;
      /** `sizeOf` summed over every item in its subtree. */
      size: number;
      /** Whether anything is filed under it — a sub-folder or an item. */
      empty: boolean;
    }
  | { kind: "item"; item: T; depth: number };

export type FolderTreeRowsOptions<T extends FiledRecord> = {
  folders: readonly GameFolder[];
  items: readonly T[];
  /** Whether a folder shows its contents; `auto` is whether the filter opens it. */
  isOpen: (folderId: string, auto: boolean) => boolean;
  compareFolders: (a: GameFolder, b: GameFolder) => number;
  compareItems: (a: T, b: T) => number;
  /** How much one item counts towards its folders' sizes. */
  sizeOf: (item: T) => number;
  /** Folders first among the folders of their level, in this order. */
  pinned?: readonly string[];
  /** A filter: absent, everything is shown. */
  match?: { folder: (folder: GameFolder) => boolean; item: (item: T) => boolean };
};

export type FolderTreeRows<T> = {
  rows: FolderTreeRow<T>[];
  /** How many items the filter keeps — every item without one, open or not. */
  shownItems: number;
};

export const folderTreeRows = <T extends FiledRecord>({
  folders,
  items,
  isOpen,
  compareFolders,
  compareItems,
  sizeOf,
  pinned = [],
  match,
}: FolderTreeRowsOptions<T>): FolderTreeRows<T> => {
  const known = new Set(folders.map((folder) => folder.id));
  const parentOf = (folder: GameFolder): string | null =>
    folder.parentId !== null && folder.parentId !== folder.id && known.has(folder.parentId)
      ? folder.parentId
      : null;
  const folderOf = (item: T): string | null =>
    item.folderId !== null && known.has(item.folderId) ? item.folderId : null;

  const childFolders = new Map<string | null, GameFolder[]>();
  for (const folder of folders) {
    const parent = parentOf(folder);
    childFolders.set(parent, [...(childFolders.get(parent) ?? []), folder]);
  }
  const childItems = new Map<string | null, T[]>();
  for (const item of items) {
    const folder = folderOf(item);
    const list = childItems.get(folder);
    if (list === undefined) childItems.set(folder, [item]);
    else list.push(item);
  }

  // Sizes: each item counted into every folder on its path.
  const sizes = new Map<string, number>();
  for (const item of items) {
    const folder = folderOf(item);
    if (folder === null) continue;
    for (const step of gameFolderPath(folders, folder)) {
      sizes.set(step.id, (sizes.get(step.id) ?? 0) + sizeOf(item));
    }
  }

  // The filter: what is shown, and which folders it opens.
  let shownFolder: (folder: GameFolder) => boolean = () => true;
  let shownItem: (item: T) => boolean = () => true;
  const auto = new Set<string>();
  if (match !== undefined) {
    const inside = new Set<string>();
    const onTheWay = new Set<string>();
    const openAbove = (folderId: string | null, self: boolean) => {
      if (folderId === null) return;
      const path = gameFolderPath(folders, folderId);
      for (const step of self ? path : path.slice(0, -1)) {
        onTheWay.add(step.id);
        auto.add(step.id);
      }
    };
    for (const folder of folders) {
      if (!match.folder(folder)) continue;
      for (const id of gameFolderSubtree(folders, folder.id)) inside.add(id);
      openAbove(folder.id, false);
    }
    const keptItems = new Set<T>();
    for (const item of items) {
      const folder = folderOf(item);
      if (match.item(item)) {
        keptItems.add(item);
        openAbove(folder, true);
      } else if (folder !== null && inside.has(folder)) {
        keptItems.add(item);
      }
    }
    // A folder inside a match shows the path down to it as well.
    for (const id of inside) {
      for (const step of gameFolderPath(folders, id)) onTheWay.add(step.id);
    }
    shownFolder = (folder) => inside.has(folder.id) || onTheWay.has(folder.id);
    shownItem = (item) => keptItems.has(item);
  }

  const pinnedFirst = (a: GameFolder, b: GameFolder) => {
    const rank = (folder: GameFolder) => {
      const at = pinned.indexOf(folder.id);
      return at === -1 ? pinned.length : at;
    };
    return rank(a) - rank(b) || compareFolders(a, b);
  };

  const rows: FolderTreeRow<T>[] = [];
  const seen = new Set<string>();
  const walk = (parentId: string | null, depth: number) => {
    const folderRows = (childFolders.get(parentId) ?? []).filter(shownFolder).sort(pinnedFirst);
    for (const folder of folderRows) {
      if (seen.has(folder.id)) continue;
      seen.add(folder.id);
      const open = isOpen(folder.id, auto.has(folder.id));
      rows.push({
        kind: "folder",
        folder,
        depth,
        open,
        size: sizes.get(folder.id) ?? 0,
        empty: (childFolders.get(folder.id) ?? []).length === 0 && (childItems.get(folder.id) ?? []).length === 0,
      });
      if (open) walk(folder.id, depth + 1);
    }
    const itemRows = (childItems.get(parentId) ?? []).filter(shownItem).sort(compareItems);
    for (const item of itemRows) rows.push({ kind: "item", item, depth });
  };
  walk(null, 0);

  return { rows, shownItems: items.filter(shownItem).length };
};
