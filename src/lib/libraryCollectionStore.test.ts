import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  addCollection,
  findUploadedCollection,
  insertCollectionGame,
  LIBRARY_COLLECTIONS_STORAGE_KEY,
  removeCollection,
  replaceCollectionGame,
  uploadedCollectionsSnapshot,
} from "./libraryCollectionStore";
import { MAX_UPLOAD_CHARS } from "./pgnText";

const ONE = '[White "A"]\n[Black "B"]\n\n1. e4 e5 *';
const TWO = '[White "C"]\n[Black "D"]\n\n1. d4 d5 *';

beforeEach(() => localStorage.clear());

const added = (name = "Mine", games = [ONE, TWO]) => {
  const result = addCollection(name, games, new Date("2026-09-21T10:00:00Z"));
  if (!("collection" in result)) throw new Error("not added");
  return result.collection;
};

describe("the uploaded collections", () => {
  it("keeps a collection, newest first, as it will read back after a reload", () => {
    const first = added("First");
    const second = added("Second", [TWO]);

    expect(uploadedCollectionsSnapshot().map((c) => c.name)).toEqual(["Second", "First"]);
    expect(findUploadedCollection(first.id)).toMatchObject({
      name: "First",
      source: "uploaded",
      games: [ONE, TWO],
      addedAt: "2026-09-21T10:00:00.000Z",
    });
    // Stored under its own versioned key, as JSON a new session reads back.
    const stored = JSON.parse(localStorage.getItem(LIBRARY_COLLECTIONS_STORAGE_KEY) ?? "[]");
    expect(stored.map((row: { id: string }) => row.id)).toEqual([second.id, first.id]);
    expect(first.id).toMatch(/^u/);
  });

  it("is stable between changes", () => {
    added();
    expect(uploadedCollectionsSnapshot()).toBe(uploadedCollectionsSnapshot());
  });

  it("updates one game in place, and inserts a copy after its original", () => {
    const collection = added();

    expect(replaceCollectionGame(collection.id, 2, "1. c4 *")).toBeUndefined();
    expect(findUploadedCollection(collection.id)?.games).toEqual([ONE, "1. c4 *"]);

    expect(insertCollectionGame(collection.id, 2, "1. Nf3 *")).toBeUndefined();
    expect(findUploadedCollection(collection.id)?.games).toEqual([ONE, "1. Nf3 *", "1. c4 *"]);
  });

  it("refuses a game or a collection that is not there", () => {
    const collection = added();
    expect(replaceCollectionGame(collection.id, 3, "1. c4 *")).toBe("missing");
    expect(replaceCollectionGame("nope", 1, "1. c4 *")).toBe("missing");
    expect(insertCollectionGame(collection.id, 0, "1. c4 *")).toBe("missing");
  });

  it("forgets one", () => {
    const collection = added();
    removeCollection(collection.id);
    expect(uploadedCollectionsSnapshot()).toEqual([]);
  });

  it("refuses a collection past the budget, and reports a full storage", () => {
    expect(addCollection("Big", ["x".repeat(MAX_UPLOAD_CHARS + 1)])).toEqual({
      problem: "too-large",
    });

    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(addCollection("Mine", [ONE])).toEqual({ problem: "storage" });
    setItem.mockRestore();
    expect(uploadedCollectionsSnapshot()).toEqual([]);
  });
});
