import { afterEach, describe, expect, it, vi } from "vitest";
import { Chess } from "chess.js";

import { DEFAULT_ANALYSIS_SETTINGS } from "./analysisSettings";
import { resolveGameReference } from "./gameReference";
import {
  addMove,
  emptyTree,
  fenAtNode,
  nodeAtSanPath,
  type GameTree,
} from "./gameTree";
import { savedAnalysisOf, type SavedAnalysis } from "./savedAnalyses";
import {
  clearSavedAnalyses,
  findSavedAnalysis,
  MAX_SAVED_ANALYSES,
  removeSavedAnalysis,
  SAVED_ANALYSES_STORAGE_KEY,
  saveAnalysis,
  savedAnalysesCatalog,
  savedAnalysesSnapshot,
  subscribeSavedAnalyses,
} from "./savedAnalysisStore";

/*
  `src/test/setup.ts` clears `localStorage` between tests, and the store's cache
  is checked against a revision that lives *in* storage — so a clear takes the
  cache with it and each test below starts from an empty list without this file
  reaching into the module's internals.
*/

/** A tree grown by playing SAN down one line, the way the screen grows one. */
const grownTree = (moves: readonly string[]): GameTree => {
  let tree = emptyTree();
  let nodeId: string | null = null;

  for (const san of moves) {
    const move = new Chess(fenAtNode(tree, nodeId)).move(san);
    const added = addMove(tree, nodeId, {
      san: move.san,
      from: move.from,
      to: move.to,
      fen: move.after,
    });
    tree = added.tree;
    nodeId = added.nodeId;
  }

  return tree;
};

const save = (
  id: string,
  moves: readonly string[],
  path: readonly string[] = [],
  settings = DEFAULT_ANALYSIS_SETTINGS,
  orientation: "white" | "black" = "white",
  now = new Date("2026-09-07T10:00:00.000Z"),
): SavedAnalysis =>
  savedAnalysisOf(id, grownTree(moves), path, settings, orientation, now);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the saved-analyses store", () => {
  it("starts empty, and keeps an analysis that is written to it", () => {
    expect(savedAnalysesSnapshot()).toEqual([]);

    expect(saveAnalysis(save("a1", ["e4", "e5"]))).toBe(undefined);

    expect(savedAnalysesSnapshot().map((row) => row.id)).toEqual(["a1"]);
    expect(findSavedAnalysis("a1")?.settings).toEqual(DEFAULT_ANALYSIS_SETTINGS);
  });

  it("survives a reload — the analyses are read back out of storage", () => {
    saveAnalysis(save("a1", ["e4"]));

    const stored: unknown = JSON.parse(
      localStorage.getItem(SAVED_ANALYSES_STORAGE_KEY)!,
    );

    expect(Array.isArray(stored)).toBe(true);
    expect(savedAnalysesSnapshot()[0].pgn).toContain("1. e4");
  });

  it("replaces an analysis in place, so saving on every move is one row", () => {
    saveAnalysis(save("a1", ["e4"]));
    saveAnalysis(save("a1", ["e4", "e5"]));
    saveAnalysis(save("a1", ["e4", "e5", "Nf3"]));

    expect(savedAnalysesSnapshot()).toHaveLength(1);
    expect(savedAnalysesSnapshot()[0].pgn).toContain("Nf3");
  });

  it("lists them newest first, and moves one worked on back to the top", () => {
    saveAnalysis(save("a1", ["e4"]));
    saveAnalysis(save("a2", ["d4"]));
    expect(savedAnalysesSnapshot().map((row) => row.id)).toEqual(["a2", "a1"]);

    saveAnalysis(save("a1", ["e4", "e5"]));
    expect(savedAnalysesSnapshot().map((row) => row.id)).toEqual(["a1", "a2"]);
  });

  it("keeps the date an analysis was begun when it is worked on", () => {
    saveAnalysis(
      save(
        "a1",
        ["e4"],
        [],
        DEFAULT_ANALYSIS_SETTINGS,
        "white",
        new Date("2026-09-01T08:00:00.000Z"),
      ),
    );
    saveAnalysis(
      save(
        "a1",
        ["e4", "e5"],
        [],
        DEFAULT_ANALYSIS_SETTINGS,
        "white",
        new Date("2026-09-07T10:00:00.000Z"),
      ),
    );

    expect(savedAnalysesSnapshot()[0].savedAt).toBe("2026-09-01T08:00:00.000Z");
    expect(savedAnalysesSnapshot()[0].updatedAt).toBe("2026-09-07T10:00:00.000Z");
  });

  it("does nothing at all when the record would be identical", () => {
    saveAnalysis(save("a1", ["e4"]));
    saveAnalysis(save("a2", ["d4"]));
    const before = savedAnalysesSnapshot();

    // What the screen's save effect does on mount: the same board, again.
    saveAnalysis(save("a1", ["e4"]));

    // Not merely equal — the *same array*, so nothing downstream re-renders and
    // the list is not re-ordered by an analysis nobody touched.
    expect(savedAnalysesSnapshot()).toBe(before);
    expect(savedAnalysesSnapshot().map((row) => row.id)).toEqual(["a2", "a1"]);
  });

  it("does write when only where the reader is standing changed", () => {
    saveAnalysis(save("a1", ["e4", "e5"]));

    saveAnalysis(save("a1", ["e4", "e5"], ["e4"]));

    expect(savedAnalysesSnapshot()[0].path).toEqual(["e4"]);
  });

  it("does write when only the orientation or the settings changed", () => {
    saveAnalysis(save("a1", ["e4"]));

    saveAnalysis(save("a1", ["e4"], [], DEFAULT_ANALYSIS_SETTINGS, "black"));
    expect(savedAnalysesSnapshot()[0].orientation).toBe("black");

    saveAnalysis(
      save("a1", ["e4"], [], { depth: 24, multiPv: 5, moveTimeMs: 0 }, "black"),
    );
    expect(savedAnalysesSnapshot()[0].settings.depth).toBe(24);
  });

  it("keeps at most MAX_SAVED_ANALYSES, dropping the oldest", () => {
    for (let index = 0; index <= MAX_SAVED_ANALYSES; index += 1) {
      saveAnalysis(save(`a${index}`, ["e4"]));
    }

    const ids = savedAnalysesSnapshot().map((row) => row.id);
    expect(ids).toHaveLength(MAX_SAVED_ANALYSES);
    expect(ids[0]).toBe(`a${MAX_SAVED_ANALYSES}`);
    expect(ids).not.toContain("a0");
  });

  it("forgets one analysis, and all of them", () => {
    saveAnalysis(save("a1", ["e4"]));
    saveAnalysis(save("a2", ["d4"]));

    removeSavedAnalysis("a1");
    expect(savedAnalysesSnapshot().map((row) => row.id)).toEqual(["a2"]);

    // An id that is not there is a no-op rather than an error.
    expect(removeSavedAnalysis("nope")).toBe(undefined);

    clearSavedAnalyses();
    expect(savedAnalysesSnapshot()).toEqual([]);
  });

  it("returns the same array until something changes", () => {
    saveAnalysis(save("a1", ["e4"]));

    expect(savedAnalysesSnapshot()).toBe(savedAnalysesSnapshot());

    const before = savedAnalysesSnapshot();
    saveAnalysis(save("a2", ["d4"]));
    expect(savedAnalysesSnapshot()).not.toBe(before);
  });

  it("tells its subscribers when one is saved, and stops when they leave", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSavedAnalyses(listener);

    saveAnalysis(save("a1", ["e4"]));
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    saveAnalysis(save("a2", ["d4"]));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("is a separate store from the saved games, sharing no key", () => {
    expect(SAVED_ANALYSES_STORAGE_KEY).not.toBe("chessapp.savedGames.v1");
  });
});

describe("the saved-analyses store — when storage will not co-operate", () => {
  it("reads an empty list rather than throwing on a corrupt entry", () => {
    localStorage.setItem(SAVED_ANALYSES_STORAGE_KEY, "{ not json");
    localStorage.setItem(`${SAVED_ANALYSES_STORAGE_KEY}.rev`, "1");

    expect(savedAnalysesSnapshot()).toEqual([]);
  });

  it("drops a row that is not a saved analysis and keeps the rest", () => {
    localStorage.setItem(
      SAVED_ANALYSES_STORAGE_KEY,
      JSON.stringify([{ nonsense: true }, save("a1", ["e4"])]),
    );
    localStorage.setItem(`${SAVED_ANALYSES_STORAGE_KEY}.rev`, "2");

    expect(savedAnalysesSnapshot().map((row) => row.id)).toEqual(["a1"]);
  });

  it("reports a full quota instead of throwing out of the save", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    expect(saveAnalysis(save("a1", ["e4"]))).toBe("storage");
  });

  it("reads nothing rather than throwing when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });

    expect(savedAnalysesSnapshot()).toEqual([]);
  });
});

describe("the saved analyses as a `?game=` destination", () => {
  it("resolves a reference into Load PGN's hand-off", () => {
    saveAnalysis(save("a1", ["e4", "e5", "Nf3"]));

    const resolved = resolveGameReference("analysis/saved/a1");

    expect(resolved?.id).toBe("a1");
    expect(resolved?.game.moves.map((move) => move.san)).toEqual([
      "e4",
      "e5",
      "Nf3",
    ]);
  });

  it("ignores a reference to an analysis that has been deleted", () => {
    saveAnalysis(save("a1", ["e4"]));
    removeSavedAnalysis("a1");

    expect(resolveGameReference("analysis/saved/a1")).toBe(undefined);
  });

  it("rebuilds the catalog only when the analyses change", () => {
    saveAnalysis(save("a1", ["e4"]));

    expect(savedAnalysesCatalog()).toBe(savedAnalysesCatalog());

    const before = savedAnalysesCatalog();
    saveAnalysis(save("a2", ["d4"]));
    expect(savedAnalysesCatalog()).not.toBe(before);
  });

  it("carries a place in the tree that survives being read back", () => {
    saveAnalysis(save("a1", ["e4", "e5", "Nf3"], ["e4", "e5"]));

    const stored = findSavedAnalysis("a1")!;
    expect(stored.path).toEqual(["e4", "e5"]);
    expect(nodeAtSanPath(grownTree(["e4", "e5", "Nf3"]), stored.path)).not.toBeNull();
  });
});
