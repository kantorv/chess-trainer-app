import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { strToU8, zipSync } from "fflate";

import i18n from "../../i18n";
import { DEFAULT_ANALYSIS_SETTINGS } from "../../lib/analysisSettings";
import { indexedRowOf } from "../../lib/collectionIndex";
import { buildExport, zipExport, type ExportSource } from "../../lib/dataExport";
import { exportZip } from "../../lib/dataExportSource";
import { DEFAULT_ENGINE_SETTINGS } from "../../lib/engineSettings";
import {
  addCollection,
  loadUploadedCollections,
  loadUploadedGames,
  resetLibraryCollectionStore,
} from "../../lib/libraryCollectionStore";
import {
  createLibraryFolder,
  loadLibraryFolders,
  resetLibraryFolderStore,
  settledLibraryFolders,
} from "../../lib/libraryFolderStore";
import {
  deleteEngineDb,
  importPlayedGames,
  loadPlayedGames,
  MAX_PLAYED_GAMES,
  playedGamesSnapshot,
  resetPlayedGameStore,
  savePlayedGame,
  settledPlayedGames,
} from "../../lib/playedGameStore";
import type { PlayedGame } from "../../lib/playedGames";
import { DEFAULT_REPERTOIRE_SETTINGS } from "../../lib/repertoireSettings";
import type { SavedAnalysis } from "../../lib/savedAnalyses";
import { deleteAnalysisDb } from "../../lib/savedAnalysisDb";
import {
  createAnalysisFolder,
  loadAnalysisFolders,
  resetAnalysisFolderStore,
  settledAnalysisFolders,
} from "../../lib/savedAnalysisFolderStore";
import {
  loadSavedAnalyses,
  resetSavedAnalysisStore,
  saveAnalysis,
  savedAnalysesSnapshot,
  settledSavedAnalyses,
} from "../../lib/savedAnalysisStore";
import { deleteRepertoireDb } from "../../lib/savedRepertoireDb";
import {
  addRepertoireFolders,
  createRepertoireFolder,
  loadRepertoireFolders,
  repertoireFoldersSnapshot,
  resetRepertoireFolderStore,
  settledRepertoireFolders,
} from "../../lib/savedRepertoireFolderStore";
import {
  loadSavedRepertoires,
  resetSavedRepertoireStore,
  saveRepertoire,
  savedRepertoiresSnapshot,
  settledSavedRepertoires,
} from "../../lib/savedRepertoireStore";
import type { SavedRepertoire } from "../../lib/savedRepertoires";
import AppThemeWithLang from "../../theme/AppThemeWithLang";
import { RightPanelOutlet, RightPanelProvider } from "../main/rightPanel";
import SettingsScreen from "./SettingsScreen";

/*
  Settings' Import tab (CTA-89), over the real stores — fake-indexeddb, which
  `src/test/setup.ts` deletes between tests (the Library's is reset here). A
  zip is the export's own: `exportZip` over what was seeded, or the pure
  builder for a dump no store could hold.
*/

const AT = "2026-09-01T00:00:00.000Z";
const pgn = (event: string) => `[Event "${event}"]\n[White "W"]\n[Black "B"]\n[Result "*"]\n\n1. e4 e5 *`;

const played = (id: string, updatedAt = AT): PlayedGame => ({
  id,
  pgn: pgn(`Played ${id}`),
  settings: DEFAULT_ENGINE_SETTINGS,
  path: ["e4"],
  savedAt: AT,
  updatedAt,
});

const analysis = (id: string, folderId: string | null): SavedAnalysis => ({
  id,
  pgn: pgn(`Analysis ${id}`),
  settings: DEFAULT_ANALYSIS_SETTINGS,
  path: ["e4"],
  orientation: "black",
  description: `notes on ${id}`,
  showArrows: false,
  arrowWidthSource: "none",
  arrowPalette: "classic",
  name: `Analysis ${id}`,
  folderId,
  savedAt: AT,
  updatedAt: AT,
});

const repertoire = (id: string, folderId: string | null, updatedAt = AT): SavedRepertoire => ({
  id,
  name: `Rep ${id}`,
  pgn: pgn(`Rep ${id}`),
  previewFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  stats: { moves: 1, variations: 0 },
  settings: DEFAULT_REPERTOIRE_SETTINGS,
  folderId,
  savedAt: AT,
  updatedAt,
});

/** Every category, nested folders and empty ones. */
const seed = async () => {
  await savePlayedGame(played("g1"));
  const openings = await createAnalysisFolder("Openings", null);
  const sicilian = await createAnalysisFolder("Sicilian", openings?.id ?? null);
  await createAnalysisFolder("Empty", null);
  await saveAnalysis(analysis("a1", null));
  await saveAnalysis(analysis("a2", sicilian?.id ?? null));
  const white = await createRepertoireFolder("White");
  await createRepertoireFolder("Unused");
  await saveRepertoire(repertoire("r1", white?.id ?? null));
  // Written later, so first in the list — and it comes back first although
  // its file (Unfiled) comes after White's in the zip.
  await saveRepertoire(repertoire("r2", null, "2026-09-02T00:00:00.000Z"));
  const club = await createLibraryFolder("Club", null);
  const blitz = await createLibraryFolder("Blitz", club?.id ?? null);
  await createLibraryFolder("Nothing yet", null);
  const games = [pgn("Friday 1"), pgn("Friday 2")];
  await addCollection("Friday", games, games.map((game) => indexedRowOf(game)), undefined, undefined, blitz?.id ?? null);
};

/** A whole app's data gone — the other browser the zip is carried to. */
const wipe = async () => {
  await Promise.all([
    settledPlayedGames(),
    settledSavedAnalyses(),
    settledAnalysisFolders(),
    settledSavedRepertoires(),
    settledRepertoireFolders(),
    settledLibraryFolders(),
  ]);
  for (const reset of [
    resetPlayedGameStore,
    resetSavedAnalysisStore,
    resetAnalysisFolderStore,
    resetSavedRepertoireStore,
    resetRepertoireFolderStore,
    resetLibraryFolderStore,
  ]) {
    reset();
  }
  await Promise.all([deleteEngineDb(), deleteAnalysisDb(), deleteRepertoireDb(), resetLibraryCollectionStore()]);
};

/** Everything the app holds, each folder by its path — what a round trip must give back. */
const everything = async () => {
  const [games, analyses, analysisFolders, repertoires, repertoireFolders, collections, libraryFolders] =
    await Promise.all([
      loadPlayedGames(),
      loadSavedAnalyses(),
      loadAnalysisFolders(),
      loadSavedRepertoires(),
      loadRepertoireFolders(),
      loadUploadedCollections(),
      loadLibraryFolders(),
    ]);
  const pathOf = (folders: readonly { id: string; name: string; parentId: string | null }[], id: string | null | undefined): string[] => {
    const found = folders.find((folder) => folder.id === id);
    return found === undefined ? [] : [...pathOf(folders, found.parentId), found.name];
  };
  return {
    games,
    analyses: analyses.map(({ folderId, ...rest }) => ({ ...rest, folder: pathOf(analysisFolders, folderId) })),
    analysisFolders: analysisFolders.map((folder) => pathOf(analysisFolders, folder.id)).sort(),
    repertoires: repertoires.map(({ folderId, ...rest }) => ({
      ...rest,
      folder: repertoireFolders.find((folder) => folder.id === folderId)?.name ?? null,
    })),
    repertoireFolders: repertoireFolders.map((folder) => folder.name).sort(),
    collections: await Promise.all(
      collections.map(async ({ id, name, count, folderId }) => ({
        id,
        name,
        count,
        folder: pathOf(libraryFolders, folderId),
        games: await loadUploadedGames(id),
      })),
    ),
    libraryFolders: libraryFolders.map((folder) => pathOf(libraryFolders, folder.id)).sort(),
  };
};

const ALL = { collections: true, games: true, analyses: true, repertoires: true, shippedCollections: false };

const exported = async () => (await exportZip(ALL, { appVersion: "1.2.3" })).bytes;

/** A zip from the pure builder — for what no store here could hold (a shipped collection). */
const built = (source: Partial<ExportSource>) =>
  zipExport(
    buildExport(
      {
        playedGames: [],
        analyses: [],
        analysisFolders: [],
        repertoires: [],
        repertoireFolders: [],
        collections: [],
        collectionFolders: [],
        ...source,
      },
      { ...ALL, shippedCollections: true },
      { appVersion: "1.2.3" },
    ),
  );

const renderImport = () =>
  render(
    <AppThemeWithLang>
      <MemoryRouter initialEntries={["/settings/import"]}>
        <RightPanelProvider>
          <Routes>
            <Route path="/settings/:tab" element={<SettingsScreen />} />
          </Routes>
          <RightPanelOutlet />
        </RightPanelProvider>
      </MemoryRouter>
    </AppThemeWithLang>,
  );

/** Pick a file on the tab, as the reader would. */
const pick = async (bytes: Uint8Array, name = "chessapp-export-2026-09-23.zip") => {
  await userEvent.upload(await screen.findByTestId("settings-import-input"), new File([new Uint8Array(bytes)], name));
};

const dialog = () => screen.findByTestId("settings-import-dialog");
const tick = (category: string) =>
  within(screen.getByTestId(`settings-import-${category}-tick`)).getByRole("checkbox");
const radio = (testId: string, name: string) => within(screen.getByTestId(testId)).getByRole("radio", { name });

const importAndWait = async () => {
  await userEvent.click(screen.getByTestId("settings-import-run"));
  return screen.findByTestId("settings-import-done", undefined, { timeout: 10_000 });
};

beforeEach(async () => {
  await resetLibraryCollectionStore();
  resetLibraryFolderStore();
  await i18n.changeLanguage("en");
});

describe("the Import tab", () => {
  it("is the Settings section's second tab, at /settings/import", async () => {
    renderImport();
    expect(await screen.findByTestId("settings-tab-import")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("settings-tab-import")).toHaveAttribute("href", "/settings/import");
    expect(screen.getByTestId("settings-import")).toBeInTheDocument();
  });

  it("gives an empty app back every record, folder (empty ones too) and filing", async () => {
    await seed();
    const before = await everything();
    const bytes = await exported();
    await wipe();
    expect((await everything()).games).toEqual([]);

    renderImport();
    await pick(bytes);
    await dialog();
    expect(screen.getByTestId("settings-import-games-count")).toHaveTextContent("(1)");
    expect(screen.getByTestId("settings-import-analyses-count")).toHaveTextContent("(2)");
    expect(screen.getByTestId("settings-import-repertoires-count")).toHaveTextContent("(2)");
    expect(screen.getByTestId("settings-import-collections-count")).toHaveTextContent("(1)");

    const done = await importAndWait();
    expect(within(done).getByTestId("settings-import-result-analyses")).toHaveTextContent(
      "Analyses: 2 added, 0 replaced, 0 skipped, 3 folders created.",
    );
    expect(screen.queryByTestId("settings-import-dialog")).not.toBeInTheDocument();

    const after = await everything();
    expect(after.games).toEqual(before.games);
    expect(after.analyses).toEqual(before.analyses);
    expect(after.analysisFolders).toEqual([["Empty"], ["Openings"], ["Openings", "Sicilian"]]);
    expect(after.repertoires).toEqual(before.repertoires);
    expect(after.repertoireFolders).toEqual(["Unused", "White"]);
    expect(after.collections).toEqual(before.collections);
    expect(after.libraryFolders).toEqual([["Club"], ["Club", "Blitz"], ["Nothing yet"]]);
  });

  it("changes nothing when the same zip is imported again with Merge", async () => {
    await seed();
    const bytes = await exported();
    const before = await everything();
    const snapshots = [playedGamesSnapshot(), savedAnalysesSnapshot(), savedRepertoiresSnapshot(), repertoireFoldersSnapshot()];

    renderImport();
    await pick(bytes);
    await dialog();
    // Every category clashes at its top level, and Merge is the choice.
    expect(radio("settings-import-analyses-choice", "Merge")).toBeChecked();
    const done = await importAndWait();
    expect(within(done).getByTestId("settings-import-result-games")).toHaveTextContent(
      "Games: 0 added, 0 replaced, 1 skipped, 0 folders created.",
    );

    expect(await everything()).toEqual(before);
    // Not a write that happened to change nothing: no write at all, the same arrays.
    const now = [playedGamesSnapshot(), savedAnalysesSnapshot(), savedRepertoiresSnapshot(), repertoireFoldersSnapshot()];
    now.forEach((snapshot, at) => expect(snapshot).toBe(snapshots[at]));
  });

  it("writes nothing of a category left unticked", async () => {
    await seed();
    const bytes = await exported();
    await wipe();

    renderImport();
    await pick(bytes);
    await dialog();
    await userEvent.click(tick("games"));
    await userEvent.click(tick("repertoires"));
    const done = await importAndWait();
    expect(within(done).queryByTestId("settings-import-result-games")).not.toBeInTheDocument();

    const after = await everything();
    expect(after.games).toEqual([]);
    expect(after.repertoires).toEqual([]);
    expect(after.repertoireFolders).toEqual([]);
    expect(after.analyses.map((record) => record.id).sort()).toEqual(["a1", "a2"]);
  });

  it("lists the clashing folders, and a folder's own choice beats the category's", async () => {
    const white = await createRepertoireFolder("White");
    await saveRepertoire(repertoire("mine", white?.id ?? null));
    const bytes = built({
      repertoires: [repertoire("r1", "w"), repertoire("r2", null)],
      repertoireFolders: [{ id: "w", name: "White", savedAt: AT, updatedAt: AT }],
    });

    renderImport();
    await pick(bytes);
    await dialog();
    const unfiled = screen.getByTestId("settings-import-repertoires-conflict-0");
    const whiteRow = screen.getByTestId("settings-import-repertoires-conflict-1");
    expect(unfiled).toHaveTextContent("Unfiled");
    expect(whiteRow).toHaveTextContent("White");
    expect(whiteRow).toHaveTextContent("1 in the file · 1 here");

    // The category skips; White alone is overridden.
    await userEvent.click(radio("settings-import-repertoires-choice", "Skip"));
    await userEvent.click(within(whiteRow).getByTestId("settings-import-repertoires-conflict-1-toggle"));
    await userEvent.click(radio("settings-import-repertoires-conflict-1-choice", "Override"));
    expect(within(whiteRow).getByTestId("settings-import-repertoires-conflict-1-effective")).toHaveTextContent("Override");
    expect(screen.getByTestId("settings-import-repertoires-preview")).toHaveTextContent(
      "Will add 1, replace 1, skip 1, create 0 folders.",
    );

    await importAndWait();
    const after = await everything();
    expect(after.repertoires.map((record) => [record.id, record.folder])).toEqual([["r1", "White"]]);
  });

  it("says the shipped collections in a zip are not imported", async () => {
    const bytes = built({
      collections: [
        {
          summary: { id: "u1", name: "Mine", source: "uploaded", count: 1, folderId: null },
          games: [pgn("Mine")],
        },
        { summary: { id: "worldcup", name: "World Cup", source: "shipped", count: 1 }, games: [pgn("WC")] },
      ],
    });
    renderImport();
    await pick(bytes);
    await dialog();
    expect(screen.getByTestId("settings-import-shipped")).toHaveTextContent(
      "The file holds 1 built-in collection. It is not imported: it ships with the app.",
    );
    expect(screen.getByTestId("settings-import-collections-count")).toHaveTextContent("(1)");
    await importAndWait();
    expect((await loadUploadedCollections()).map((collection) => collection.id)).toEqual(["u1"]);
  });

  it("refuses a category past a cap before anything is written, and warns about the played games' oldest", async () => {
    await addRepertoireFolders(
      Array.from({ length: 100 }, (_, n) => ({ id: `f${n}`, name: `Folder ${n}`, savedAt: AT, updatedAt: AT })),
    );
    // A full store, one write — each game a minute apart, so the oldest is one game.
    await importPlayedGames(
      Array.from({ length: MAX_PLAYED_GAMES }, (_, n) =>
        played(`old${n}`, new Date(Date.parse(AT) + n * 60_000).toISOString()),
      ),
    );
    const bytes = built({
      playedGames: [played("new", "2026-09-20T00:00:00.000Z")],
      repertoires: [repertoire("r1", "w")],
      repertoireFolders: [{ id: "w", name: "A new one", savedAt: AT, updatedAt: AT }],
    });

    renderImport();
    await pick(bytes);
    await dialog();
    expect(screen.getByTestId("settings-import-repertoires-refused")).toHaveTextContent(
      "Not imported: it would need 101 folders, past the limit of 100.",
    );
    expect(screen.getByTestId("settings-import-games-drops")).toHaveTextContent(
      "Played games are kept up to 500: the oldest game will be dropped.",
    );

    const done = await importAndWait();
    expect(within(done).getByTestId("settings-import-result-repertoires")).toHaveTextContent(/not imported/);
    expect(await loadSavedRepertoires()).toEqual([]);
    expect(await loadRepertoireFolders()).toHaveLength(100);
    const games = await loadPlayedGames();
    expect(games).toHaveLength(MAX_PLAYED_GAMES);
    expect(games[0].id).toBe("new");
    // The store dropped its oldest to take the new game.
    expect(games.at(-1)?.id).toBe("old1");
    expect(games.some((game) => game.id === "old0")).toBe(false);
  });

  it.each([
    ["a file that is not a zip", strToU8("not a zip"), "is not a .zip file", []],
    [
      "a zip with no manifest",
      zipSync({ "games.pgn": strToU8(pgn("x")), "collections/club.pgn": strToU8(pgn("y")) }),
      "has no manifest.json",
      ["collections/club.pgn", "games.pgn"],
    ],
  ])("opens the incompatible-file dialog on %s, listing its PGN files, and writes nothing", async (_name, bytes, text, files) => {
    renderImport();
    await pick(bytes, "backup.zip");
    const incompatible = await screen.findByTestId("settings-import-incompatible");
    expect(within(incompatible).getByTestId("settings-import-incompatible-problem")).toHaveTextContent(text);
    const listed = within(incompatible).getByTestId("settings-import-incompatible-files");
    if (files.length === 0) expect(listed).toHaveTextContent("It holds no PGN files.");
    for (const file of files) expect(listed).toHaveTextContent(file);
    expect(within(incompatible).getByTestId("settings-import-incompatible-collections")).toHaveAttribute(
      "href",
      "/library/new",
    );

    await userEvent.click(screen.getByTestId("settings-import-incompatible-close"));
    await waitFor(() => expect(screen.queryByTestId("settings-import-incompatible")).not.toBeInTheDocument());
    expect(await loadPlayedGames()).toEqual([]);
    expect(await loadUploadedCollections()).toEqual([]);
  });
});
