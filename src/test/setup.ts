import "@testing-library/jest-dom/vitest";
// jsdom has no IndexedDB, and the Library keeps its uploads there
// (`lib/libraryCollectionStore.ts`), as the saved analyses keep theirs
// (`lib/savedAnalysisStore.ts`). An in-memory implementation of the real
// API, so the store's own code is what the tests run.
import "fake-indexeddb/auto";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

import { deleteAnalysisDb } from "../lib/savedAnalysisDb";
import { resetAnalysisFolderStore } from "../lib/savedAnalysisFolderStore";
import { resetSavedAnalysisStore } from "../lib/savedAnalysisStore";

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

afterEach(async () => {
  cleanup();
  localStorage.clear();
  // The saved analyses and their folders are IndexedDB's since CTA-77: what
  // each store kept, and the database itself, go as `localStorage` does.
  resetSavedAnalysisStore();
  resetAnalysisFolderStore();
  await deleteAnalysisDb();
});
