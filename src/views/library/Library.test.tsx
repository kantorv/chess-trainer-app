import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";

import i18n from "../../i18n";
import { indexedRowOf, numberedRows, type IndexedRow } from "../../lib/collectionIndex";
import {
  addCollection,
  loadUploadedCollections,
  peekUploadedGames,
  resetLibraryCollectionStore,
  uploadedCollectionsSnapshot,
} from "../../lib/libraryCollectionStore";
import {
  createLibraryFolder,
  libraryFoldersSnapshot,
  loadLibraryFolders,
  resetLibraryFolderStore,
} from "../../lib/libraryFolderStore";
import {
  collectionFacetsOf,
  collectionRowOf,
  filteredRows,
  readCollectionText,
} from "../../lib/libraryCollections";
import { peekShippedGames, peekShippedRows, shippedCollections } from "../../lib/shippedCollections";
import {
  findSavedAnalysis,
  loadSavedAnalyses,
  savedAnalysesSnapshot,
} from "../../lib/savedAnalysisStore";
import {
  createAnalysisFolder,
  loadAnalysisFolders,
  MAX_ANALYSIS_FOLDERS,
} from "../../lib/savedAnalysisFolderStore";
import { downloadPgn } from "../../lib/pgnExport";
import AppThemeWithLang from "../../theme/AppThemeWithLang";
import { boardOptions, FakeEngine } from "../board/boardTestHarness";
import { CHANCE_ARROW_BORDER_COLOR, CHANCE_ARROW_FILL_COLOR } from "../explorer/chanceArrows";
import { HOVERED_NEXT_MOVE_ARROW_COLOR } from "../tools/analysis/nextMoveArrows";
import { RightPanelOutlet, RightPanelProvider } from "../main/rightPanel";

vi.mock("../../lib/engine", async () => ({
  default: (await import("../board/boardTestHarness")).FakeEngine,
}));

vi.mock("react-chessboard", async () => {
  const { reactChessboardMock } = await import("../board/boardTestHarness");
  return reactChessboardMock();
});

// The download is a blob URL in a browser; here, what it was handed.
vi.mock("../../lib/pgnExport", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/pgnExport")>()),
  downloadPgn: vi.fn(() => true),
}));

vi.mock("../../lib/openings", async (importOriginal) => {
  const { openingsMock } = await import("../board/boardTestHarness");
  return openingsMock(importOriginal as () => Promise<typeof import("../../lib/openings")>);
});

import CollectionScreen from "./CollectionScreen";
import LibraryGameScreen from "./LibraryGameScreen";
import LibraryHome from "./LibraryHome";
import LibraryUpload from "./LibraryUpload";

/*
  The Library (CTA-75), through its screens: the collections (listed with no
  fetch), a collection's table off its index (sorted, filtered, opened), a
  paste checked game by game and becoming a collection in IndexedDB, and a game
  on its analysis board — Update / Save as copy in an upload, Save as copy
  into Saved analyses from a shipped file. The board's shared panel and square
  are asserted with the other v2 boards (`boards.test.tsx`,
  `panelPropagation.test.tsx`).
*/

const AFTER_E4_E5 = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";

const GAMES = [
  '[Event "Club"]\n[Round "2"]\n[White "Zed"]\n[Black "Amy"]\n[Result "0-1"]\n[WhiteElo "1500"]\n\n1. e4 e5 0-1',
  '[Event "Club"]\n[Round "1"]\n[White "Amy"]\n[Black "Bob"]\n[Result "1-0"]\n[WhiteElo "1900"]\n\n1. d4 d5 2. c4 1-0',
  '[Event "Club"]\n[Round "10"]\n[White "Bob"]\n[Black "Zed"]\n[Result "1/2-1/2"]\n\n1. c4 1/2-1/2',
];

function Where() {
  const location = useLocation();
  return <div data-testid="where">{`${location.pathname}${location.search}`}</div>;
}
const where = () => screen.getByTestId("where").textContent ?? "";

const mount = (entry: string) =>
  render(
    <AppThemeWithLang>
      <MemoryRouter initialEntries={[entry]}>
        <RightPanelProvider>
          <Routes>
            <Route path="/library" element={<LibraryHome />} />
            <Route path="/library/new" element={<LibraryUpload />} />
            <Route path="/library/:collectionId" element={<CollectionScreen />} />
            <Route path="/library/:collectionId/:game" element={<LibraryGameScreen />} />
            <Route path="*" element={<div data-testid="elsewhere" />} />
          </Routes>
          <Where />
          <RightPanelOutlet />
        </RightPanelProvider>
      </MemoryRouter>
    </AppThemeWithLang>,
  );

const keep = async (name: string, games: string[], folderId: string | null = null, at?: string) => {
  const added = await addCollection(
    name,
    games,
    games.map((pgn) => indexedRowOf(pgn)),
    at === undefined ? undefined : new Date(at),
    undefined,
    folderId,
  );
  if (!("collection" in added)) throw new Error("not added");
  return added.collection;
};
const upload = () => keep("Club games", GAMES);

/** Type into one of the panel's autocompletes. */
const typeInto = (testId: string, value: string) =>
  fireEvent.change(within(screen.getByTestId(testId)).getByRole("combobox"), { target: { value } });

/** The real 7,818-game fixture as an upload — its tags' rows (the chess.js pass would take a minute). */
const keepCarlsen = async () => {
  const reading = readCollectionText(
    readFileSync(join(process.cwd(), "src/test/fixtures/pgn/Carlsen.pgn"), "utf8"),
  );
  if (!reading.ok) throw new Error("the fixture did not read");
  const rows = reading.games.map((pgn): IndexedRow => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { number, ...row } = collectionRowOf(pgn, 0);
    return row;
  });
  const added = await addCollection("Carlsen", reading.games, rows);
  if (!("collection" in added)) throw new Error("not added");
  return { games: reading.games, rows, id: added.collection.id };
};

/** Unmount what is on screen and mount another entry. */
const cleanupAndMount = (entry: string) => {
  cleanup();
  mount(entry);
};

/** Mount a collection's table and wait for its rows. */
const mountTable = async (entry: string) => {
  mount(entry);
  await screen.findByTestId("library-table");
};

/** Mount a game and wait for its board. */
const mountGame = async (entry: string) => {
  mount(entry);
  await screen.findByTestId("library-game-board");
};

const drag = (from: string, to: string) => {
  act(() => {
    boardOptions().onPieceDrop!({ sourceSquare: from, targetSquare: to });
  });
};

/** The table's rows, as their `#` numbers, in the order on screen. */
const rowNumbers = () =>
  within(screen.getByTestId("library-table"))
    .getAllByRole("row")
    .slice(1)
    .map((row) => row.getAttribute("data-testid")?.replace("library-table-row-", ""));

beforeEach(async () => {
  localStorage.clear();
  resetLibraryFolderStore();
  await resetLibraryCollectionStore();
  FakeEngine.reset();
  await i18n.changeLanguage("en");
});

describe("the Library's collections", () => {
  it("lists the three shipped collections, then the reader's uploads", async () => {
    const mine = await upload();
    mount("/library");

    // The uploads arrive once IndexedDB has answered.
    await screen.findByTestId(`library-collection-${mine.id}`);
    const list = screen.getByTestId("library-collections");
    const names = within(list)
      .getAllByRole("link")
      .map((link) => link.textContent);
    expect(names[0]).toContain("Bucharest 2023");
    expect(names[1]).toContain("Morphy");
    expect(names[2]).toContain("World Cup 2023");
    expect(names[3]).toContain("Club games");
    expect(screen.getByTestId(`library-collection-${mine.id}`)).toHaveAttribute(
      "href",
      `/library/${mine.id}`,
    );
    expect(screen.getByTestId("library-count")).toHaveTextContent("4 collections");
    expect(within(screen.getByTestId(`library-row-${mine.id}`)).getByText("3")).toBeInTheDocument();
  });

  it("counts the shipped collections off the manifest, fetching nothing", () => {
    mount("/library");
    // On the first frame, no fetch awaited.
    expect(within(screen.getByTestId("library-row-morphy")).getByText("211")).toBeInTheDocument();
    expect(within(screen.getByTestId("library-row-worldcup2023")).getByText("674")).toBeInTheDocument();
    // Built-in holds them all.
    expect(within(screen.getByTestId("library-folder-builtin")).getByText("930")).toBeInTheDocument();
    for (const entry of shippedCollections) {
      expect(peekShippedRows(entry.id)).toBeUndefined();
      expect(peekShippedGames(entry.id)).toBeUndefined();
    }
  });

  it("filters the collections by name, from the URL, saying when none matches", async () => {
    const mine = await upload();
    mount("/library");
    await screen.findByTestId(`library-collection-${mine.id}`);

    fireEvent.change(screen.getByTestId("library-filter"), { target: { value: "  CUP " } });
    expect(where()).toContain("q=");
    expect(screen.getByTestId("library-collection-worldcup2023")).toBeInTheDocument();
    expect(screen.queryByTestId("library-collection-morphy")).toBeNull();
    expect(screen.queryByTestId(`library-collection-${mine.id}`)).toBeNull();
    expect(screen.getByTestId("library-count")).toHaveTextContent("1 of 4 collections");

    fireEvent.change(screen.getByTestId("library-filter"), { target: { value: "club" } });
    expect(screen.getByTestId(`library-collection-${mine.id}`)).toBeInTheDocument();
    expect(screen.queryByTestId("library-collection-worldcup2023")).toBeNull();

    fireEvent.change(screen.getByTestId("library-filter"), { target: { value: "nothing like it" } });
    expect(screen.getByTestId("library-no-matches")).toBeInTheDocument();

    cleanupAndMount("/library?q=morphy");
    expect(screen.getByTestId("library-filter")).toHaveValue("morphy");
    expect(screen.getByTestId("library-collection-morphy")).toBeInTheDocument();
    expect(screen.queryByTestId("library-collection-bucharest2023")).toBeNull();
  });

  it("keeps each row's download and delete in a column beside its link, not inside it", async () => {
    const mine = await upload();
    mount("/library");
    for (const id of ["morphy", mine.id]) {
      const actions = await screen.findByTestId(`library-collection-actions-${id}`);
      expect(screen.getByTestId(`library-collection-${id}`)).not.toContainElement(actions);
      expect(actions).toContainElement(screen.getByTestId(`library-collection-download-${id}`));
    }
    expect(screen.getByTestId(`library-collection-actions-${mine.id}`)).toContainElement(
      screen.getByTestId(`library-collection-delete-${mine.id}`),
    );
  });

  it("deletes an uploaded collection from its row, asking first — a shipped one has no delete", async () => {
    const mine = await upload();
    mount("/library");
    expect(screen.queryByTestId("library-collection-delete-morphy")).toBeNull();
    fireEvent.click(await screen.findByTestId(`library-collection-delete-${mine.id}`));
    expect(screen.getByTestId("library-delete-dialog")).toHaveTextContent("Delete Club games?");
    fireEvent.click(screen.getByTestId("library-delete-confirm"));
    await waitFor(() => expect(uploadedCollectionsSnapshot()).toEqual([]));
    expect(where()).toBe("/library");
    expect(screen.queryByTestId(`library-collection-${mine.id}`)).toBeNull();
  });

  it("downloads a whole collection from its row, reading its games only then", async () => {
    vi.mocked(downloadPgn).mockClear();
    const mine = await upload();
    mount("/library");
    expect(peekShippedGames("morphy")).toBeUndefined();

    fireEvent.click(screen.getByTestId("library-collection-download-morphy"));
    await waitFor(() => expect(downloadPgn).toHaveBeenCalledTimes(1));
    const [stem, pgns] = vi.mocked(downloadPgn).mock.calls[0];
    expect(stem).toBe("morphy");
    expect(pgns).toHaveLength(211);
    // The icon is beside the row's link, so the click did not open the collection.
    expect(where()).toBe("/library");

    fireEvent.click(screen.getByTestId(`library-collection-download-${mine.id}`));
    await waitFor(() => expect(downloadPgn).toHaveBeenLastCalledWith("club-games", GAMES));
  });
});

describe("the Library's folders (CTA-88)", () => {
  /** The table's rows, as their test ids, in the order on screen. */
  const listRows = () =>
    within(screen.getByTestId("library-collections"))
      // A closing dialog still hides the page from the accessibility tree.
      .getAllByRole("row", { hidden: true })
      .slice(1)
      .map((row) => row.getAttribute("data-testid"));
  const folderOf = async (name: string) =>
    (await loadUploadedCollections()).find((row) => row.name === name)?.folderId;
  const nameFolder = (name: string) => {
    fireEvent.change(screen.getByTestId("library-folder-name-input"), { target: { value: name } });
    fireEvent.click(screen.getByTestId("library-folder-name-save"));
  };
  const made = async (name: string, parentId: string | null = null) => {
    const folder = await createLibraryFolder(name, parentId);
    if (folder === undefined) throw new Error("not made");
    return folder;
  };

  it("keeps the shipped collections in Built-in: first, open, and read-only", async () => {
    const box = await made("Box");
    mount("/library");
    await screen.findByTestId(`library-folder-${box.id}`);

    expect(listRows()).toEqual([
      "library-folder-builtin",
      "library-row-bucharest2023",
      "library-row-morphy",
      "library-row-worldcup2023",
      `library-folder-${box.id}`,
    ]);
    expect(screen.getByTestId("library-folder-builtin-toggle")).toHaveAttribute("aria-expanded", "true");
    const actions = screen.getByTestId("library-folder-actions-builtin");
    expect(within(actions).getByTestId("library-folder-download-builtin")).toBeInTheDocument();
    for (const action of ["upload", "new", "rename", "move", "delete"]) {
      expect(screen.queryByTestId(`library-folder-${action}-builtin`)).toBeNull();
      expect(screen.getByTestId(`library-folder-${action}-${box.id}`)).toBeInTheDocument();
    }
    // Its collections only download, and have no date.
    expect(screen.getByTestId("library-collection-download-morphy")).toBeInTheDocument();
    expect(screen.queryByTestId("library-collection-move-morphy")).toBeNull();
    expect(screen.queryByTestId("library-collection-delete-morphy")).toBeNull();
    expect(within(screen.getByTestId("library-row-morphy")).getByText("—")).toBeInTheDocument();
    // Nothing can be filed in it.
    fireEvent.click(screen.getByTestId(`library-folder-move-${box.id}`));
    expect(screen.queryByTestId("library-folder-picker-builtin")).toBeNull();
  });

  it("creates folders at the top level and inside one, and opens and closes them in place", async () => {
    const mine = await upload();
    mount("/library");
    await screen.findByTestId(`library-row-${mine.id}`);

    fireEvent.click(screen.getByTestId("library-new-folder"));
    nameFolder("Openings");
    await waitFor(() => expect(libraryFoldersSnapshot()).toHaveLength(1));
    const [openings] = libraryFoldersSnapshot()!;
    const openingsRow = await screen.findByTestId(`library-folder-${openings.id}`);
    // Folders come before the collections of their level.
    expect(listRows().indexOf(`library-folder-${openings.id}`)).toBeLessThan(listRows().indexOf(`library-row-${mine.id}`));
    expect(within(openingsRow).getByText("Openings")).toHaveAttribute("dir", "auto");

    fireEvent.click(screen.getByTestId(`library-folder-new-${openings.id}`));
    nameFolder("Sicilian");
    await waitFor(() => expect(libraryFoldersSnapshot()).toHaveLength(2));
    const sicilian = libraryFoldersSnapshot()!.find((folder) => folder.name === "Sicilian")!;
    expect(sicilian.parentId).toBe(openings.id);
    // Its parent opened to show it.
    expect(await screen.findByTestId(`library-folder-${sicilian.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`library-folder-${openings.id}-toggle`)).toHaveAttribute("aria-expanded", "true");

    // A click on the row closes it; on the chevron, opens it again.
    fireEvent.click(openingsRow);
    expect(screen.queryByTestId(`library-folder-${sicilian.id}`)).toBeNull();
    fireEvent.click(screen.getByTestId(`library-folder-${openings.id}-toggle`));
    expect(screen.getByTestId(`library-folder-${sicilian.id}`)).toBeInTheDocument();
    // Built-in closes too.
    fireEvent.click(screen.getByTestId("library-folder-builtin-toggle"));
    expect(screen.queryByTestId("library-row-morphy")).toBeNull();
  });

  it("opens a collection from its row, with a real link in its name", async () => {
    const box = await made("Box");
    const mine = await keep("Club games", GAMES, box.id);
    mount("/library");
    fireEvent.click(await screen.findByTestId(`library-folder-${box.id}`));
    expect(screen.getByTestId(`library-collection-${mine.id}`)).toHaveAttribute("href", `/library/${mine.id}`);
    fireEvent.click(screen.getByTestId(`library-row-${mine.id}`));
    expect(where()).toBe(`/library/${mine.id}`);
  });

  it("uploads into a folder from its row, the picker starting there", async () => {
    const box = await made("Box");
    mount("/library");
    fireEvent.click(await screen.findByTestId(`library-folder-upload-${box.id}`));
    expect(where()).toBe(`/library/new?folder=${box.id}`);
    expect(await screen.findByTestId(`library-upload-folder-picker-${box.id}`)).toHaveClass("Mui-selected");

    // One game: the upload is a real index pass.
    fireEvent.change(screen.getByTestId("library-upload-paste"), { target: { value: GAMES[0] } });
    fireEvent.click(screen.getByTestId("library-upload-save"));
    await waitFor(() => expect(where()).toMatch(/^\/library\/u/), { timeout: 4000 });
    expect(await folderOf("Club")).toBe(box.id);
  });

  it("files an empty collection in the folder picked, and a folder that is not the reader's at the top level", async () => {
    const box = await made("Box");
    mount("/library/new");
    fireEvent.click(await screen.findByTestId(`library-upload-folder-picker-${box.id}`));
    fireEvent.change(screen.getByTestId("library-upload-name"), { target: { value: "Picked" } });
    fireEvent.click(screen.getByTestId("library-upload-empty"));
    await waitFor(() => expect(where()).toMatch(/^\/library\/u/));
    expect(await folderOf("Picked")).toBe(box.id);

    for (const folder of ["builtin", "nowhere"]) {
      cleanupAndMount(`/library/new?folder=${folder}`);
      expect(await screen.findByTestId("library-upload-folder-top")).toHaveClass("Mui-selected");
    }
    fireEvent.change(screen.getByTestId("library-upload-name"), { target: { value: "Loose" } });
    fireEvent.click(screen.getByTestId("library-upload-empty"));
    await waitFor(() => expect(where()).toMatch(/^\/library\/u/));
    expect(await folderOf("Loose")).toBeNull();
  });

  it("moves a collection and a folder with Move to…, never a folder into its own subtree", async () => {
    const a = await made("A");
    const b = await made("B", a.id);
    const c = await made("C");
    const mine = await upload();
    mount("/library");

    fireEvent.click(await screen.findByTestId(`library-collection-move-${mine.id}`));
    fireEvent.click(within(screen.getByTestId("library-collection-move-dialog")).getByTestId(`library-folder-picker-${b.id}`));
    await waitFor(async () => expect(await folderOf("Club games")).toBe(b.id));
    // It left the top level for B, which is closed.
    await waitFor(() => expect(screen.queryByTestId(`library-row-${mine.id}`)).toBeNull());
    await waitFor(() => expect(screen.queryByTestId("library-collection-move-dialog")).toBeNull());

    fireEvent.click(screen.getByTestId(`library-folder-move-${a.id}`));
    expect(screen.queryByTestId(`library-folder-picker-${a.id}`)).toBeNull();
    expect(screen.queryByTestId(`library-folder-picker-${b.id}`)).toBeNull();
    fireEvent.click(screen.getByTestId(`library-folder-picker-${c.id}`));
    await waitFor(() => expect(libraryFoldersSnapshot()?.find((row) => row.id === a.id)?.parentId).toBe(c.id));
  });

  it("renames a folder, and deletes one keeping its contents in its parent — asking first when it holds any", async () => {
    const top = await made("Top");
    const doomed = await made("Doomed", top.id);
    const kept = await made("Kept", doomed.id);
    await keep("Inside", GAMES, doomed.id);
    const empty = await made("Empty");
    mount("/library");

    fireEvent.click(await screen.findByTestId(`library-folder-rename-${top.id}`));
    expect(screen.getByTestId("library-folder-name-input")).toHaveValue("Top");
    nameFolder("Renamed");
    await waitFor(() => expect(screen.getByTestId(`library-folder-${top.id}`)).toHaveTextContent("Renamed"));

    // An empty folder goes at once.
    fireEvent.click(screen.getByTestId(`library-folder-delete-${empty.id}`));
    await waitFor(() => expect(screen.queryByTestId(`library-folder-${empty.id}`)).toBeNull());

    fireEvent.click(screen.getByTestId(`library-folder-${top.id}`));
    fireEvent.click(await screen.findByTestId(`library-folder-delete-${doomed.id}`));
    expect(screen.getByTestId("library-folder-delete-counts")).toHaveTextContent("1 collections and 1 sub-folders");
    expect(screen.getByRole("dialog")).toHaveTextContent(i18n.t("library.folder.deleteConfirm"));
    fireEvent.click(screen.getByTestId("library-folder-delete-confirm"));
    await waitFor(async () => expect(await folderOf("Inside")).toBe(top.id));
    expect((await loadLibraryFolders()).find((row) => row.id === kept.id)?.parentId).toBe(top.id);
  });

  it("filters by name, opening the folders above a match, and shows a folder whose name matches", async () => {
    const a = await made("Archive");
    const b = await made("Blitz", a.id);
    const mine = await keep("Club games", GAMES, b.id);
    mount("/library");
    await screen.findByTestId(`library-folder-${a.id}`);
    expect(screen.queryByTestId(`library-row-${mine.id}`)).toBeNull();

    fireEvent.change(screen.getByTestId("library-filter"), { target: { value: "club" } });
    expect(where()).toBe("/library?q=club");
    expect(listRows()).toEqual([`library-folder-${a.id}`, `library-folder-${b.id}`, `library-row-${mine.id}`]);
    expect(screen.getByTestId("library-count")).toHaveTextContent("1 of 4 collections");

    // The reader can still close what the filter opened.
    fireEvent.click(screen.getByTestId(`library-folder-${b.id}-toggle`));
    expect(listRows()).toEqual([`library-folder-${a.id}`, `library-folder-${b.id}`]);

    fireEvent.change(screen.getByTestId("library-filter"), { target: { value: "blitz" } });
    expect(listRows()).toEqual([`library-folder-${a.id}`, `library-folder-${b.id}`]);
    expect(screen.getByTestId(`library-folder-${b.id}-toggle`)).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByTestId(`library-folder-${b.id}`));
    expect(listRows()).toContain(`library-row-${mine.id}`);

    fireEvent.change(screen.getByTestId("library-filter"), { target: { value: "nothing like it" } });
    expect(screen.getByTestId("library-no-matches")).toBeInTheDocument();
  });

  it("sorts by Name, Games and Added from the headers, in the URL, folders always first", async () => {
    const box = await made("Zeta box");
    const small = await keep("Aardvark", GAMES.slice(0, 1), null, "2026-01-01T00:00:00Z");
    const big = await keep("Mid", GAMES, null, "2026-03-01T00:00:00Z");
    mount("/library");
    await screen.findByTestId(`library-row-${big.id}`);
    fireEvent.click(screen.getByTestId("library-folder-builtin-toggle"));
    const order = [`library-folder-builtin`, `library-folder-${box.id}`];
    expect(listRows()).toEqual([...order, `library-row-${small.id}`, `library-row-${big.id}`]);

    fireEvent.click(screen.getByTestId("library-collections-sort-games"));
    expect(where()).toBe("/library?sort=games");
    expect(listRows()).toEqual([...order, `library-row-${big.id}`, `library-row-${small.id}`]);
    fireEvent.click(screen.getByTestId("library-collections-sort-games"));
    expect(where()).toBe("/library?sort=games&dir=asc");
    expect(listRows()).toEqual([...order, `library-row-${small.id}`, `library-row-${big.id}`]);

    fireEvent.click(screen.getByTestId("library-collections-sort-added"));
    expect(where()).toBe("/library?sort=added");
    expect(listRows()).toEqual([...order, `library-row-${big.id}`, `library-row-${small.id}`]);

    fireEvent.click(screen.getByTestId("library-collections-sort-name"));
    expect(where()).toBe("/library");
    fireEvent.click(screen.getByTestId("library-collections-sort-name"));
    expect(where()).toBe("/library?dir=desc");
    expect(listRows()).toEqual([...order, `library-row-${big.id}`, `library-row-${small.id}`]);

    cleanupAndMount("/library?sort=games&dir=asc");
    await screen.findByTestId(`library-row-${big.id}`);
    expect(listRows().slice(-2)).toEqual([`library-row-${small.id}`, `library-row-${big.id}`]);
  });

  it("downloads a folder's whole subtree as one PGN, reading the games only then", async () => {
    vi.mocked(downloadPgn).mockClear();
    const top = await made("Top");
    const inner = await made("Inner", top.id);
    await keep("B games", GAMES.slice(1), top.id);
    await keep("A games", GAMES.slice(0, 1), inner.id);
    mount("/library");
    fireEvent.click(await screen.findByTestId(`library-folder-download-${top.id}`));
    await waitFor(() => expect(downloadPgn).toHaveBeenCalledTimes(1));
    expect(downloadPgn).toHaveBeenLastCalledWith("top", [GAMES[0], GAMES[1], GAMES[2]]);
    expect(where()).toBe("/library");
  });
});

describe("a collection's table", () => {
  it("opens a shipped collection once it is fetched", async () => {
    mount("/library/bucharest2023");
    expect(await screen.findByTestId("library-table-name")).toHaveTextContent("Bucharest 2023");
    expect(screen.getByTestId("library-table-count")).toHaveTextContent("45 games");
    expect(screen.getByTestId("library-table-note")).toHaveTextContent(
      i18n.t("library.table.shippedNote"),
    );
    // A shipped collection's games are not deleted; a collection is deleted from /library.
    expect(screen.queryByTestId("library-picks-delete")).toBeNull();
    // The whole collection downloads from its row on /library; here only the picks do.
    expect(screen.queryByTestId("library-table-download")).toBeNull();
    expect(screen.getByTestId("library-picks-download")).toBeInTheDocument();
  });

  it("sorts by a column, both ways, and keeps it in the URL", async () => {
    const mine = await upload();
    await mountTable(`/library/${mine.id}`);
    expect(rowNumbers()).toEqual(["1", "2", "3"]);

    fireEvent.click(screen.getByTestId("library-table-sort-round"));
    expect(rowNumbers()).toEqual(["2", "1", "3"]);
    expect(where()).toContain("sort=round");

    fireEvent.click(screen.getByTestId("library-table-sort-round"));
    expect(rowNumbers()).toEqual(["3", "1", "2"]);

    // A number sorts high first on the first click.
    fireEvent.click(screen.getByTestId("library-table-sort-whiteElo"));
    expect(rowNumbers()).toEqual(["2", "1", "3"]);
  });

  it("filters by words and by result", async () => {
    const mine = await upload();
    await mountTable(`/library/${mine.id}`);

    fireEvent.change(screen.getByTestId("library-table-filter"), { target: { value: "zed" } });
    expect(rowNumbers()).toEqual(["1", "3"]);
    expect(screen.getByTestId("library-table-count")).toHaveTextContent("2 of 3 games");

    fireEvent.change(screen.getByTestId("library-table-filter"), { target: { value: "nobody" } });
    expect(screen.getByTestId("library-table-empty")).toBeInTheDocument();
  });

  it("opens a game from its row", async () => {
    const mine = await upload();
    await mountTable(`/library/${mine.id}`);
    fireEvent.click(screen.getByTestId("library-table-row-2"));
    expect(where()).toBe(`/library/${mine.id}/2`);
    expect(await screen.findByTestId("library-game-title")).toHaveTextContent("Amy – Bob");
  });

  it("marks a game its index could not read", async () => {
    const broken = '[Event "Club"]\n[White "Kim"]\n[Black "Lee"]\n[Result "*"]\n\n1. e4 e5 2. Ke3 *';
    const mine = await keep("With a broken game", [GAMES[0], broken]);
    await mountTable(`/library/${mine.id}`);
    expect(screen.getByTestId("library-table-unreadable-2")).toBeInTheDocument();
    expect(screen.queryByTestId("library-table-unreadable-1")).toBeNull();
  });

  it("deletes the picked games of an uploaded collection, asking first", async () => {
    const mine = await upload();
    await mountTable(`/library/${mine.id}`);
    expect(screen.getByTestId("library-picks-delete")).toBeDisabled();
    for (const number of [1, 3]) {
      fireEvent.click(within(screen.getByTestId(`library-picks-row-${number}`)).getByRole("checkbox"));
    }
    fireEvent.click(screen.getByTestId("library-picks-delete"));
    expect(screen.getByTestId("library-picks-delete-dialog")).toHaveTextContent("Delete 2 games?");
    fireEvent.click(screen.getByTestId("library-picks-delete-confirm"));

    await waitFor(() => expect(rowNumbers()).toEqual(["1"]));
    expect(peekUploadedGames(mine.id)).toEqual([GAMES[1]]);
    expect(screen.getByTestId("library-table-count")).toHaveTextContent("1 game");
    expect(screen.queryByTestId("library-picks-selected-count")).toBeNull();
    expect(where()).toBe(`/library/${mine.id}`);
  });

  it("says so for a collection that is not there", async () => {
    mount("/library/nothing-here");
    expect(await screen.findByTestId("library-not-found")).toHaveTextContent(
      i18n.t("library.notFound.collection"),
    );
  });
});

describe("the table's filters", () => {
  const RICH = [
    '[Event "Spring Open"]\n[Date "2023.04.02"]\n[White "Carlsen"]\n[Black "Nepo"]\n[Result "1-0"]\n[ECO "C42"]\n[Opening "Petrov"]\n\n1. e4 e5 2. Nf3 Nf6 1-0',
    '[Event "Spring Open"]\n[Date "2023.04.03"]\n[White "Nepo"]\n[Black "Carlsen"]\n[Result "0-1"]\n[ECO "B90"]\n[Opening "Sicilian"]\n\n1. e4 c5 0-1',
    '[Event "Autumn Cup"]\n[Date "2023.10"]\n[White "Ding"]\n[Black "Carlsen"]\n[Result "1/2-1/2"]\n[ECO "D37"]\n[Opening "Queen\'s Gambit"]\n\n1. d4 d5 1/2-1/2',
  ];
  const panel = () => within(screen.getByTestId("library-filters"));

  it("shows only the filters the collection's games can use", async () => {
    // Club games: players and results, one event, no dates, no openings.
    const club = await upload();
    await mountTable(`/library/${club.id}`);
    expect(screen.getByTestId("library-filter-player")).toBeInTheDocument();
    expect(screen.getByTestId("library-table-result")).toBeInTheDocument();
    expect(screen.queryByTestId("library-filter-opening")).toBeNull();
    expect(screen.queryByTestId("library-filter-event")).toBeNull();
    expect(screen.queryByTestId("library-filter-from")).toBeNull();
  });

  it("narrows to a player's games, then to the side they had", async () => {
    const rich = await keep("Rich", RICH);
    await mountTable(`/library/${rich.id}`);
    expect(within(screen.getByTestId("library-filter-color")).getByTestId("library-filter-color-black")).toBeDisabled();

    typeInto("library-filter-player", "carl");
    // Newest first: "2023.10" is after April.
    expect(rowNumbers()).toEqual(["3", "2", "1"]);
    fireEvent.click(panel().getByTestId("library-filter-color-black"));
    expect(rowNumbers()).toEqual(["3", "2"]);
    expect(where()).toContain("player=carl");
    expect(where()).toContain("color=black");
    expect(screen.getByTestId("library-table-count")).toHaveTextContent("2 of 3 games");
  });

  it("narrows by opening name or ECO, event and dates, all from the URL", async () => {
    const rich = await keep("Rich", RICH);
    await mountTable(`/library/${rich.id}?opening=sicil`);
    expect(rowNumbers()).toEqual(["2"]);
    cleanupAndMount(`/library/${rich.id}?opening=D3`);
    await screen.findByTestId("library-table");
    expect(rowNumbers()).toEqual(["3"]);
    cleanupAndMount(`/library/${rich.id}?event=Spring+Open`);
    await screen.findByTestId("library-table");
    expect(rowNumbers()).toEqual(["2", "1"]);

    cleanupAndMount(`/library/${rich.id}`);
    await screen.findByTestId("library-table");
    // "2023.10" is any day of October.
    fireEvent.change(screen.getByTestId("library-filter-from"), { target: { value: "2023-04-03" } });
    expect(rowNumbers()).toEqual(["3", "2"]);
    fireEvent.change(screen.getByTestId("library-filter-to"), { target: { value: "2023-10-05" } });
    expect(rowNumbers()).toEqual(["3", "2"]);
    fireEvent.change(screen.getByTestId("library-filter-to"), { target: { value: "2023-09-30" } });
    expect(rowNumbers()).toEqual(["2"]);
    expect(screen.getByTestId("library-filter-from")).toHaveAttribute("min", "2023-04-02");
  });

  it("opens newest first, and turns or leaves the date order from its header", async () => {
    const rich = await keep("Rich", [...RICH, '[Event "Undated"]\n[White "X"]\n[Black "Y"]\n\n1. e4 *']);
    await mountTable(`/library/${rich.id}`);
    // Undated games last, whichever way.
    expect(rowNumbers()).toEqual(["3", "2", "1", "4"]);
    expect(where()).toBe(`/library/${rich.id}`);

    fireEvent.click(screen.getByTestId("library-table-sort-date"));
    expect(rowNumbers()).toEqual(["1", "2", "3", "4"]);
    expect(where()).toBe(`/library/${rich.id}?dir=asc`);
    fireEvent.click(screen.getByTestId("library-table-sort-date"));
    expect(where()).toBe(`/library/${rich.id}`);

    // `#` is the collection's own order.
    fireEvent.click(screen.getByTestId("library-table-sort-number"));
    expect(rowNumbers()).toEqual(["1", "2", "3", "4"]);
    expect(where()).toBe(`/library/${rich.id}?sort=number`);
  });

  it("clears every filter at once, leaving the words box alone", async () => {
    const rich = await keep("Rich", RICH);
    await mountTable(`/library/${rich.id}?q=open&player=carl&color=white&result=1-0`);
    expect(rowNumbers()).toEqual(["1"]);
    fireEvent.click(panel().getByTestId("library-filter-clear"));
    expect(rowNumbers()).toEqual(["2", "1"]);
    expect(where()).toBe(`/library/${rich.id}?q=open`);
    expect(panel().getByTestId("library-filter-clear")).toBeDisabled();
  });

  it("lists every opening of a real 7,818-game collection, ECO code first — not a first page", async () => {
    const { rows, id } = await keepCarlsen();
    await mountTable(`/library/${id}`);

    const expected = collectionFacetsOf(numberedRows(rows)).openings;
    const box = within(screen.getByTestId("library-filter-opening")).getByRole("combobox");
    fireEvent.keyDown(box, { key: "ArrowDown" });
    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(expected.length);
    expect(options[0]).toHaveTextContent(/^A0\d/);
    expect(options[options.length - 1]).toHaveTextContent(/^E9\d/);

    // Picking one narrows the table to its games.
    const pick = options.find((option) => /^B90\b/.test(option.textContent ?? ""))!;
    const label = pick.textContent!;
    fireEvent.click(pick);
    const matching = filteredRows(numberedRows(rows), { text: "", result: "", opening: label }).length;
    expect(matching).toBeGreaterThan(0);
    expect(screen.getByTestId("library-table-count")).toHaveTextContent(`${matching} of 7818 games`);
    expect(where()).toContain(`opening=${encodeURIComponent(label).replace(/%20/g, "+")}`);
  }, 60_000);

  it("offers a shipped collection's openings, filled from the book where the file has none", async () => {
    await mountTable("/library/morphy");
    typeInto("library-filter-opening", "king's gambit");
    expect(rowNumbers().length).toBeGreaterThan(0);
    expect(screen.getByTestId("library-table-count")).toHaveTextContent(/of 211 games/);
  });
});

describe("the opening-moves filter", () => {
  const RICH = [
    '[Event "Spring Open"]\n[White "Carlsen"]\n[Black "Nepo"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nf6 1-0',
    '[Event "Spring Open"]\n[White "Nepo"]\n[Black "Carlsen"]\n[Result "0-1"]\n\n1. e4 c5 0-1',
    '[Event "Autumn Cup"]\n[White "Ding"]\n[Black "Carlsen"]\n[Result "1/2-1/2"]\n\n1. d4 d5 1/2-1/2',
  ];
  // Two games that share 32 plies before they part — past the 15-move cap the
  // index used to cut lines at (CTA-92), so the tree has to hold them.
  const SHARED_LINE = Array.from({ length: 32 }, (_, index) => ["Nf3", "Nf6", "Ng1", "Ng8"][index % 4]);
  const SHARED_TEXT = `${"1. Nf3 Nf6 2. Ng1 Ng8 ".repeat(8)}17. `;
  const LONG = [
    `[Event "Long"]\n[White "A"]\n[Black "B"]\n[Result "1-0"]\n\n${SHARED_TEXT}e4 e5 *`,
    `[Event "Long"]\n[White "C"]\n[Black "D"]\n[Result "0-1"]\n\n${SHARED_TEXT}d4 d5 *`,
  ];
  const moves = () => within(screen.getByTestId("library-filter-moves"));
  const dropOn = (from: string, to: string) => {
    let accepted: boolean | undefined;
    act(() => {
      accepted = boardOptions().onPieceDrop!({ sourceSquare: from, targetSquare: to });
    });
    return accepted;
  };
  /** One continuation's arrow, from the play-chance overlay over the board. */
  const arrowOn = (from: string) =>
    screen.getByTestId("library-filter-arrows").querySelector(`path[data-from="${from}"]`)!;

  it("draws the whole collection's continuations as play-chance arrows, wide by their share", async () => {
    const rich = await keep("Rich", RICH);
    await mountTable(`/library/${rich.id}`);
    expect(boardOptions().id).toBe("library-filter-board");
    expect(boardOptions().arrows).toBeUndefined(); // the overlay draws them now (CTA-92)
    expect(arrowOn("e2").getAttribute("data-to")).toBe("e4");
    expect(arrowOn("d2").getAttribute("data-to")).toBe("d4");
    // White with the play-chance border — the encoding the repertoires taught.
    expect(arrowOn("e2")).toHaveAttribute("fill", CHANCE_ARROW_FILL_COLOR);
    expect(arrowOn("e2")).toHaveAttribute("stroke", CHANCE_ARROW_BORDER_COLOR);
    // 2 of 3 games played e4: the wider border.
    expect(Number(arrowOn("e2").getAttribute("stroke-width"))).toBeGreaterThan(
      Number(arrowOn("d2").getAttribute("stroke-width")),
    );
    expect(moves().getByTestId("library-filter-move-count-e4")).toHaveTextContent("2 games · 67%");
    expect(moves().getByTestId("library-filter-move-count-d4")).toHaveTextContent("1 game · 33%");
    // Hovering a move takes the hover colour.
    expect(arrowOn("d2")).toHaveAttribute("stroke", CHANCE_ARROW_BORDER_COLOR);
    fireEvent.mouseEnter(moves().getByTestId("library-filter-move-d4"));
    expect(arrowOn("d2")).toHaveAttribute("stroke", HOVERED_NEXT_MOVE_ARROW_COLOR);
  });

  it("narrows the rows to the games that began with the moves played, in the URL", async () => {
    const rich = await keep("Rich", RICH);
    await mountTable(`/library/${rich.id}`);
    fireEvent.click(moves().getByTestId("library-filter-move-e4"));
    expect(rowNumbers()).toEqual(["1", "2"]);
    expect(where()).toBe(`/library/${rich.id}?line=e4`);
    expect(dropOn("c7", "c5")).toBe(true);
    expect(rowNumbers()).toEqual(["2"]);
    expect(where()).toBe(`/library/${rich.id}?line=e4%2Cc5`);
    expect(screen.getByTestId("library-table-count")).toHaveTextContent("1 of 3 games");
    expect(moves().getByTestId("library-filter-moves-line")).toHaveTextContent("1. e4 c5");

    fireEvent.click(moves().getByTestId("library-filter-moves-back"));
    expect(rowNumbers()).toEqual(["1", "2"]);
    fireEvent.click(moves().getByTestId("library-filter-moves-reset"));
    expect(rowNumbers()).toEqual(["1", "2", "3"]);
    expect(where()).toBe(`/library/${rich.id}`);
  });

  it("refuses a move no game played, and a drop off the board", async () => {
    const rich = await keep("Rich", RICH);
    await mountTable(`/library/${rich.id}?line=e4`);
    const position = boardOptions().position;
    expect(dropOn("e7", "e6")).toBe(false);
    expect(dropOn("e7", "e5")).toBe(true);
    expect(rowNumbers()).toEqual(["1"]);
    expect(boardOptions().position).not.toBe(position);
    // Past e5 only game 1 continues, so the tree stops there — the cut (CTA-92):
    // its move is no longer offered, even though the game played it.
    expect(dropOn("g1", "f3")).toBe(false);
    expect(dropOn("b8", null as unknown as string)).toBe(false);
    expect(dropOn("b8", "c6")).toBe(false);
    expect(where()).toContain("line=e4%2Ce5");
  });

  it("sits under the player and side, with the other filters under it", async () => {
    const rich = await keep("Rich", RICH);
    await mountTable(`/library/${rich.id}`);
    const board = screen.getByTestId("library-filter-moves");
    const before = (testId: string) =>
      screen.getByTestId(testId).compareDocumentPosition(board) & Node.DOCUMENT_POSITION_FOLLOWING;
    const after = (testId: string) =>
      screen.getByTestId(testId).compareDocumentPosition(board) & Node.DOCUMENT_POSITION_PRECEDING;
    expect(before("library-filter-player")).toBeTruthy();
    expect(before("library-filter-color")).toBeTruthy();
    expect(after("library-filter-event")).toBeTruthy();
    expect(after("library-table-result")).toBeTruthy();
  });

  it("draws the tree of the games the other filters leave, and Clear takes the line off with them", async () => {
    const rich = await keep("Rich", RICH);
    await mountTable(`/library/${rich.id}?player=carlsen&color=black`);
    // Carlsen as Black: 1. e4 c5 and 1. d4 d5 — 1. e4 is one game, not two.
    expect(moves().getByTestId("library-filter-move-count-e4")).toHaveTextContent("1 game · 50%");
    fireEvent.click(moves().getByTestId("library-filter-move-e4"));
    expect(rowNumbers()).toEqual(["2"]);
    // Past e4 only game 2 continues, so the tree stops — the cut's caption.
    expect(moves().queryByTestId("library-filter-move-c5")).toBeNull();
    expect(moves().queryByTestId("library-filter-move-e5")).toBeNull();
    expect(moves().getByTestId("library-filter-moves-end")).toHaveTextContent("Only one game");
    // Only the moves these games played are taken.
    expect(dropOn("e7", "e5")).toBe(false);
    fireEvent.click(within(screen.getByTestId("library-filters")).getByTestId("library-filter-clear"));
    expect(rowNumbers()).toEqual(["1", "2", "3"]);
    expect(where()).toBe(`/library/${rich.id}`);
  });

  it("keeps the line as written when the other filters leave no game on it", async () => {
    const rich = await keep("Rich", RICH);
    await mountTable(`/library/${rich.id}?line=e4,e5&player=ding`);
    expect(rowNumbers()).toEqual([]);
    expect(where()).toContain("line=e4,e5");
    expect(moves().getByTestId("library-filter-moves-line")).toHaveTextContent("1. e4 e5");
    expect(moves().getByTestId("library-filter-moves-end")).toHaveTextContent("No game the other filters leave");
    expect(boardOptions().arrows).toBeUndefined();
    expect(screen.getByTestId("library-filter-arrows").querySelectorAll("path")).toHaveLength(0);
    // Taking the player off brings the line's games back.
    typeInto("library-filter-player", "");
    expect(rowNumbers()).toEqual(["1"]);
  });

  it("offers continuations past the 15-move cap, and says where the cut lands", async () => {
    const long = await keep("Long", LONG);
    await mountTable(`/library/${long.id}?line=${SHARED_LINE.join(",")}`);
    // 32 plies in — past the cap the lines used to stop at — the games still branch.
    expect(moves().getByTestId("library-filter-moves-line")).toHaveTextContent("16. Ng1 Ng8");
    expect(moves().getByTestId("library-filter-move-e4")).toBeInTheDocument();
    expect(moves().getByTestId("library-filter-move-d4")).toBeInTheDocument();
    expect(moves().getByTestId("library-filter-move-count-e4")).toHaveTextContent("1 game · 50%");
    // One of the two games continues from there, so the tree stops and says so.
    fireEvent.click(moves().getByTestId("library-filter-move-e4"));
    expect(rowNumbers()).toEqual(["1"]);
    expect(moves().queryByTestId("library-filter-move-e5")).toBeNull();
    expect(moves().getByTestId("library-filter-moves-end")).toHaveTextContent(
      "Only one game in the collection goes further here",
    );
  });

  it("still says where the games themselves stopped — no game goes further", async () => {
    const rich = await keep("Rich", RICH);
    await mountTable(`/library/${rich.id}?line=e4,c5`);
    expect(rowNumbers()).toEqual(["2"]);
    expect(moves().getByTestId("library-filter-moves-end")).toHaveTextContent("No game in the collection");
  });

  it("follows a stale line from the URL as far as the games go", async () => {
    const rich = await keep("Rich", RICH);
    await mountTable(`/library/${rich.id}?line=e4,e6,d4`);
    expect(rowNumbers()).toEqual(["1", "2"]);
    expect(moves().getByTestId("library-filter-moves-line")).toHaveTextContent("1. e4");
  });

  it("is not offered where the index has no lines — one from before the column", async () => {
    const rows = GAMES.map((pgn): IndexedRow => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { line, ...row } = indexedRowOf(pgn);
      return row;
    });
    const added = await addCollection("Old", GAMES, rows);
    if (!("collection" in added)) throw new Error("not added");
    await mountTable(`/library/${added.collection.id}?line=e4`);
    expect(screen.queryByTestId("library-filter-moves")).toBeNull();
    expect(rowNumbers()).toEqual(["1", "2", "3"]);
  });
});

describe("picking games to download", () => {
  const RICH = [
    '[Event "Spring Open"]\n[White "Carlsen"]\n[Black "Nepo"]\n[Result "1-0"]\n\n1. e4 e5 1-0',
    '[Event "Spring Open"]\n[White "Nepo"]\n[Black "Carlsen"]\n[Result "0-1"]\n\n1. e4 c5 0-1',
    '[Event "Autumn Cup"]\n[White "Ding"]\n[Black "Carlsen"]\n[Result "1/2-1/2"]\n\n1. d4 d5 1/2-1/2',
  ];

  beforeEach(() => vi.mocked(downloadPgn).mockClear());

  it("picks every game the filters leave, on every page, and downloads them as one PGN", async () => {
    const { games, rows, id } = await keepCarlsen();
    await mountTable(`/library/${id}?opening=B9`);
    const expected = filteredRows(numberedRows(rows), { text: "", result: "", opening: "B9" });
    expect(expected.length).toBeGreaterThan(50);
    // One page shows 50 of them; select-all takes them all.
    expect(rowNumbers()).toHaveLength(50);
    expect(screen.getByTestId("library-picks-download")).toBeDisabled();

    fireEvent.click(within(screen.getByTestId("library-picks-select-all")).getByRole("checkbox"));
    expect(screen.getByTestId("library-picks-selected-count")).toHaveTextContent(`${expected.length} selected`);
    fireEvent.click(screen.getByTestId("library-picks-download"));

    await waitFor(() => expect(downloadPgn).toHaveBeenCalledTimes(1));
    const [stem, pgns] = vi.mocked(downloadPgn).mock.calls[0];
    expect(stem).toBe(`carlsen-${expected.length}-games`);
    // Collection order, each game exactly as the collection holds it.
    expect(pgns).toEqual(expected.map((row) => games[row.number - 1]));
  }, 60_000);

  it("picks one game from its row without opening it, and keeps picks across filters", async () => {
    const rich = await keep("Rich", RICH);
    await mountTable(`/library/${rich.id}`);
    fireEvent.click(within(screen.getByTestId("library-picks-row-3")).getByRole("checkbox"));
    expect(where()).toBe(`/library/${rich.id}`);
    expect(screen.getByTestId("library-picks-selected-count")).toHaveTextContent("1 selected");

    // Filter to the Spring Open: select-all adds its two games to the pick.
    typeInto("library-filter-event", "Spring Open");
    fireEvent.click(await screen.findByRole("option", { name: "Spring Open" }));
    expect(rowNumbers()).toEqual(["1", "2"]);
    const selectAll = () => within(screen.getByTestId("library-picks-select-all")).getByRole("checkbox");
    fireEvent.click(selectAll());
    expect(screen.getByTestId("library-picks-selected-count")).toHaveTextContent("3 selected");
    // Unticking takes out only the games shown.
    fireEvent.click(selectAll());
    expect(screen.getByTestId("library-picks-selected-count")).toHaveTextContent("1 selected");

    fireEvent.click(selectAll());
    fireEvent.click(screen.getByTestId("library-picks-download"));
    await waitFor(() => expect(downloadPgn).toHaveBeenCalledWith("rich-3-games", RICH));
  });
});

describe("analysing the picks (CTA-77)", () => {
  const analyse = () => screen.getByTestId("library-picks-analyse");
  const pick = (number: number) =>
    fireEvent.click(within(screen.getByTestId(`library-picks-row-${number}`)).getByRole("checkbox"));
  // A shipped collection's games are a lazy `?raw` chunk, fetched on the first
  // Analyse; on a cold CI runner under coverage that outlasts the 1s default.
  const notice = () => screen.findByTestId("library-picks-analyse-notice", {}, { timeout: 10_000 });

  it("is offered beside the export bar, and only once a game is picked", async () => {
    const mine = await upload();
    await mountTable(`/library/${mine.id}`);
    expect(analyse()).toHaveTextContent("Analyse");
    expect(analyse()).toBeDisabled();
    pick(1);
    expect(analyse()).toBeEnabled();
  });

  it("saves the picks into one new folder, in collection order, named for the collection and the filters", async () => {
    const mine = await upload();
    await mountTable(`/library/${mine.id}?player=Amy`);
    pick(2);
    pick(1);
    fireEvent.click(analyse());
    // Working: it cannot be clicked twice.
    expect(analyse()).toBeDisabled();

    expect(await notice()).toHaveTextContent("2 games added to Saved analyses, in “Club games — 2 games (Amy)”.");
    const folders = await loadAnalysisFolders();
    expect(folders).toHaveLength(1);
    expect(folders[0]).toMatchObject({ name: "Club games — 2 games (Amy)", parentId: null });
    const saved = await loadSavedAnalyses();
    expect(saved.map((row) => [row.name, row.folderId, row.pgn])).toEqual([
      ["Zed – Amy", folders[0].id, GAMES[0]],
      ["Amy – Bob", folders[0].id, GAMES[1]],
    ]);
    expect(saved[0]).toMatchObject({ path: [], orientation: "white" });
    expect(screen.getByTestId("library-picks-analyse-open")).toHaveAttribute(
      "href",
      `/tools/analysis/saved?folder=${folders[0].id}`,
    );
    // The picks stay as they were.
    expect(screen.getByTestId("library-picks-selected-count")).toHaveTextContent("2 selected");
    expect(analyse()).toBeEnabled();
  });

  it("leaves out a game the index could not read, and says so", async () => {
    const mine = await keep("Mixed", [GAMES[0], '[White "Broken"]\n[Black "Game"]\n\n1. e4 Zz9 *']);
    await mountTable(`/library/${mine.id}`);
    expect(screen.getByTestId("library-table-unreadable-2")).toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId("library-picks-select-all")).getByRole("checkbox"));
    fireEvent.click(analyse());

    expect(await notice()).toHaveTextContent(
      "1 game added to Saved analyses, in “Mixed — 1 game”. 1 game could not be read and was left out.",
    );
    expect((await loadSavedAnalyses()).map((row) => row.pgn)).toEqual([GAMES[0]]);
  });

  it("works on a shipped collection too", async () => {
    await mountTable("/library/morphy?sort=number");
    pick(1);
    fireEvent.click(analyse());
    expect(await notice()).toHaveTextContent("1 game added to Saved analyses, in “Morphy — 1 game”.");
    const [saved] = await loadSavedAnalyses();
    expect(saved.pgn).toBe((peekShippedGames("morphy") ?? [])[0].trim());
    expect(saved.name).toBe("Morphy, Paul – Morphy, Alonzo");
  });

  it("says why, and leaves nothing behind, when no folder can be made", async () => {
    for (let index = 0; index < MAX_ANALYSIS_FOLDERS; index += 1) {
      await createAnalysisFolder(`F${index}`, null);
    }
    const mine = await upload();
    await mountTable(`/library/${mine.id}`);
    pick(1);
    fireEvent.click(analyse());
    expect(await notice()).toHaveTextContent(`at most ${MAX_ANALYSIS_FOLDERS} folders`);
    expect(await loadSavedAnalyses()).toEqual([]);
    expect(screen.queryByTestId("library-picks-analyse-open")).toBeNull();
  });

  it("takes the folder back out when the games cannot be stored", async () => {
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      // The analyses' records carry a PGN; the folder's does not.
      if ((value as { value?: { pgn?: string } }).value?.pgn !== undefined) {
        throw new DOMException("full", "QuotaExceededError");
      }
      return put.call(this, value, key);
    });
    const mine = await upload();
    await mountTable(`/library/${mine.id}`);
    pick(1);
    fireEvent.click(analyse());
    expect(await notice()).toHaveTextContent("storage may be full");
    vi.restoreAllMocks();
    expect(await loadAnalysisFolders()).toEqual([]);
    expect(await loadSavedAnalyses()).toEqual([]);
  });
});

describe("adding a collection", () => {
  it("checks every game of a pasted text, then keeps it as a new collection named by its Event", async () => {
    mount("/library/new");
    fireEvent.change(screen.getByTestId("library-upload-paste"), {
      target: { value: GAMES.join("\n\n") },
    });
    fireEvent.click(screen.getByTestId("library-upload-save"));
    expect(screen.getByTestId("library-upload-indexing")).toBeInTheDocument();

    await waitFor(() => expect(where()).toMatch(/^\/library\/u/));
    const [added] = await loadUploadedCollections();
    expect(added).toMatchObject({ name: "Club", count: 3 });
    expect(where()).toBe(`/library/${added.id}`);
    expect(peekUploadedGames(added.id)).toEqual(GAMES);
    expect(await screen.findByTestId("library-table-count")).toHaveTextContent("3 games");
  });

  it("keeps nothing when the check is cancelled", async () => {
    mount("/library/new");
    fireEvent.change(screen.getByTestId("library-upload-paste"), {
      target: { value: Array.from({ length: 300 }, (_, index) => GAMES[index % 3]).join("\n\n") },
    });
    fireEvent.click(screen.getByTestId("library-upload-save"));
    await waitFor(() =>
      expect(screen.getByTestId("library-upload-progress")).not.toHaveTextContent("Checking games… 0 of"),
    );
    fireEvent.click(screen.getByTestId("library-upload-cancel"));
    expect(screen.queryByTestId("library-upload-indexing")).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await loadUploadedCollections()).toEqual([]);
    expect(where()).toBe("/library/new");
  });

  it("creates an empty collection from a name, and fills it from its table's Add games", async () => {
    mount("/library/new");
    fireEvent.change(screen.getByTestId("library-upload-name"), { target: { value: "My picks" } });
    fireEvent.click(screen.getByTestId("library-upload-empty"));

    await waitFor(() => expect(where()).toMatch(/^\/library\/u/));
    const [empty] = await loadUploadedCollections();
    expect(empty).toMatchObject({ name: "My picks", count: 0 });
    expect(await screen.findByTestId("library-table-empty")).toHaveTextContent(
      i18n.t("library.table.noGames"),
    );

    fireEvent.click(screen.getByTestId("library-table-add-games"));
    expect(where()).toBe(`/library/new?into=${empty.id}`);
    expect(await screen.findByTestId("library-upload-title")).toHaveTextContent("Add games to My picks");
    expect(screen.queryByTestId("library-upload-name")).toBeNull();
    expect(screen.queryByTestId("library-upload-empty")).toBeNull();
    fireEvent.change(screen.getByTestId("library-upload-paste"), { target: { value: GAMES.slice(0, 2).join("\n\n") } });
    fireEvent.click(screen.getByTestId("library-upload-save"));

    await waitFor(() => expect(where()).toBe(`/library/${empty.id}`));
    expect(peekUploadedGames(empty.id)).toEqual(GAMES.slice(0, 2));
    expect(await screen.findByTestId("library-table-count")).toHaveTextContent("2 games");

    // Again: the next games go at the end, and the name stays the reader's.
    cleanupAndMount(`/library/new?into=${empty.id}`);
    fireEvent.change(await screen.findByTestId("library-upload-paste"), { target: { value: GAMES[2] } });
    fireEvent.click(screen.getByTestId("library-upload-save"));
    await waitFor(() => expect(peekUploadedGames(empty.id)).toEqual(GAMES));
    expect((await loadUploadedCollections())[0]).toMatchObject({ name: "My picks", count: 3 });
  });

  it("names an empty collection for the reader when no name is typed", async () => {
    mount("/library/new");
    fireEvent.click(screen.getByTestId("library-upload-empty"));
    await waitFor(() => expect(where()).toMatch(/^\/library\/u/));
    expect((await loadUploadedCollections())[0].name).toBe("New collection");
  });

  it("adds games only to the reader's own collections", async () => {
    mount("/library/bucharest2023");
    await screen.findByTestId("library-table");
    expect(screen.queryByTestId("library-table-add-games")).toBeNull();
    cleanupAndMount("/library/new?into=bucharest2023");
    expect(await screen.findByTestId("library-not-found")).toBeInTheDocument();
    cleanupAndMount("/library/new?into=nothing-here");
    expect(await screen.findByTestId("library-not-found")).toBeInTheDocument();
  });

  it("says why a text was not taken", async () => {
    mount("/library/new");
    fireEvent.change(screen.getByTestId("library-upload-paste"), { target: { value: "hello" } });
    fireEvent.click(screen.getByTestId("library-upload-save"));
    expect(screen.getByTestId("library-upload-problem")).toHaveTextContent(
      i18n.t("library.upload.problem.unreadable"),
    );
    expect(await loadUploadedCollections()).toEqual([]);
  });
});

describe("a game on its analysis board", () => {
  it("hands the game to the Analysis Board from its Export tab, at the position on screen", async () => {
    const mine = await upload();
    await mountGame(`/library/${mine.id}/1?at=e4`);
    expect(screen.getByTestId("library-game-arrows")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("library-game-panel-tab-export"));
    expect(screen.getByTestId("library-game-open-analysis")).toHaveAttribute(
      "href",
      `/tools/analysis?game=library%2F${mine.id}%2F1&at=e4`,
    );
  });

  it("switches the next-move arrows from its Moves tab", async () => {
    const mine = await upload();
    await mountGame(`/library/${mine.id}/1`);
    expect(boardOptions().arrows).toHaveLength(1);
    fireEvent.click(screen.getByTestId("library-game-arrows"));
    expect(boardOptions().arrows).toEqual([]);
    fireEvent.click(screen.getByTestId("library-game-panel-tab-engine"));
    // The Moves tab stays mounted, hidden; the Engine tab has no switch of its own.
    expect(screen.getAllByTestId("library-game-arrows")).toHaveLength(1);
    expect(screen.getByTestId("library-game-arrows")).not.toBeVisible();
  });

  it("is the v2 board, with the explorer's tabs and the engine", async () => {
    const mine = await upload();
    await mountGame(`/library/${mine.id}/1`);
    expect(screen.getByTestId("library-game-board")).toBeInTheDocument();
    expect(boardOptions().id).toBe("library-game");
    for (const tab of ["moves", "map", "info", "export", "engine"]) {
      expect(screen.getByTestId(`library-game-panel-tab-${tab}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId("library-game-play")).toBeInTheDocument();
    expect(screen.getByTestId("library-game-caption")).toHaveTextContent("Game 1 of 3");
    expect(screen.getByTestId("library-game-previous")).toHaveAttribute("aria-disabled", "true");
  });

  it("updates an uploaded game in place", async () => {
    const mine = await upload();
    await mountGame(`/library/${mine.id}/1?at=e4,e5`);
    expect(boardOptions().position).toBe(AFTER_E4_E5);
    expect(screen.getByTestId("library-game-save")).toBeDisabled();

    drag("g1", "f3");
    fireEvent.click(screen.getByTestId("library-game-save"));
    fireEvent.click(screen.getByTestId("library-game-changes-update"));

    await waitFor(() => expect(peekUploadedGames(mine.id)?.[0]).toContain("2. Nf3"));
    expect(peekUploadedGames(mine.id)).toHaveLength(3);
    await waitFor(() => expect(screen.getByTestId("library-game-save")).toBeDisabled());
  });

  it("saves an uploaded game's copy right after it, and goes on in the copy", async () => {
    const mine = await upload();
    await mountGame(`/library/${mine.id}/1?at=e4,e5`);
    drag("g1", "f3");
    fireEvent.click(screen.getByTestId("library-game-save"));
    fireEvent.click(screen.getByTestId("library-game-changes-copy"));

    await waitFor(() => expect(where()).toContain(`/library/${mine.id}/2`));
    const games = peekUploadedGames(mine.id) ?? [];
    expect(games).toHaveLength(4);
    expect(games[0]).toBe(GAMES[0]);
    expect(games[1]).toContain("2. Nf3");
    expect(where()).toBe(`/library/${mine.id}/2?at=e4%2Ce5%2CNf3`);
  });

  it("keeps a shipped game read-only: its copy goes to Saved analyses", async () => {
    await mountGame("/library/morphy/1");
    drag("e2", "e4");
    drag("c7", "c5");
    fireEvent.click(screen.getByTestId("library-game-save"));

    expect(screen.getByTestId("library-game-changes-read-only")).toBeInTheDocument();
    expect(screen.queryByTestId("library-game-changes-update")).toBeNull();
    fireEvent.click(screen.getByTestId("library-game-changes-copy"));

    await waitFor(() => expect(where()).toContain("/tools/analysis?analysis="));
    const [copy] = savedAnalysesSnapshot() ?? [];
    expect(copy.name).toBe("Morphy, Paul – Morphy, Alonzo (copy)");
    expect(findSavedAnalysis(copy.id)?.pgn).toContain("1... c5");
    expect(where()).toBe(`/tools/analysis?analysis=${copy.id}`);
  });

  it("discards the changes back to the game as it arrived", async () => {
    const mine = await upload();
    await mountGame(`/library/${mine.id}/1?at=e4,e5`);
    drag("g1", "f3");
    fireEvent.click(screen.getByTestId("library-game-save"));
    fireEvent.click(screen.getByTestId("library-game-changes-discard"));
    expect(boardOptions().position).toBe(AFTER_E4_E5);
    expect(peekUploadedGames(mine.id)?.[0]).toBe(GAMES[0]);
  });

  it("opens at the game's StartPly tag when no ?at= says otherwise", async () => {
    const puzzles = await keep("Puzzles", ['[StartPly "2"]\n[White "A"]\n[Black "B"]\n\n1. e4 e5 2. Nf3 *']);
    await mountGame(`/library/${puzzles.id}/1`);
    expect(boardOptions().position).toBe(AFTER_E4_E5);
  });

  it("says so for a game number the collection does not have", async () => {
    const mine = await upload();
    mount(`/library/${mine.id}/9`);
    expect(await screen.findByTestId("library-not-found")).toHaveTextContent(
      i18n.t("library.notFound.game"),
    );
  });
});
