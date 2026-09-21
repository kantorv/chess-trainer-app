import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";

import i18n from "../../i18n";
import { indexedRowOf } from "../../lib/collectionIndex";
import {
  addCollection,
  loadUploadedCollections,
  peekUploadedGames,
  resetLibraryCollectionStore,
  uploadedCollectionsSnapshot,
} from "../../lib/libraryCollectionStore";
import { peekShippedGames, peekShippedRows, shippedCollections } from "../../lib/shippedCollections";
import { findSavedAnalysis, savedAnalysesSnapshot } from "../../lib/savedAnalysisStore";
import AppThemeWithLang from "../../theme/AppThemeWithLang";
import { boardOptions, FakeEngine } from "../dev/devTestHarness";
import { RightPanelOutlet, RightPanelProvider } from "../main/rightPanel";

vi.mock("../../lib/engine", async () => ({
  default: (await import("../dev/devTestHarness")).FakeEngine,
}));

vi.mock("react-chessboard", async () => {
  const { reactChessboardMock } = await import("../dev/devTestHarness");
  return reactChessboardMock();
});

vi.mock("../../lib/openings", async (importOriginal) => {
  const { openingsMock } = await import("../dev/devTestHarness");
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
  are asserted with the other v2 boards (`devBoards.test.tsx`,
  `devPanelPropagation.test.tsx`).
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

const keep = async (name: string, games: string[]) => {
  const added = await addCollection(name, games, games.map((pgn) => indexedRowOf(pgn)));
  if (!("collection" in added)) throw new Error("not added");
  return added.collection;
};
const upload = () => keep("Club games", GAMES);

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
    expect(within(screen.getByTestId(`library-collection-${mine.id}`)).getByText("3 games")).toBeInTheDocument();
  });

  it("counts the shipped collections off the manifest, fetching nothing", () => {
    mount("/library");
    // On the first frame, no fetch awaited.
    expect(within(screen.getByTestId("library-collection-morphy")).getByText("211 games")).toBeInTheDocument();
    expect(within(screen.getByTestId("library-collection-worldcup2023")).getByText("674 games")).toBeInTheDocument();
    for (const entry of shippedCollections) {
      expect(peekShippedRows(entry.id)).toBeUndefined();
      expect(peekShippedGames(entry.id)).toBeUndefined();
    }
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
    expect(screen.queryByTestId("library-table-delete")).toBeNull();
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

  it("deletes an uploaded collection, asking first", async () => {
    const mine = await upload();
    await mountTable(`/library/${mine.id}`);
    fireEvent.click(screen.getByTestId("library-table-delete"));
    fireEvent.click(screen.getByTestId("library-delete-confirm"));
    await waitFor(() => expect(where()).toBe("/library"));
    expect(uploadedCollectionsSnapshot()).toEqual([]);
  });

  it("says so for a collection that is not there", async () => {
    mount("/library/nothing-here");
    expect(await screen.findByTestId("library-not-found")).toHaveTextContent(
      i18n.t("library.notFound.collection"),
    );
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

    const [copy] = savedAnalysesSnapshot();
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
