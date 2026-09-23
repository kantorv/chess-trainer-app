import "@testing-library/jest-dom/vitest";
// jsdom has no IndexedDB, and every store of the reader's data is kept there
// (`.claude/rules/database.md`). An in-memory implementation of the real
// API, so the store's own code is what the tests run.
import "fake-indexeddb/auto";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// MUI's color-scheme provider reads `prefers-color-scheme`, which jsdom does not
// implement. Without this every render throws before a single assertion runs.
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

// jsdom ships no ResizeObserver, and `Layout` constructs one to keep the board
// square in sync with its container. A no-op stub is enough — the layout tests
// drive re-measurement through the `resize` event listener instead.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof globalThis.ResizeObserver;
}

/*
  The record stores are imported here lazily, at teardown, not at the top of
  this file: a setup file's static imports load before a test file's
  `vi.mock`s apply, and the played games reach `lib/pieceMask.ts`, which would
  then hold the real `react-chessboard` rather than the test's stand-in. By
  teardown the test file has loaded them itself (with its mocks), so these are
  cache hits.
*/
const recordStores = async () => {
  const [played, analyses, analysisFolders, analysisDb, repertoires, repertoireFolders, repertoireDb, libraryFolders] =
    await Promise.all([
      import("../lib/playedGameStore"),
      import("../lib/savedAnalysisStore"),
      import("../lib/savedAnalysisFolderStore"),
      import("../lib/savedAnalysisDb"),
      import("../lib/savedRepertoireStore"),
      import("../lib/savedRepertoireFolderStore"),
      import("../lib/savedRepertoireDb"),
      import("../lib/libraryFolderStore"),
    ]);
  return {
    settled: [
      analyses.settledSavedAnalyses,
      analysisFolders.settledAnalysisFolders,
      played.settledPlayedGames,
      repertoires.settledSavedRepertoires,
      repertoireFolders.settledRepertoireFolders,
      libraryFolders.settledLibraryFolders,
    ],
    reset: [
      analyses.resetSavedAnalysisStore,
      analysisFolders.resetAnalysisFolderStore,
      played.resetPlayedGameStore,
      repertoires.resetSavedRepertoireStore,
      repertoireFolders.resetRepertoireFolderStore,
      libraryFolders.resetLibraryFolderStore,
    ],
    remove: [analysisDb.deleteAnalysisDb, played.deleteEngineDb, repertoireDb.deleteRepertoireDb],
  };
};

afterEach(async () => {
  cleanup();
  localStorage.clear();
  // Every record store is IndexedDB's: what each store kept, and the
  // databases themselves, go as `localStorage` does. (The Library's
  // database is deleted by the tests that use it — `resetLibraryCollectionStore`;
  // its folder store is forgotten here with the others.) First
  // the writes a screen left in flight land, twice over — a folder's delete
  // queues its records' unfiling behind it — so none reaches the next test.
  const stores = await recordStores();
  for (let round = 0; round < 2; round += 1) {
    await Promise.all(stores.settled.map((settled) => settled()));
  }
  for (const reset of stores.reset) reset();
  await Promise.all(stores.remove.map((remove) => remove()));
});
