import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { indexedRowOf } from "./collectionIndex";
import { addCollection, resetLibraryCollectionStore } from "./libraryCollectionStore";
import {
  estimatedGamePgnBytes,
  estimatedLibraryGamesPayload,
  estimatedPayloadBytes,
  formatBytes,
  readBrowserStorage,
} from "./storageDiagnostics";

/*
  The storage-diagnostics helpers (CTA-94): the payload rules, the byte
  formatter, the browser estimate (jsdom has no `navigator.storage`, so each
  test stubs what it wants the browser to say), and the Library's games
  estimated from index rows over the real store — fake-indexeddb, which
  `src/test/setup.ts` deletes between tests (the Library's own database is
  reset here).
*/

const pgn = (event: string) => `[Event "${event}"]\n[White "W"]\n[Black "B"]\n[Result "*"]\n\n1. e4 e5 *`;

beforeEach(async () => {
  await resetLibraryCollectionStore();
});

afterEach(() => {
  delete (window.navigator as { storage?: unknown }).storage;
});

describe("estimatedPayloadBytes", () => {
  it("measures a value by its own rules, not by JSON", () => {
    expect(estimatedPayloadBytes("")).toBe(0);
    expect(estimatedPayloadBytes("abc")).toBe(6);
    expect(estimatedPayloadBytes(7)).toBe(8);
    expect(estimatedPayloadBytes(true)).toBe(4);
    expect(estimatedPayloadBytes(null)).toBe(0);
    expect(estimatedPayloadBytes(undefined)).toBe(0);
  });

  it("adds a slot per array element, and a name per property", () => {
    expect(estimatedPayloadBytes([7, 7])).toBe(2 * (8 + 8));
    expect(estimatedPayloadBytes({ a: "bc" })).toBe(2 + 8 + 4);
    expect(estimatedPayloadBytes({ nested: { a: [true] } })).toBe(2 * 6 + 8 + 2 + 8 + 8 + 4);
  });

  it("measures binary data by its bytes", () => {
    expect(estimatedPayloadBytes(new ArrayBuffer(10))).toBe(10);
    expect(estimatedPayloadBytes(new Uint8Array([1, 2, 3]))).toBe(3);
    expect(estimatedPayloadBytes(new Blob(["abc"]))).toBe(3);
    expect(estimatedPayloadBytes(new Map([["k", 1]]))).toBe(8 + 2 + 8);
    expect(estimatedPayloadBytes(new Set(["a"]))).toBe(8 + 2);
    expect(estimatedPayloadBytes(new Date(0))).toBe(8);
  });

  it("counts a value reached twice once — what a structured clone holds", () => {
    const shared = { text: "abc" };
    // "a" and "b" each carry their name and slot; "shared" itself is held once.
    expect(estimatedPayloadBytes({ a: shared, b: shared })).toBe(2 * (2 + 8) + (2 * 4 + 8 + 6));
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(estimatedPayloadBytes(cyclic)).toBe(2 * 4 + 8);
  });

  it("sizes a record mostly by its PGN", () => {
    const record = { id: "g1", pgn: pgn("Played"), path: ["e4"], savedAt: "2026-09-01" };
    expect(estimatedPayloadBytes(record)).toBeGreaterThan(2 * pgn("Played").length);
  });
});

describe("formatBytes", () => {
  it("reads as a person does, bytes up to terabytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(24_000)).toBe("23.4 KB");
    expect(formatBytes(1024 ** 2)).toBe("1.0 MB");
    expect(formatBytes(240_000)).toBe("234 KB");
    expect(formatBytes(2 * 1024 ** 3)).toBe("2.0 GB");
    expect(formatBytes(5 * 1024 ** 4)).toBe("5.0 TB");
    expect(formatBytes(1024 ** 5)).toBe("1024 TB");
  });
});

/** Give the browser's Storage API a voice for one test: what `estimate()` says, or nothing at all. */
const stubEstimate = (estimate?: Record<string, unknown>) => {
  Object.defineProperty(window.navigator, "storage", {
    configurable: true,
    get: () => (estimate === undefined ? undefined : { estimate: async () => estimate }),
  });
};

describe("readBrowserStorage", () => {
  it("passes on the browser's estimates", async () => {
    stubEstimate({ usage: 25_000_000, quota: 2_000_000_000, usageDetails: { indexedDB: 23_000_000 } });
    await expect(readBrowserStorage()).resolves.toEqual({
      usage: 25_000_000,
      quota: 2_000_000_000,
      indexedDB: 23_000_000,
    });
  });

  it("reads a portion the browser does not report as not available, never as zero", async () => {
    stubEstimate({ usage: 1000, quota: 2048 });
    await expect(readBrowserStorage()).resolves.toEqual({ usage: 1000, quota: 2048, indexedDB: null });
  });

  it("says nothing is available when the browser refuses or has no Storage API", async () => {
    Object.defineProperty(window.navigator, "storage", {
      configurable: true,
      get: () => ({ estimate: () => Promise.reject(new Error("refused")) }),
    });
    await expect(readBrowserStorage()).resolves.toEqual({ usage: null, quota: null, indexedDB: null });

    stubEstimate(undefined);
    await expect(readBrowserStorage()).resolves.toEqual({ usage: null, quota: null, indexedDB: null });
  });
});

describe("estimatedGamePgnBytes", () => {
  it("estimates a game from its index row, not its text", () => {
    // 400 characters of tags, the SAN tokens with a space each (2+1 + 2+1),
    // a move number per move, and the result — twice for UTF-16.
    expect(estimatedGamePgnBytes({ moves: 1, line: ["e4", "e5"] })).toBe(2 * (400 + 6 + 4 + 8));
    expect(estimatedGamePgnBytes({ moves: 0 })).toBe(2 * (400 + 8));
  });

  it("grows with the game it stands for", () => {
    const short = estimatedGamePgnBytes({ moves: 10, line: ["e4", "e5"] });
    const long = estimatedGamePgnBytes({
      moves: 80,
      line: ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6"],
    });
    expect(long).toBeGreaterThan(short);
  });
});

describe("estimatedLibraryGamesPayload", () => {
  it("estimates every uploaded collection's games from its index", async () => {
    const games = [pgn("One"), pgn("Two")];
    const rows = games.map((game) => indexedRowOf(game));
    const kept = await addCollection("Mine", games, rows);
    if (!("collection" in kept)) throw new Error("the collection was not kept");

    const expected = rows.reduce((total, row) => total + estimatedGamePgnBytes(row), 0);
    await expect(estimatedLibraryGamesPayload([{ id: kept.collection.id }])).resolves.toBe(expected);
  });

  it("is nothing without collections, and skips one whose index cannot be read", async () => {
    await expect(estimatedLibraryGamesPayload([])).resolves.toBe(0);
    await expect(estimatedLibraryGamesPayload([{ id: "not-there" }])).resolves.toBe(0);
  });
});
