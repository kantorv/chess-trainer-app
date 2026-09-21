import { beforeEach, describe, expect, it, vi } from "vitest";

import { indexedRowOf } from "./collectionIndex";
import {
  addCollection,
  insertCollectionGame,
  LIBRARY_DB_NAME,
  loadUploadedCollections,
  loadUploadedGames,
  loadUploadedRows,
  peekUploadedGames,
  peekUploadedRows,
  removeCollection,
  replaceCollectionGame,
  resetLibraryCollectionStore,
  uploadedCollectionsSnapshot,
} from "./libraryCollectionStore";

/*
  The reader's uploaded collections in IndexedDB (fake-indexeddb under jsdom,
  src/test/setup.ts): a summary, an index and the games per collection, kept
  in step by every write, and read back as a new session would.
*/

const ONE = '[White "A"]\n[Black "B"]\n\n1. e4 e5 *';
const TWO = '[White "C"]\n[Black "D"]\n\n1. d4 d5 *';
const COPY = '[White "A"]\n[Black "B"]\n\n1. e4 e5 2. Nf3 *';

beforeEach(async () => {
  await resetLibraryCollectionStore();
});

const added = async (name = "Mine", games = [ONE, TWO], at = "2026-09-21T10:00:00Z") => {
  const result = await addCollection(name, games, games.map((pgn) => indexedRowOf(pgn)), new Date(at));
  if (!("collection" in result)) throw new Error("not added");
  return result.collection;
};

/** A fresh instance of the store — a reload: nothing read yet, the database as it was. */
const reload = async () => {
  vi.resetModules();
  return import("./libraryCollectionStore");
};

describe("the uploaded collections", () => {
  it("keeps a collection, newest first, as a new session reads it back", async () => {
    const first = await added("First");
    const second = await added("Second", [TWO], "2026-09-21T11:00:00Z");

    expect(uploadedCollectionsSnapshot()?.map((c) => [c.name, c.count])).toEqual([
      ["Second", 1],
      ["First", 2],
    ]);
    expect(first).toMatchObject({ source: "uploaded", count: 2, addedAt: "2026-09-21T10:00:00.000Z" });
    expect(first.id).toMatch(/^u/);

    const fresh = await reload();
    expect(fresh.uploadedCollectionsSnapshot()).toBeUndefined();
    expect((await fresh.loadUploadedCollections()).map((c) => c.id)).toEqual([second.id, first.id]);
    expect(await fresh.loadUploadedGames(first.id)).toEqual([ONE, TWO]);
    expect((await fresh.loadUploadedRows(first.id))?.map((row) => [row.number, row.white])).toEqual([
      [1, "A"],
      [2, "C"],
    ]);
    await fresh.resetLibraryCollectionStore();
  });

  it("keeps what it has read, for a synchronous second visit", async () => {
    const mine = await added();
    // Just written: already known.
    expect(peekUploadedGames(mine.id)).toEqual([ONE, TWO]);
    const rows = await loadUploadedRows(mine.id);
    expect(peekUploadedRows(mine.id)).toBe(rows);
    expect(await loadUploadedRows("nothing")).toBeNull();
    expect(peekUploadedRows("nothing")).toBeNull();
  });

  it("holds 10,000 games in one collection", async () => {
    const games = Array.from({ length: 10_000 }, (_, index) => (index % 2 === 0 ? ONE : TWO));
    const rows = games.map((_, index) => indexedRowOf(index % 2 === 0 ? ONE : TWO));
    const result = await addCollection("Big", games, rows);
    expect(result).toHaveProperty("collection.count", 10_000);
  });

  it("tells a subscriber once the first read lands, and after each write", async () => {
    await added("Before");
    const fresh = await reload();
    const listener = vi.fn();
    const unsubscribe = fresh.subscribeUploadedCollections(listener);
    expect(fresh.uploadedCollectionsSnapshot()).toBeUndefined();
    await vi.waitFor(() => expect(fresh.uploadedCollectionsSnapshot()).toHaveLength(1));
    const calls = listener.mock.calls.length;
    expect(calls).toBeGreaterThan(0);
    await fresh.addCollection("After", [ONE], [indexedRowOf(ONE)]);
    expect(listener.mock.calls.length).toBeGreaterThan(calls);
    unsubscribe();
    await fresh.resetLibraryCollectionStore();
  });

  it("forgets one, games and index with it", async () => {
    const keep = await added("Keep");
    const drop = await added("Drop");
    expect(await removeCollection(drop.id)).toBeUndefined();
    expect(uploadedCollectionsSnapshot()?.map((c) => c.id)).toEqual([keep.id]);
    expect(await loadUploadedGames(drop.id)).toBeNull();
    expect(await removeCollection("nothing")).toBeUndefined();
  });
});

describe("editing a game", () => {
  it("updates one game and its row in place", async () => {
    const mine = await added();
    expect(await replaceCollectionGame(mine.id, 1, COPY, indexedRowOf(COPY))).toBeUndefined();
    expect(await loadUploadedGames(mine.id)).toEqual([COPY, TWO]);
    expect((await loadUploadedRows(mine.id))?.[0].moves).toBe(2);
    expect(uploadedCollectionsSnapshot()?.[0].count).toBe(2);
  });

  it("inserts a copy right after its original, the rows moving with the games", async () => {
    const mine = await added();
    expect(await insertCollectionGame(mine.id, 2, COPY, indexedRowOf(COPY))).toBeUndefined();
    expect(await loadUploadedGames(mine.id)).toEqual([ONE, COPY, TWO]);
    expect((await loadUploadedRows(mine.id))?.map((row) => [row.number, row.white, row.moves])).toEqual([
      [1, "A", 1],
      [2, "A", 2],
      [3, "C", 1],
    ]);
    expect(uploadedCollectionsSnapshot()?.[0].count).toBe(3);
  });

  it("says so for a game or a collection that is not there", async () => {
    const mine = await added();
    expect(await replaceCollectionGame(mine.id, 9, COPY, indexedRowOf(COPY))).toBe("missing");
    expect(await insertCollectionGame(mine.id, 0, COPY, indexedRowOf(COPY))).toBe("missing");
    expect(await replaceCollectionGame("nothing", 1, COPY, indexedRowOf(COPY))).toBe("missing");
    expect(await loadUploadedGames(mine.id)).toEqual([ONE, TWO]);
  });
});

describe("without IndexedDB", () => {
  it("reads empty and reports every write, never throwing", async () => {
    await resetLibraryCollectionStore();
    const saved = globalThis.indexedDB;
    // @ts-expect-error — a browser with storage disabled
    delete globalThis.indexedDB;
    try {
      expect(await loadUploadedCollections()).toEqual([]);
      expect(await addCollection("X", [ONE], [indexedRowOf(ONE)])).toEqual({ problem: "storage" });
      expect(await loadUploadedGames("x")).toBeNull();
    } finally {
      globalThis.indexedDB = saved;
    }
  });
});

it("uses its own database", () => {
  expect(LIBRARY_DB_NAME).toBe("chessapp.library");
});
