import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";

import i18n from "../../i18n";
import { DEFAULT_ANALYSIS_SETTINGS } from "../../lib/analysisSettings";
import { indexedRowOf } from "../../lib/collectionIndex";
import {
  addCollection,
  loadUploadedCollections,
  resetLibraryCollectionStore,
} from "../../lib/libraryCollectionStore";
import { createLibraryFolder, loadLibraryFolders } from "../../lib/libraryFolderStore";
import { loadPlayedGames, savePlayedGame } from "../../lib/playedGameStore";
import { DEFAULT_REPERTOIRE_SETTINGS } from "../../lib/repertoireSettings";
import {
  createAnalysisFolder,
  loadAnalysisFolders,
} from "../../lib/savedAnalysisFolderStore";
import { loadSavedAnalyses, saveAnalysis } from "../../lib/savedAnalysisStore";
import {
  createRepertoireFolder,
  loadRepertoireFolders,
} from "../../lib/savedRepertoireFolderStore";
import { loadSavedRepertoires, saveRepertoire } from "../../lib/savedRepertoireStore";
import {
  estimatedGamePgnBytes,
  estimatedPayloadBytes,
  formatBytes,
} from "../../lib/storageDiagnostics";
import { DEFAULT_ENGINE_SETTINGS } from "../../lib/engineSettings";
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

/** Every category, once each: a played game, two analyses (one filed), three
 * repertoires (one filed), two collections (three games), two Library folders. */
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
    expect(screen.getByText("Quota (estimate)")).toBeInTheDocument();
    expect(await screen.findByTestId("settings-storage-usage")).toHaveTextContent(formatBytes(25_000_000));
    expect(screen.getByTestId("settings-storage-indexeddb")).toHaveTextContent(formatBytes(23_000_000));
    expect(screen.getByTestId("settings-storage-quota")).toHaveTextContent(formatBytes(2_000_000_000));
  });

  it("reads a portion the browser does not report as not available, never as zero", async () => {
    stubEstimate({ usage: 1000, quota: 2048 });
    renderAt("/settings/storage");

    expect(await screen.findByTestId("settings-storage-indexeddb")).toHaveTextContent("Not available");
    expect(screen.getByTestId("settings-storage-usage")).toHaveTextContent("1000 B");
    expect(screen.getByTestId("settings-storage-quota")).toHaveTextContent("2.0 KB");
  });

  it("says nothing is available where the browser has no Storage API", async () => {
    stubEstimate(undefined);
    renderAt("/settings/storage");

    expect(await screen.findByTestId("settings-storage-usage")).toHaveTextContent("Not available");
    expect(screen.getByTestId("settings-storage-indexeddb")).toHaveTextContent("Not available");
    expect(screen.getByTestId("settings-storage-quota")).toHaveTextContent("Not available");
  });

  it("counts and sizes every category over the real stores", async () => {
    const gamesRows = await seed();
    renderAt("/settings/storage");

    await landed("playedGames", "1");
    await landed("analyses", "2");
    await landed("analysisFolders", "1");
    await landed("repertoires", "3");
    await landed("repertoireFolders", "1");
    await landed("collections", "2");
    await landed("collectionGames", "3");
    await landed("libraryFolders", "2");
    // The shipped collections are fetched over the network, not stored: the
    // reader's two uploads are all the collections row counts.

    // What the stores hold, measured by the same helpers the tab shows.
    const [played, analyses, analysisFolders, repertoires, repertoireFolders, libraryFolders, collections] =
      await Promise.all([
        loadPlayedGames(),
        loadSavedAnalyses(),
        loadAnalysisFolders(),
        loadSavedRepertoires(),
        loadRepertoireFolders(),
        loadLibraryFolders(),
        loadUploadedCollections(),
      ]);
    const payload = (rows: readonly unknown[]) =>
      formatBytes(rows.reduce<number>((total, row) => total + estimatedPayloadBytes(row), 0));

    expect(screen.getByTestId("settings-storage-playedGames-payload")).toHaveTextContent(payload(played));
    expect(screen.getByTestId("settings-storage-analyses-payload")).toHaveTextContent(payload(analyses));
    expect(screen.getByTestId("settings-storage-analysisFolders-payload")).toHaveTextContent(payload(analysisFolders));
    expect(screen.getByTestId("settings-storage-repertoires-payload")).toHaveTextContent(payload(repertoires));
    expect(screen.getByTestId("settings-storage-repertoireFolders-payload")).toHaveTextContent(
      payload(repertoireFolders),
    );
    expect(screen.getByTestId("settings-storage-collections-payload")).toHaveTextContent(payload(collections));
    expect(screen.getByTestId("settings-storage-libraryFolders-payload")).toHaveTextContent(payload(libraryFolders));

    // The Library's games are estimated from their index rows, never read.
    const gamesPayload = formatBytes(gamesRows.reduce((total, row) => total + estimatedGamePgnBytes(row), 0));
    await waitFor(() =>
      expect(screen.getByTestId("settings-storage-collectionGames-payload")).toHaveTextContent(gamesPayload),
    );
  });

  it("labels the sizes as estimated payloads, never as disk usage", async () => {
    renderAt("/settings/storage");

    expect(await screen.findByText("Estimated payload")).toBeInTheDocument();
    expect(screen.getByText(/not disk usage/)).toBeInTheDocument();
  });
});
