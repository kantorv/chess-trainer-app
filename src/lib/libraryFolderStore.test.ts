import { beforeEach, describe, expect, it, vi } from "vitest";

import { indexedRowOf } from "./collectionIndex";
import {
  addCollection,
  loadUploadedCollections,
  moveCollection,
  resetLibraryCollectionStore,
  uploadedCollectionsSnapshot,
} from "./libraryCollectionStore";
import { LIBRARY_DB_NAME } from "./libraryDb";
import {
  createLibraryFolder,
  libraryFoldersSnapshot,
  loadLibraryFolders,
  MAX_LIBRARY_FOLDERS,
  moveLibraryFolder,
  removeLibraryFolder,
  renameLibraryFolder,
  resetLibraryFolderStore,
} from "./libraryFolderStore";

/*
  The Library's folders (CTA-88): the `folders` object store of
  `chessapp.library`, and the `folderId` a collection's summary carries —
  created, renamed, moved (never into their own subtree) and deleted keeping
  their contents, and read back as a new session would. The database's
  upgrade from version 1 keeps every collection it held.
*/

const ONE = '[White "A"]\n[Black "B"]\n\n1. e4 e5 *';

beforeEach(async () => {
  resetLibraryFolderStore();
  await resetLibraryCollectionStore();
});

const folder = async (name: string, parentId: string | null = null) => {
  const made = await createLibraryFolder(name, parentId);
  if (made === undefined) throw new Error("not made");
  return made;
};

const collection = async (name: string, folderId: string | null = null) => {
  const added = await addCollection(name, [ONE], [indexedRowOf(ONE)], undefined, undefined, folderId);
  if (!("collection" in added)) throw new Error("not added");
  return added.collection;
};

/** A fresh instance of both stores — a reload: nothing read yet, the database as it was. */
const reload = async () => {
  vi.resetModules();
  return {
    folders: await import("./libraryFolderStore"),
    collections: await import("./libraryCollectionStore"),
  };
};

const parents = () => Object.fromEntries((libraryFoldersSnapshot() ?? []).map((row) => [row.name, row.parentId]));

describe("the Library's folders", () => {
  it("creates folders at the top level and inside one, to any depth, as a new session reads them back", async () => {
    const top = await folder("Openings");
    const middle = await folder("Sicilian", top.id);
    const deep = await folder("Najdorf", middle.id);

    expect(parents()).toEqual({ Openings: null, Sicilian: top.id, Najdorf: middle.id });
    expect(deep.id).toMatch(/^g/);

    const fresh = await reload();
    expect(fresh.folders.libraryFoldersSnapshot()).toBeUndefined();
    expect((await fresh.folders.loadLibraryFolders()).map((row) => row.name)).toEqual([
      "Openings",
      "Sicilian",
      "Najdorf",
    ]);
  });

  it("makes nothing of an empty name, a parent that is not there, or a full store", async () => {
    expect(await createLibraryFolder("   ", null)).toBeUndefined();
    expect(await createLibraryFolder("Lost", "nowhere")).toBeUndefined();
    for (let index = 0; index < MAX_LIBRARY_FOLDERS; index += 1) await folder(`F${index}`);
    expect(await createLibraryFolder("One too many", null)).toBeUndefined();
    expect(await loadLibraryFolders()).toHaveLength(MAX_LIBRARY_FOLDERS);
  });

  it("renames a folder, and takes an empty or unchanged name as nothing to do", async () => {
    const made = await folder("Old");
    await renameLibraryFolder(made.id, "  New  ");
    expect(libraryFoldersSnapshot()?.[0].name).toBe("New");
    const before = libraryFoldersSnapshot();
    await renameLibraryFolder(made.id, "");
    await renameLibraryFolder(made.id, "New");
    expect(libraryFoldersSnapshot()).toBe(before);
  });

  it("moves a folder, refusing its own subtree and a parent that is not there", async () => {
    const a = await folder("A");
    const b = await folder("B", a.id);
    const c = await folder("C");

    await moveLibraryFolder(a.id, b.id);
    await moveLibraryFolder(a.id, a.id);
    await moveLibraryFolder(a.id, "nowhere");
    expect(parents()).toEqual({ A: null, B: a.id, C: null });

    await moveLibraryFolder(a.id, c.id);
    await moveLibraryFolder(b.id, null);
    expect(parents()).toEqual({ A: c.id, B: null, C: null });
  });

  it("deletes a folder keeping its contents: its sub-folders and collections move up to its parent", async () => {
    const top = await folder("Top");
    const doomed = await folder("Doomed", top.id);
    const kept = await folder("Kept", doomed.id);
    const inside = await collection("Inside", doomed.id);
    const deeper = await collection("Deeper", kept.id);

    await removeLibraryFolder(doomed.id);

    expect(parents()).toEqual({ Top: null, Kept: top.id });
    const byName = Object.fromEntries((uploadedCollectionsSnapshot() ?? []).map((row) => [row.name, row.folderId]));
    expect(byName).toEqual({ Inside: top.id, Deeper: kept.id });
    expect(inside.folderId).toBe(doomed.id);
    expect(deeper.folderId).toBe(kept.id);

    // A top-level folder's contents go to the top level.
    await removeLibraryFolder(top.id);
    expect(parents()).toEqual({ Kept: null });
    expect((await loadUploadedCollections()).find((row) => row.name === "Inside")?.folderId).toBeNull();
  });

  it("takes an unknown folder's delete as nothing to do", async () => {
    await folder("Here");
    const before = libraryFoldersSnapshot();
    expect(await removeLibraryFolder("nowhere")).toBeUndefined();
    expect(libraryFoldersSnapshot()).toBe(before);
  });
});

describe("a collection's folder", () => {
  it("files a new collection at the top level unless told otherwise, and moves it with Move to…", async () => {
    const box = await folder("Box");
    const loose = await collection("Loose");
    const filed = await collection("Filed", box.id);
    expect(loose.folderId).toBeNull();
    expect(filed.folderId).toBe(box.id);

    expect(await moveCollection(loose.id, box.id)).toBeUndefined();
    expect(await moveCollection(filed.id, null)).toBeUndefined();
    const fresh = await reload();
    const byName = Object.fromEntries(
      (await fresh.collections.loadUploadedCollections()).map((row) => [row.name, row.folderId]),
    );
    expect(byName).toEqual({ Loose: box.id, Filed: null });
  });

  it("answers missing for a collection that is not there, and a move to where it is already as nothing to do", async () => {
    const mine = await collection("Mine");
    expect(await moveCollection("nothing-here", null)).toBe("missing");
    const before = uploadedCollectionsSnapshot();
    expect(await moveCollection(mine.id, null)).toBeUndefined();
    expect(uploadedCollectionsSnapshot()).toBe(before);
  });
});

/** Open the database at version 1, as a build from before folders left it, with one collection in it. */
const seedVersionOne = () =>
  new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(LIBRARY_DB_NAME, 1);
    request.onupgradeneeded = () => {
      for (const store of ["collections", "indexes", "games"]) {
        request.result.createObjectStore(store, { keyPath: "id" });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(["collections", "indexes", "games"], "readwrite");
      tx.objectStore("collections").put({ id: "uold", name: "Old upload", addedAt: "2026-01-01T00:00:00.000Z", count: 1 });
      tx.objectStore("indexes").put({ id: "uold", rows: [indexedRowOf(ONE)] });
      tx.objectStore("games").put({ id: "uold", games: [ONE] });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });

describe("the database's upgrade from version 1", () => {
  it("adds the folders store and keeps every collection, filed at the top level", async () => {
    await resetLibraryCollectionStore();
    await seedVersionOne();
    const fresh = await reload();

    const [old] = await fresh.collections.loadUploadedCollections();
    expect(old).toMatchObject({ id: "uold", name: "Old upload", count: 1, folderId: null });
    expect(await fresh.collections.loadUploadedGames("uold")).toEqual([ONE]);

    const made = await fresh.folders.createLibraryFolder("New", null);
    expect(made).toBeDefined();
    expect(await fresh.collections.moveCollection("uold", made!.id)).toBeUndefined();
    expect((await fresh.collections.loadUploadedCollections())[0].folderId).toBe(made!.id);
  });
});
