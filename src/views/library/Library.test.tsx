import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";

import i18n from "../../i18n";
import {
  addCollection,
  findUploadedCollection,
  uploadedCollectionsSnapshot,
} from "../../lib/libraryCollectionStore";
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
  The Library (CTA-75), through its screens: the collections, a collection's
  table (sorted, filtered, opened), a paste becoming a collection, and a game
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

const upload = () => {
  const added = addCollection("Club games", GAMES);
  if (!("collection" in added)) throw new Error("not added");
  return added.collection;
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
  FakeEngine.reset();
  await i18n.changeLanguage("en");
});

describe("the Library's collections", () => {
  it("lists the three shipped collections, then the reader's uploads", async () => {
    const mine = upload();
    mount("/library");

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
    // A shipped file's count arrives once it has been fetched.
    expect(await within(screen.getByTestId("library-collection-morphy")).findByText("211 games")).toBeInTheDocument();
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

  it("sorts by a column, both ways, and keeps it in the URL", () => {
    const mine = upload();
    mount(`/library/${mine.id}`);
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

  it("filters by words and by result", () => {
    const mine = upload();
    mount(`/library/${mine.id}`);

    fireEvent.change(screen.getByTestId("library-table-filter"), { target: { value: "zed" } });
    expect(rowNumbers()).toEqual(["1", "3"]);
    expect(screen.getByTestId("library-table-count")).toHaveTextContent("2 of 3 games");

    fireEvent.change(screen.getByTestId("library-table-filter"), { target: { value: "nobody" } });
    expect(screen.getByTestId("library-table-empty")).toBeInTheDocument();
  });

  it("opens a game from its row", () => {
    const mine = upload();
    mount(`/library/${mine.id}`);
    fireEvent.click(screen.getByTestId("library-table-row-2"));
    expect(where()).toBe(`/library/${mine.id}/2`);
    expect(screen.getByTestId("library-game-title")).toHaveTextContent("Amy – Bob");
  });

  it("deletes an uploaded collection, asking first", () => {
    const mine = upload();
    mount(`/library/${mine.id}`);
    fireEvent.click(screen.getByTestId("library-table-delete"));
    fireEvent.click(screen.getByTestId("library-delete-confirm"));
    expect(uploadedCollectionsSnapshot()).toEqual([]);
    expect(where()).toBe("/library");
  });

  it("says so for a collection that is not there", () => {
    mount("/library/nothing-here");
    expect(screen.getByTestId("library-not-found")).toHaveTextContent(
      i18n.t("library.notFound.collection"),
    );
  });
});

describe("adding a collection", () => {
  it("makes a pasted text of several games a new collection, named by its Event", () => {
    mount("/library/new");
    fireEvent.change(screen.getByTestId("library-upload-paste"), {
      target: { value: GAMES.join("\n\n") },
    });
    fireEvent.click(screen.getByTestId("library-upload-save"));

    const [added] = uploadedCollectionsSnapshot();
    expect(added).toMatchObject({ name: "Club", games: GAMES });
    expect(where()).toBe(`/library/${added.id}`);
    expect(screen.getByTestId("library-table-count")).toHaveTextContent("3 games");
  });

  it("says why a text was not taken", () => {
    mount("/library/new");
    fireEvent.change(screen.getByTestId("library-upload-paste"), { target: { value: "hello" } });
    fireEvent.click(screen.getByTestId("library-upload-save"));
    expect(screen.getByTestId("library-upload-problem")).toHaveTextContent(
      i18n.t("library.upload.problem.unreadable"),
    );
    expect(uploadedCollectionsSnapshot()).toEqual([]);
  });
});

describe("a game on its analysis board", () => {
  it("is the v2 board, with the explorer's tabs and the engine", () => {
    const mine = upload();
    mount(`/library/${mine.id}/1`);
    expect(screen.getByTestId("library-game-board")).toBeInTheDocument();
    expect(boardOptions().id).toBe("library-game");
    for (const tab of ["moves", "map", "info", "export", "engine"]) {
      expect(screen.getByTestId(`library-game-panel-tab-${tab}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId("library-game-play")).toBeInTheDocument();
    expect(screen.getByTestId("library-game-caption")).toHaveTextContent("Game 1 of 3");
    expect(screen.getByTestId("library-game-previous")).toHaveAttribute("aria-disabled", "true");
  });

  it("updates an uploaded game in place", () => {
    const mine = upload();
    mount(`/library/${mine.id}/1?at=e4,e5`);
    expect(boardOptions().position).toBe(AFTER_E4_E5);
    expect(screen.getByTestId("library-game-save")).toBeDisabled();

    drag("g1", "f3");
    fireEvent.click(screen.getByTestId("library-game-save"));
    fireEvent.click(screen.getByTestId("library-game-changes-update"));

    expect(findUploadedCollection(mine.id)?.games[0]).toContain("2. Nf3");
    expect(findUploadedCollection(mine.id)?.games).toHaveLength(3);
    expect(screen.getByTestId("library-game-save")).toBeDisabled();
  });

  it("saves an uploaded game's copy right after it, and goes on in the copy", () => {
    const mine = upload();
    mount(`/library/${mine.id}/1?at=e4,e5`);
    drag("g1", "f3");
    fireEvent.click(screen.getByTestId("library-game-save"));
    fireEvent.click(screen.getByTestId("library-game-changes-copy"));

    const games = findUploadedCollection(mine.id)?.games ?? [];
    expect(games).toHaveLength(4);
    expect(games[0]).toBe(GAMES[0]);
    expect(games[1]).toContain("2. Nf3");
    expect(where()).toBe(`/library/${mine.id}/2?at=e4%2Ce5%2CNf3`);
  });

  it("keeps a shipped game read-only: its copy goes to Saved analyses", async () => {
    mount("/library/morphy/1");
    await screen.findByTestId("library-game-board");
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

  it("discards the changes back to the game as it arrived", () => {
    const mine = upload();
    mount(`/library/${mine.id}/1?at=e4,e5`);
    drag("g1", "f3");
    fireEvent.click(screen.getByTestId("library-game-save"));
    fireEvent.click(screen.getByTestId("library-game-changes-discard"));
    expect(boardOptions().position).toBe(AFTER_E4_E5);
    expect(findUploadedCollection(mine.id)?.games[0]).toBe(GAMES[0]);
  });

  it("opens at the game's StartPly tag when no ?at= says otherwise", () => {
    const added = addCollection("Puzzles", ['[StartPly "2"]\n[White "A"]\n[Black "B"]\n\n1. e4 e5 2. Nf3 *']);
    if (!("collection" in added)) throw new Error("not added");
    mount(`/library/${added.collection.id}/1`);
    expect(boardOptions().position).toBe(AFTER_E4_E5);
  });

  it("says so for a game number the collection does not have", () => {
    const mine = upload();
    mount(`/library/${mine.id}/9`);
    expect(screen.getByTestId("library-not-found")).toHaveTextContent(
      i18n.t("library.notFound.game"),
    );
  });
});
