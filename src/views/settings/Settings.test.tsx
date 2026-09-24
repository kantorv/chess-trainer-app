import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { strFromU8, unzipSync } from "fflate";

import i18n from "../../i18n";
import { DEFAULT_ANALYSIS_SETTINGS } from "../../lib/analysisSettings";
import { indexedRowOf } from "../../lib/collectionIndex";
import type { ExportManifest } from "../../lib/dataExport";
import { DEFAULT_ENGINE_SETTINGS } from "../../lib/engineSettings";
import { addCollection, resetLibraryCollectionStore } from "../../lib/libraryCollectionStore";
import { createLibraryFolder } from "../../lib/libraryFolderStore";
import { downloadBinaryFile } from "../../lib/pgnExport";
import { savePlayedGame } from "../../lib/playedGameStore";
import { DEFAULT_REPERTOIRE_SETTINGS } from "../../lib/repertoireSettings";
import { saveAnalysis } from "../../lib/savedAnalysisStore";
import { createRepertoireFolder } from "../../lib/savedRepertoireFolderStore";
import { saveRepertoire } from "../../lib/savedRepertoireStore";
import { shippedCollections } from "../../lib/shippedCollections";
import AppThemeWithLang from "../../theme/AppThemeWithLang";
import { RightPanelOutlet, RightPanelProvider } from "../main/rightPanel";
import SettingsScreen from "./SettingsScreen";

/*
  The Settings section's Export tab (CTA-86). The stores are real — they write
  to the tests' fake-indexeddb, which `src/test/setup.ts` deletes between
  tests — and only the browser download is stubbed, so what it was handed can
  be unzipped and read.
*/
vi.mock("../../lib/pgnExport", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/pgnExport")>()),
  downloadBinaryFile: vi.fn(() => true),
}));

const download = vi.mocked(downloadBinaryFile);

const AT = "2026-09-01T00:00:00.000Z";
const pgn = (event: string) => `[Event "${event}"]\n[White "W"]\n[Black "B"]\n[Result "*"]\n\n1. e4 e5 *`;

const seed = async () => {
  await savePlayedGame({
    id: "g1",
    pgn: pgn("Played"),
    settings: DEFAULT_ENGINE_SETTINGS,
    path: [],
    savedAt: AT,
    updatedAt: AT,
  });
  for (const id of ["a1", "a2"]) {
    await saveAnalysis({
      id,
      pgn: pgn(`Analysis ${id}`),
      settings: DEFAULT_ANALYSIS_SETTINGS,
      path: [],
      orientation: "white",
      description: "",
      showArrows: true,
      name: id,
      folderId: null,
      savedAt: AT,
      updatedAt: AT,
    });
  }
  const folder = await createRepertoireFolder("Openings");
  for (const [id, folderId] of [["r1", folder?.id ?? null], ["r2", null], ["r3", null]] as const) {
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
  const games = [pgn("Mine 1"), pgn("Mine 2")];
  await addCollection("My games", games, games.map((game) => indexedRowOf(game)));
  // A collection filed two folders down in the Library (CTA-88).
  const club = await createLibraryFolder("Club", null);
  const blitz = await createLibraryFolder("Blitz", club?.id ?? null);
  await addCollection("Friday", [pgn("Friday")], [indexedRowOf(pgn("Friday"))], undefined, undefined, blitz?.id ?? null);
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

const box = (testId: string) => within(screen.getByTestId(testId)).getByRole("checkbox");
const count = (category: string) => screen.getByTestId(`settings-export-${category}-count`);

/** What the last download was handed, unzipped. */
const downloaded = () => {
  const [fileName, bytes] = download.mock.lastCall ?? [];
  const files = unzipSync(bytes as Uint8Array);
  const manifest = JSON.parse(strFromU8(files["manifest.json"])) as ExportManifest;
  return { fileName, files, manifest };
};

beforeEach(async () => {
  // The Library's store is its tests' to reset, not `src/test/setup.ts`'s.
  await resetLibraryCollectionStore();
  download.mockClear();
  download.mockImplementation(() => true);
  await i18n.changeLanguage("en");
});

describe("the Settings section", () => {
  it("lands on the Export tab from /settings and from an unknown tab", async () => {
    renderAt("/settings");
    expect(await screen.findByTestId("settings-tab-content-export")).toBeInTheDocument();
    expect(screen.getByTestId("settings-tab-export")).toHaveAttribute("aria-selected", "true");
  });

  it("names every tab by its own route", async () => {
    renderAt("/settings/nope");
    expect(await screen.findByTestId("settings-tab-export")).toHaveAttribute("href", "/settings/export");
    expect(screen.getByTestId("settings-tab-import")).toHaveAttribute("href", "/settings/import");
    expect(screen.getByTestId("settings-tab-storage")).toHaveAttribute("href", "/settings/storage");
  });
});

describe("the Export tab", () => {
  it("counts every category, the shipped collections only when their box is ticked", async () => {
    await seed();
    renderAt("/settings/export");

    await waitFor(() => expect(count("games")).toHaveTextContent("(1)"));
    await waitFor(() => expect(count("analyses")).toHaveTextContent("(2)"));
    await waitFor(() => expect(count("repertoires")).toHaveTextContent("(3)"));
    await waitFor(() => expect(count("collections")).toHaveTextContent("(2)"));

    await userEvent.click(box("settings-export-collections"));
    await userEvent.click(box("settings-export-shipped"));
    expect(count("collections")).toHaveTextContent(`(${2 + shippedCollections.length})`);
  });

  it("starts with nothing ticked and Export off; the shipped box waits on Collections", async () => {
    renderAt("/settings/export");
    const run = await screen.findByTestId("settings-export-run");
    for (const category of ["collections", "games", "analyses", "repertoires"]) {
      expect(box(`settings-export-${category}`)).not.toBeChecked();
    }
    expect(run).toBeDisabled();
    expect(box("settings-export-shipped")).toBeDisabled();

    await userEvent.click(box("settings-export-collections"));
    expect(box("settings-export-shipped")).toBeEnabled();
    expect(run).toBeEnabled();

    await userEvent.click(box("settings-export-collections"));
    expect(run).toBeDisabled();
  });

  it("downloads one zip of the ticked categories, with its manifest", async () => {
    await seed();
    renderAt("/settings/export");

    await userEvent.click(box("settings-export-games"));
    await userEvent.click(box("settings-export-repertoires"));
    await userEvent.click(box("settings-export-collections"));
    await userEvent.click(screen.getByTestId("settings-export-run"));

    expect(await screen.findByTestId("settings-export-done")).toHaveTextContent(/chessapp-export-\d{4}-\d{2}-\d{2}\.zip/);
    expect(download).toHaveBeenCalledTimes(1);

    const { fileName, files, manifest } = downloaded();
    expect(fileName).toMatch(/^chessapp-export-\d{4}-\d{2}-\d{2}\.zip$/);
    expect(Object.keys(files).sort()).toEqual([
      // The Library's folders are the directories.
      "collections/club/blitz/friday.pgn",
      "collections/my-games.pgn",
      "games.pgn",
      "manifest.json",
      "repertoires/openings.pgn",
      "repertoires/unfiled.pgn",
    ]);
    expect(manifest.categories).toEqual(["collections", "games", "repertoires"]);
    expect(manifest.appVersion).toBe(__APP_VERSION__);
    expect(manifest.includeShippedCollections).toBe(false);
    expect(manifest.folders.collections).toEqual([["Club"], ["Club", "Blitz"]]);
    const friday = manifest.files.find((file) => file.path === "collections/club/blitz/friday.pgn");
    expect(friday?.kind === "collection" && friday.collection.folderPath).toEqual(["Club", "Blitz"]);
    expect(strFromU8(files["games.pgn"])).toBe(`${pgn("Played")}\n`);
  });

  it("says so, and keeps the screen, when the browser refuses the download", async () => {
    download.mockImplementation(() => false);
    renderAt("/settings/export");
    await userEvent.click(await screen.findByRole("checkbox", { name: /Games/ }));
    await userEvent.click(screen.getByTestId("settings-export-run"));
    expect(await screen.findByTestId("settings-export-failed")).toBeInTheDocument();
    expect(screen.getByTestId("settings-export-run")).toBeEnabled();
  });
});
