import { afterEach, describe, expect, it, vi } from "vitest";

import { recordStore } from "./recordStore";

/*
  `src/test/setup.ts` clears `localStorage` between tests, and the cache below
  is checked against a revision that lives *in* storage — so a clear takes the
  cache with it and each test starts from an empty store without this file
  reaching into the factory's internals.
*/

type Row = { id: string; label: string };

const KEY = "chessapp.recordStore.test.v1";

const isRow = (value: unknown): Row | undefined => {
  if (typeof value !== "object" || value === null) return undefined;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || row.id === "" || typeof row.label !== "string")
    return undefined;
  return { id: row.id, label: row.label };
};

const store = recordStore<Row>(KEY, isRow);

const row = (id: string): Row => ({ id, label: `label for ${id}` });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the record-store factory", () => {
  it("starts empty, and keeps what is written to it", () => {
    expect(store.snapshot()).toEqual([]);

    expect(store.write([row("g1"), row("g2")])).toBe(undefined);

    expect(store.snapshot()).toEqual([row("g1"), row("g2")]);

    // What storage holds: a JSON array of the rows under the key, and a
    // revision stamped under a second key beside it.
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual([row("g1"), row("g2")]);
    expect(localStorage.getItem(`${KEY}.rev`)).toMatch(/^\d+-\d+$/);
  });

  it("returns the same array until something changes", () => {
    store.write([row("g1")]);

    expect(store.snapshot()).toBe(store.snapshot());

    const before = store.snapshot();
    store.write([row("g2")]);
    expect(store.snapshot()).not.toBe(before);
  });

  it("re-reads only when the revision moves", () => {
    store.write([row("g1")]);
    expect(store.snapshot()).toEqual([row("g1")]);

    // What another tab's write does: the data moves, and the revision with it.
    localStorage.setItem(KEY, JSON.stringify([row("g2")]));
    localStorage.setItem(`${KEY}.rev`, "forced-1");
    expect(store.snapshot()).toEqual([row("g2")]);

    // The point of the stamp: data that moves *without* the revision is not
    // re-read — the snapshot stays cached.
    localStorage.setItem(KEY, JSON.stringify([row("g3")]));
    expect(store.snapshot()).toEqual([row("g2")]);
  });

  it("goes back to the data when the revision disappears", () => {
    store.write([row("g1")]);
    expect(store.snapshot()).toEqual([row("g1")]);

    // What `localStorage.clear()` does — between two tests, or from the
    // browser's own controls: the revision is gone, so the next snapshot reads
    // the data again and finds it gone.
    localStorage.clear();
    expect(store.snapshot()).toEqual([]);
  });

  it("drops a row the normaliser refuses and keeps the rest", () => {
    localStorage.setItem(KEY, JSON.stringify([{ nonsense: true }, row("g1")]));
    localStorage.setItem(`${KEY}.rev`, "dropped-1");

    expect(store.snapshot()).toEqual([row("g1")]);
  });

  it("reads an empty list on a corrupt entry, and on a non-array", () => {
    // Each revision below is unique to this test: the cache is checked
    // against the revision string, not the data, so a value another test
    // already snapshotted would read as "unchanged".
    localStorage.setItem(KEY, "{ not json");
    localStorage.setItem(`${KEY}.rev`, "corrupt-1");
    expect(store.snapshot()).toEqual([]);

    localStorage.setItem(KEY, "[1, 2]");
    localStorage.setItem(`${KEY}.rev`, "corrupt-2");
    expect(store.snapshot()).toEqual([]);
  });
});

describe("the record-store factory — subscribing", () => {
  it("tells its subscribers when a write lands, and stops when they leave", () => {
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.write([row("g1")]);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    store.write([row("g2")]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("hears another tab through the storage event", () => {
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    // Another tab's write of the data, or of the revision, both move the
    // snapshot — and a `clear()` there has no key at all.
    window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
    window.dispatchEvent(new StorageEvent("storage", { key: `${KEY}.rev` }));
    window.dispatchEvent(new StorageEvent("storage", { key: null }));
    expect(listener).toHaveBeenCalledTimes(3);

    // A key that belongs to another store is not ours to hear.
    window.dispatchEvent(new StorageEvent("storage", { key: "chessapp.other.v1" }));
    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
  });

  it("gives each store its own instance", () => {
    const other = recordStore<Row>("chessapp.recordStore.test.other.v1", isRow);
    const listener = vi.fn();
    store.subscribe(listener);

    other.write([row("g1")]);

    expect(listener).not.toHaveBeenCalled();
    expect(store.snapshot()).toEqual([]);
    expect(other.snapshot()).toEqual([row("g1")]);
  });
});

describe("the record-store factory — when storage will not co-operate", () => {
  it("reports a full quota instead of throwing out of the write", () => {
    store.write([row("g1")]);
    const before = store.snapshot();

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    expect(store.write([row("g2")])).toBe("storage");
    expect(store.snapshot()).toBe(before);
  });

  it("reports the failure even when only the revision write is refused", () => {
    // The data write lands, the revision write does not: the write still
    // reports a problem, because a revision that did not move means the next
    // snapshot may be stale.
    let setItemCalls = 0;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      setItemCalls += 1;
      if (setItemCalls === 2) throw new Error("QuotaExceededError");
    });

    expect(store.write([row("g1")])).toBe("storage");
    expect(setItemCalls).toBe(2);
  });

  it("reads nothing rather than throwing when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });

    expect(store.snapshot()).toEqual([]);
  });
});
