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
  addAnalyses,
  clearSavedAnalyses,
  fileSavedAnalysis,
  removeSavedAnalyses,
  renameSavedAnalysis,
  unfileAnalysesIn,
  updateSavedAnalysisSettings,
  findSavedAnalysis,
  findSavedAnalysisGame,
  MAX_SAVED_ANALYSES,
  removeSavedAnalysis,
  saveAnalysis,
  loadSavedAnalyses,
  resetSavedAnalysisStore,
  savedAnalysesSnapshot,
  subscribeSavedAnalyses,
} from "./savedAnalysisStore";

/*
  The store is IndexedDB since CTA-77. `src/test/setup.ts` forgets what the
  store kept and deletes the database between tests, so each test below
  starts from an empty list. `resetSavedAnalysisStore()` inside a test is a
  reload: the kept list forgotten, the next read goes back to the database.
*/

/** The kept list, read first if it has not been. */
const listed = async (): Promise<readonly SavedAnalysis[]> => loadSavedAnalyses();
const ids = async () => (await listed()).map((row) => row.id);

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
  it("is undefined until read, then starts empty and keeps what is written", async () => {
    expect(savedAnalysesSnapshot()).toBeUndefined();
    expect(await listed()).toEqual([]);

    expect(await saveAnalysis(save("a1", ["e4", "e5"]))).toBe(undefined);

    expect(await ids()).toEqual(["a1"]);
    expect(findSavedAnalysis("a1")?.settings).toEqual(DEFAULT_ANALYSIS_SETTINGS);
  });

  it("survives a reload — the analyses are read back out of IndexedDB, in order", async () => {
    await saveAnalysis(save("a1", ["e4"]));
    await saveAnalysis(save("a2", ["d4"]));
    await fileSavedAnalysis("a1", "f");

    resetSavedAnalysisStore();
    expect(savedAnalysesSnapshot()).toBeUndefined();
    expect(await ids()).toEqual(["a2", "a1"]);
    expect(findSavedAnalysis("a1")?.pgn).toContain("1. e4");
    expect(findSavedAnalysis("a1")?.folderId).toBe("f");
    // Nothing is written to localStorage.
    expect(localStorage.length).toBe(0);
  });

  it("replaces an analysis in place, so saving on every move is one row", async () => {
    await saveAnalysis(save("a1", ["e4"]));
    await saveAnalysis(save("a1", ["e4", "e5"]));
    await saveAnalysis(save("a1", ["e4", "e5", "Nf3"]));

    expect(await listed()).toHaveLength(1);
    expect((await listed())[0].pgn).toContain("Nf3");
  });

  it("lists them newest first, and moves one worked on back to the top", async () => {
    await saveAnalysis(save("a1", ["e4"]));
    await saveAnalysis(save("a2", ["d4"]));
    expect(await ids()).toEqual(["a2", "a1"]);

    await saveAnalysis(save("a1", ["e4", "e5"]));
    expect(await ids()).toEqual(["a1", "a2"]);
    resetSavedAnalysisStore();
    expect(await ids()).toEqual(["a1", "a2"]);
  });

  it("keeps the date an analysis was begun when it is worked on", async () => {
    await saveAnalysis(
      save("a1", ["e4"], [], DEFAULT_ANALYSIS_SETTINGS, "white", new Date("2026-09-01T08:00:00.000Z")),
    );
    await saveAnalysis(
      save("a1", ["e4", "e5"], [], DEFAULT_ANALYSIS_SETTINGS, "white", new Date("2026-09-07T10:00:00.000Z")),
    );

    expect((await listed())[0].savedAt).toBe("2026-09-01T08:00:00.000Z");
    expect((await listed())[0].updatedAt).toBe("2026-09-07T10:00:00.000Z");
  });

  it("does nothing at all when the record would be identical", async () => {
    await saveAnalysis(save("a1", ["e4"]));
    await saveAnalysis(save("a2", ["d4"]));
    const before = savedAnalysesSnapshot();

    await saveAnalysis(save("a1", ["e4"]));

    // Not merely equal — the *same array*, so nothing downstream re-renders and
    // the list is not re-ordered by an analysis nobody touched.
    expect(savedAnalysesSnapshot()).toBe(before);
    expect(await ids()).toEqual(["a2", "a1"]);
  });

  it("does write when only where the reader is standing changed", async () => {
    await saveAnalysis(save("a1", ["e4", "e5"]));
    await saveAnalysis(save("a1", ["e4", "e5"], ["e4"]));
    expect((await listed())[0].path).toEqual(["e4"]);
  });

  it("does write when only the orientation or the settings changed", async () => {
    await saveAnalysis(save("a1", ["e4"]));

    await saveAnalysis(save("a1", ["e4"], [], DEFAULT_ANALYSIS_SETTINGS, "black"));
    expect((await listed())[0].orientation).toBe("black");

    await saveAnalysis(save("a1", ["e4"], [], { depth: 24, multiPv: 5, moveTimeMs: 0 }, "black"));
    expect((await listed())[0].settings.depth).toBe(24);
  });

  it("keeps at most MAX_SAVED_ANALYSES, dropping the oldest", async () => {
    const record = save("a0", ["e4"]);
    await addAnalyses(
      Array.from({ length: MAX_SAVED_ANALYSES }, (_, index) => ({
        ...record,
        id: `a${MAX_SAVED_ANALYSES - 1 - index}`,
      })),
    );
    expect(await listed()).toHaveLength(MAX_SAVED_ANALYSES);

    await saveAnalysis({ ...record, id: "newest", name: "Newest" });

    const kept = await ids();
    expect(kept).toHaveLength(MAX_SAVED_ANALYSES);
    expect(kept[0]).toBe("newest");
    expect(kept).not.toContain("a0");
  }, 60_000);

  it("forgets one analysis, and all of them", async () => {
    await saveAnalysis(save("a1", ["e4"]));
    await saveAnalysis(save("a2", ["d4"]));

    await removeSavedAnalysis("a1");
    expect(await ids()).toEqual(["a2"]);

    // An id that is not there is a no-op rather than an error.
    expect(await removeSavedAnalysis("nope")).toBe(undefined);

    await clearSavedAnalyses();
    expect(await listed()).toEqual([]);
    resetSavedAnalysisStore();
    expect(await listed()).toEqual([]);
  });

  it("returns the same array until something changes", async () => {
    await saveAnalysis(save("a1", ["e4"]));

    expect(savedAnalysesSnapshot()).toBe(savedAnalysesSnapshot());

    const before = savedAnalysesSnapshot();
    await saveAnalysis(save("a2", ["d4"]));
    expect(savedAnalysesSnapshot()).not.toBe(before);
  });

  it("reads on the first subscribe, tells its subscribers of a write, and stops when they leave", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSavedAnalyses(listener);
    await vi.waitFor(() => expect(savedAnalysesSnapshot()).toEqual([]));
    expect(listener).toHaveBeenCalledTimes(1);

    await saveAnalysis(save("a1", ["e4"]));
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    await saveAnalysis(save("a2", ["d4"]));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("runs writes in order, each seeing the one before", async () => {
    const writes = [
      saveAnalysis(save("a1", ["e4"])),
      saveAnalysis(save("a2", ["d4"])),
      fileSavedAnalysis("a1", "f"),
      removeSavedAnalysis("a2"),
    ];
    expect(await Promise.all(writes)).toEqual([undefined, undefined, undefined, undefined]);
    expect(await ids()).toEqual(["a1"]);
    expect(findSavedAnalysis("a1")?.folderId).toBe("f");
  });
});

describe("the saved-analyses store — when storage will not co-operate", () => {
  it("reports a full quota instead of throwing out of the save, and keeps the list as it was", async () => {
    await saveAnalysis(save("a1", ["e4"]));
    const before = savedAnalysesSnapshot();
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });

    expect(await saveAnalysis(save("a2", ["d4"]))).toBe("storage");
    expect(await addAnalyses([save("a3", ["c4"])])).toBe("storage");
    expect(savedAnalysesSnapshot()).toBe(before);
  });

  it("reads nothing, and reports every write, when IndexedDB is unavailable", async () => {
    vi.spyOn(indexedDB, "open").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });

    expect(await listed()).toEqual([]);
    expect(await saveAnalysis(save("a1", ["e4"]))).toBe("storage");
  });
});

describe("the saved analyses as a `?game=` destination", () => {
  it("resolves a reference, as the Analysis Board's hand-off does", async () => {
    await saveAnalysis(save("a1", ["e4", "e5", "Nf3"]));

    const resolved = resolveGameReference("analysis/saved/a1");

    expect(resolved?.id).toBe("a1");
    expect(resolved?.game.moves.map((move) => move.san)).toEqual(["e4", "e5", "Nf3"]);
  });

  it("ignores a reference to an analysis that has been deleted", async () => {
    await saveAnalysis(save("a1", ["e4"]));
    await removeSavedAnalysis("a1");

    expect(resolveGameReference("analysis/saved/a1")).toBe(undefined);
  });

  it("parses the record named once, and again only when it changes", async () => {
    await saveAnalysis(save("a1", ["e4"]));

    const first = findSavedAnalysisGame(["saved", "a1"]);
    expect(findSavedAnalysisGame(["saved", "a1"])).toBe(first);

    await saveAnalysis(save("a1", ["e4", "e5"]));
    expect(findSavedAnalysisGame(["saved", "a1"])).not.toBe(first);
    expect(findSavedAnalysisGame(["elsewhere", "a1"])).toBeUndefined();
  });

  it("carries a place in the tree that survives being read back", async () => {
    await saveAnalysis(save("a1", ["e4", "e5", "Nf3"], ["e4", "e5"]));
    resetSavedAnalysisStore();
    await listed();

    const stored = findSavedAnalysis("a1")!;
    expect(stored.path).toEqual(["e4", "e5"]);
    expect(nodeAtSanPath(grownTree(["e4", "e5", "Nf3"]), stored.path)).not.toBeNull();
  });
});

describe("the saved-analyses store, saved explicitly (CTA-73)", () => {
  it("keeps several at once, and refuses a batch past the cap without writing any", async () => {
    expect(await addAnalyses([save("s1", ["e4"]), save("s2", ["d4"])])).toBe(undefined);
    expect(await ids()).toEqual(["s1", "s2"]);

    const record = save("x", ["c4"]);
    const tooMany = Array.from({ length: MAX_SAVED_ANALYSES - 1 }, (_, index) => ({
      ...record,
      id: `x${index}`,
    }));
    expect(await addAnalyses(tooMany)).toBe("too-many");
    expect(await listed()).toHaveLength(2);
  });

  it("files, renames and unfiles in place, keeping the list's order", async () => {
    await saveAnalysis(save("old", ["e4"]));
    await saveAnalysis(save("new", ["d4"]));
    expect(await ids()).toEqual(["new", "old"]);

    await fileSavedAnalysis("old", "folder-1");
    await renameSavedAnalysis("old", "  My Sicilian  ");
    expect(await ids()).toEqual(["new", "old"]);
    expect(findSavedAnalysis("old")).toMatchObject({ folderId: "folder-1", name: "My Sicilian" });

    await unfileAnalysesIn("folder-1");
    expect(findSavedAnalysis("old")?.folderId).toBeNull();
    resetSavedAnalysisStore();
    expect(await ids()).toEqual(["new", "old"]);
  });

  it("treats a name or folder change as a change, and the same record as none", async () => {
    const record = save("a", ["e4"]);
    await saveAnalysis(record);
    const first = savedAnalysesSnapshot();
    await saveAnalysis({ ...record });
    expect(savedAnalysesSnapshot()).toBe(first);
    await saveAnalysis({ ...record, name: "Renamed" });
    expect(findSavedAnalysis("a")?.name).toBe("Renamed");
  });

  it("forgets several at once", async () => {
    await addAnalyses([save("a", ["e4"]), save("b", ["d4"]), save("c", ["c4"])]);
    await removeSavedAnalyses(["a", "c"]);
    expect(await ids()).toEqual(["b"]);
  });
});

describe("a saved analysis' settings (CTA-73)", () => {
  it("reads an older record with no description, arrows on", async () => {
    await saveAnalysis(save("a", ["e4"]));
    expect(findSavedAnalysis("a")).toMatchObject({ description: "", showArrows: true });
  });

  it("writes every setting at once, in place, trimmed", async () => {
    await saveAnalysis(save("old", ["e4"]));
    await saveAnalysis(save("new", ["d4"]));
    await updateSavedAnalysisSettings("old", {
      name: "  Scotch  ",
      description: "  Main line only. ",
      orientation: "black",
      showArrows: false,
      folderId: "f1",
    });
    expect(await ids()).toEqual(["new", "old"]);
    expect(findSavedAnalysis("old")).toMatchObject({
      name: "Scotch",
      description: "Main line only.",
      orientation: "black",
      showArrows: false,
      folderId: "f1",
    });
  });

  it("writes nothing when nothing changed", async () => {
    const record = save("a", ["e4"]);
    await saveAnalysis(record);
    const before = savedAnalysesSnapshot();
    await updateSavedAnalysisSettings("a", {
      name: record.name,
      description: "",
      orientation: "white",
      showArrows: true,
      folderId: null,
    });
    expect(savedAnalysesSnapshot()).toBe(before);
  });
});
