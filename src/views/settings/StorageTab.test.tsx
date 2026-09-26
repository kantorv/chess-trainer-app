import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";

import i18n from "../../i18n";
import { DEFAULT_ANALYSIS_SETTINGS } from "../../lib/analysisSettings";
import { indexedRowOf } from "../../lib/collectionIndex";
import { DEFAULT_ENGINE_SETTINGS } from "../../lib/engineSettings";
import {
  addCollection,
  resetLibraryCollectionStore,
} from "../../lib/libraryCollectionStore";
import { createLibraryFolder } from "../../lib/libraryFolderStore";
import { loadPlayedGames, savePlayedGame } from "../../lib/playedGameStore";
import { DEFAULT_REPERTOIRE_SETTINGS } from "../../lib/repertoireSettings";
import { createAnalysisFolder } from "../../lib/savedAnalysisFolderStore";
import { loadSavedAnalyses, saveAnalysis } from "../../lib/savedAnalysisStore";
import { createRepertoireFolder } from "../../lib/savedRepertoireFolderStore";
import { loadSavedRepertoires, saveRepertoire } from "../../lib/savedRepertoireStore";
import {
  estimatedGamePgnBytes,
  estimatedPayloadBytes,
  formatBytes,
} from "../../lib/storageDiagnostics";
import AppThemeWithLang from "../../theme/AppThemeWithLang";
import { RightPanelOutlet, RightPanelProvider } from "../main/rightPanel";
import SettingsScreen from "./SettingsScreen";

/*
  Settings' Storage tab (CTA-94), over the real stores — fake-indexeddb, which
  `src/test/setup.ts` deletes between tests (the Library's is reset here).
  jsdom has no `navigator.storage`, so every test stubs what it wants the
  browser to say, including nothing at all.
*/

const AT = "2026-09-01T00:00:00.000Z";
const pgn = (event: string) => `[Event "${event}"]\n[White "W"]\n[Black "B"]\n[Result "*"]\n\n1. e4 e5 *`;

/** Give the browser's Storage API a voice: what `estimate()` says, or nothing at all. */
const stubEstimate = (estimate?: Record<string, unknown>) => {
  Object.defineProperty(window.navigator, "storage", {
    configurable: true,
    get: () => (estimate === undefined ? undefined : { estimate: async () => estimate }),
  });
};

/**
 * A seeded app: a played game, two analyses (one in a folder), three
 * repertoires (one in a folder), two collections (three games), and two
 * Library folders — the folders and summaries are seeded too, so the tests
 * can assert the table counts just the heavy stores.
 */
const seed = async () => {
  await savePlayedGame({
    id: "g1",
    pgn: pgn("Played"),
    settings: DEFAULT_ENGINE_SETTINGS,
    path: [],
    savedAt: AT,
    updatedAt: AT,
  });
  const analysisFolder = await createAnalysisFolder("Openings", null);
  for (const [id, folderId] of [["a1", analysisFolder?.id ?? null], ["a2", null]] as const) {
    await saveAnalysis({
      id,
      pgn: pgn(`Analysis ${id}`),
      settings: DEFAULT_ANALYSIS_SETTINGS,
      path: [],
      orientation: "white",
      description: "",
      showArrows: true,
      arrowWidthSource: "none",
      arrowPalette: "classic",
      name: id,
      folderId,
      savedAt: AT,
      updatedAt: AT,
    });
  }
  const repertoireFolder = await createRepertoireFolder("Lines");
  for (const [id, folderId] of [["r1", repertoireFolder?.id ?? null], ["r2", null], ["r3", null]] as const) {
    await saveRepertoire({
      id,
      name: id,
      pgn: pgn(`Rep ${id}`),
      previewFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      settings: DEFAULT_REPERTOIRE_SETTINGS,
      folderId,
      savedAt: AT,
      updatedAt: AT,
    });
  }
  const mine = [pgn("Mine 1"), pgn("Mine 2")];
  const mineRows = mine.map((game) => indexedRowOf(game));
  await addCollection("My games", mine, mineRows);
  const friday = [pgn("Friday")];
  const fridayRows = friday.map((game) => indexedRowOf(game));
  await addCollection("Friday", friday, fridayRows);
  const club = await createLibraryFolder("Club", null);
  await createLibraryFolder("Blitz", club?.id ?? null);
  return [...mineRows, ...fridayRows];
};

const renderAt = (path: string) =>
  render(
    <AppThemeWithLang>
      <MemoryRouter initialEntries={[path]}>
        <RightPanelProvider>
          <Routes>
            <Route path="/settings" element={<SettingsScreen />} />
            <Route path="/settings/:tab" element={<SettingsScreen />} />
          </Routes>
          <RightPanelOutlet />
        </RightPanelProvider>
      </MemoryRouter>
    </AppThemeWithLang>,
  );

/** One category's cells, once its store has landed. */
const landed = async (id: string, records: string) => {
  await waitFor(() => expect(screen.getByTestId(`settings-storage-${id}-records`)).toHaveTextContent(records));
};

/**
 * A browser figure, once the estimate has landed — the cell is there from the
 * first render, showing "…", so waiting for the cell alone races the estimate.
 */
const browserSaid = async (testId: string, text: string) => {
  await waitFor(() => expect(screen.getByTestId(testId)).toHaveTextContent(text));
};

beforeEach(async () => {
  await resetLibraryCollectionStore();
  stubEstimate({ usage: 25_000_000, quota: 2_000_000_000, usageDetails: { indexedDB: 23_000_000 } });
  await i18n.changeLanguage("en");
});

afterEach(() => {
  delete (window.navigator as { storage?: unknown }).storage;
});

describe("the Storage tab", () => {
  it("shows the browser's own estimates, every one marked as such", async () => {
    renderAt("/settings/storage");

    expect(await screen.findByText("Origin usage (estimate)")).toBeInTheDocument();
    expect(screen.getByText("IndexedDB usage (estimate)")).toBeInTheDocument();
    await browserSaid("settings-storage-usage", formatBytes(25_000_000));
    expect(screen.getByTestId("settings-storage-indexeddb")).toHaveTextContent(formatBytes(23_000_000));
    // The quota is the developer tools' business, said beside the numbers.
    expect(screen.getByText(/developer tools/)).toBeInTheDocument();
    expect(screen.queryByTestId("settings-storage-quota")).toBeNull();
  });

  it("reads a portion the browser does not report as not available, never as zero", async () => {
    stubEstimate({ usage: 1000 });
    renderAt("/settings/storage");

    await browserSaid("settings-storage-indexeddb", "Not available");
    expect(screen.getByTestId("settings-storage-usage")).toHaveTextContent("1000 B");
  });

  it("says nothing is available where the browser has no Storage API", async () => {
    stubEstimate(undefined);
    renderAt("/settings/storage");

    await browserSaid("settings-storage-usage", "Not available");
    expect(screen.getByTestId("settings-storage-indexeddb")).toHaveTextContent("Not available");
  });

  it("counts and sizes the four sections over the real stores", async () => {
    const gamesRows = await seed();
    renderAt("/settings/storage");

    await landed("playedGames", "1");
    await landed("analyses", "2");
    await landed("repertoires", "3");
    await landed("collectionGames", "3");

    // The folders and the collections' summaries are seeded, and the shipped
    // collections are files fetched over the network: the table counts just
    // the heavy stores, so none of them is listed.
    expect(screen.queryByTestId("settings-storage-analysisFolders-records")).toBeNull();
    expect(screen.queryByTestId("settings-storage-repertoireFolders-records")).toBeNull();
    expect(screen.queryByTestId("settings-storage-libraryFolders-records")).toBeNull();
    expect(screen.queryByTestId("settings-storage-collections-records")).toBeNull();

    const [played, analyses, repertoires] = await Promise.all([
      loadPlayedGames(),
      loadSavedAnalyses(),
      loadSavedRepertoires(),
    ]);
    const payload = (rows: readonly unknown[]) =>
      formatBytes(rows.reduce<number>((total, row) => total + estimatedPayloadBytes(row), 0));

    expect(screen.getByTestId("settings-storage-playedGames-payload")).toHaveTextContent(payload(played));
    expect(screen.getByTestId("settings-storage-analyses-payload")).toHaveTextContent(payload(analyses));
    expect(screen.getByTestId("settings-storage-repertoires-payload")).toHaveTextContent(payload(repertoires));

    // The Library's games are estimated from their index rows, never read.
    const gamesPayload = formatBytes(gamesRows.reduce((total, row) => total + estimatedGamePgnBytes(row), 0));
    await waitFor(() =>
      expect(screen.getByTestId("settings-storage-collectionGames-payload")).toHaveTextContent(gamesPayload),
    );
  });

  it("separates the four sections with a bolder line", async () => {
    await seed();
    renderAt("/settings/storage");

    await landed("collectionGames", "3");
    for (const id of ["playedGames", "analyses", "repertoires"]) {
      expect(screen.getByTestId(`settings-storage-${id}-records`)).toHaveStyle({ borderBottomWidth: "2px" });
    }
    // The last row closes the table, not a section. (MUI's default 1px
    // border hides behind a CSS variable jsdom's parser drops —
    // `chessboard.md` §8 — so the absence of the separator is what is
    // asserted, not the default's width.)
    expect(screen.getByTestId("settings-storage-collectionGames-records")).not.toHaveStyle({
      borderBottomWidth: "2px",
    });
  });

  it("labels the sizes as estimated payloads, never as disk usage", async () => {
    renderAt("/settings/storage");

    expect(await screen.findByText("Estimated payload")).toBeInTheDocument();
    expect(screen.getByText(/not disk usage/)).toBeInTheDocument();
  });
});
