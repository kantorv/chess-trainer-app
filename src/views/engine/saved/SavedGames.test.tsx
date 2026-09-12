import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { Chess } from "chess.js";

import i18n from "../../../i18n";
import AppThemeWithLang from "../../../theme/AppThemeWithLang";
import { DEFAULT_ENGINE_SETTINGS } from "../../../lib/engineSettings";
import { gameFromChess, type Game } from "../../../lib/gameModel";
import { savedGameOf, type SavedGame } from "../../../lib/savedGames";
import { fileSavedGame, saveGame, savedGamesSnapshot } from "../../../lib/savedGameStore";
import {
  createGameFolder,
  findGameFolder,
  gameFoldersSnapshot,
} from "../../../lib/savedGameFolderStore";
import { cardSizeTrack } from "../../library/cardSize";
import { RightPanelOutlet, RightPanelProvider } from "../../main/rightPanel";
import SavedGames from "./SavedGames";

/*
  The board view renders a preview board per card, and `<Chessboard>` measures
  its own square on mount and throws where there is no layout engine
  (`.claude/rules/chessboard.md` §8) — so it is stubbed, and the stub keeps the
  position and the id it was handed, which is what the assertions below read.

  The store is *not* stubbed: it writes to the `localStorage` jsdom provides and
  `src/test/setup.ts` clears between tests, which is the behaviour under test
  rather than something to mock away.
*/
/*
  The opening book is stubbed for the reason every other screen test stubs it:
  the real one is ~3MB of JSON across five chunks, and what is under test is
  that the card prints what the book says, not the book. `findOpening` is left
  real so `openingOfLine`'s own backwards walk still runs over this fixture.
*/
const OPENING = { eco: "C20", name: "King's Pawn Game", moves: "1. e4" };

vi.mock("../../../lib/openings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/openings")>();
  return {
    ...actual,
    // Keyed on the position after 1. e4 — so a game that played it is named and
    // one that opened 1. d4 is not, which is the distinction the tests need.
    loadOpeningBook: () =>
      Promise.resolve({
        "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1": OPENING,
      }),
  };
});

vi.mock("react-chessboard", () => ({
  Chessboard: ({ options }: { options: { id?: string; position?: string } }) => (
    <div
      data-testid={`board-${options.id}`}
      data-position={options.position}
    />
  ),
}));

/*
  The export is mocked at the module boundary rather than through the blob URL:
  what is under test is *what* the screen hands `downloadPgn` — the stems and
  the records — not the browser's save itself, which is the DOM half of
  `lib/pgnExport.ts` and cannot run in jsdom meaningfully anyway.
*/
const { downloadCalls } = vi.hoisted(() => ({
  downloadCalls: [] as { stem: string; pgns: string[] }[],
}));

vi.mock("../../../lib/pgnExport", () => ({
  downloadPgn: (stem: string, pgns: readonly string[]) => {
    downloadCalls.push({ stem, pgns: [...pgns] });
    return true;
  },
}));

const playedGame = (moves: readonly string[]): Game => {
  const chess = new Chess();
  for (const san of moves) chess.move(san);
  return gameFromChess(chess);
};

const save = (
  id: string,
  moves: readonly string[],
  settings: Partial<typeof DEFAULT_ENGINE_SETTINGS> = {},
  now = new Date("2026-09-07T10:00:00.000Z"),
): SavedGame =>
  savedGameOf(
    id,
    playedGame(moves),
    { ...DEFAULT_ENGINE_SETTINGS, ...settings },
    now,
  );

/** Save one game and file it, the way the screen's move control does. */
const saveIn = (id: string, moves: readonly string[], folderId: string | null) => {
  saveGame(save(id, moves));
  if (folderId !== null) fileSavedGame(id, folderId);
};

const renderScreen = () =>
  render(
    <AppThemeWithLang>
      <MemoryRouter initialEntries={["/engine/saved"]}>
        <RightPanelProvider>
          <SavedGames />
          <RightPanelOutlet />
        </RightPanelProvider>
      </MemoryRouter>
    </AppThemeWithLang>,
  );

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

describe("Saved games — the list", () => {
  it("says there is nothing yet on a browser that has played no game", () => {
    renderScreen();

    expect(screen.getByTestId("saved-games-empty")).toBeInTheDocument();
    expect(screen.getByTestId("saved-games-count")).toHaveTextContent("Games: 0");
  });

  it("lists what has been saved, newest first", () => {
    saveGame(save("g1", ["e4"]));
    saveGame(save("g2", ["d4"]));

    renderScreen();

    const rows = screen.getAllByTestId(/^saved-games-item-/);
    expect(rows.map((row) => row.dataset.testid)).toEqual([
      "saved-games-item-g2",
      "saved-games-item-g1",
    ]);
    expect(screen.getByTestId("saved-games-count")).toHaveTextContent("Games: 2");
  });

  it("says which side the reader had, how long the game is and how it stands", () => {
    saveGame(save("g1", ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"], {
      playAs: "black",
      skillLevel: 7,
    }));

    renderScreen();

    const row = screen.getByTestId("saved-games-item-g1");
    expect(row).toHaveTextContent("You played Black");
    expect(row).toHaveTextContent("7 moves");
    expect(row).toHaveTextContent("White won");
    expect(row).toHaveTextContent("Level 7");
  });

  it("calls a game that is still on 'in progress' rather than a result", () => {
    saveGame(save("g1", ["e4", "e5"]));

    renderScreen();

    const row = screen.getByTestId("saved-games-item-g1");
    expect(row).toHaveTextContent("In progress");
    expect(row).toHaveTextContent("2 moves");
  });

  it("says so in Hebrew too, without a key falling through", async () => {
    saveGame(save("g1", ["e4"]));
    await i18n.changeLanguage("he");

    renderScreen();

    expect(screen.getByTestId("saved-games-item-g1")).toHaveTextContent(
      "שיחקתם בלבן",
    );
  });
});

describe("Saved games — where a row goes", () => {
  beforeEach(() => {
    saveGame(save("g1", ["e4", "e5", "Nf3"]));
  });

  it("offers to continue the game against the engine, by its id", () => {
    renderScreen();

    expect(screen.getByTestId("saved-games-continue-g1")).toHaveAttribute(
      "href",
      "/engine/play?saved=g1",
    );
  });

  it("hands the whole game to the Analysis Board and to Load PGN", () => {
    renderScreen();

    /*
      The reference hand-off both those screens already take — a game does not
      fit in a URL, so what travels is a reference into a catalog.
    */
    const reference = encodeURIComponent("engine/saved/g1");
    expect(screen.getByTestId("saved-games-analysis-g1")).toHaveAttribute(
      "href",
      `/tools/analysis?game=${reference}`,
    );
    expect(screen.getByTestId("saved-games-loadpgn-g1")).toHaveAttribute(
      "href",
      `/games/load-pgn?game=${reference}`,
    );
  });

  it("deletes a game, and the list follows without a reload", async () => {
    renderScreen();

    await userEvent.click(screen.getByTestId("saved-games-remove-g1"));

    expect(screen.queryByTestId("saved-games-item-g1")).not.toBeInTheDocument();
    expect(screen.getByTestId("saved-games-empty")).toBeInTheDocument();
  });
});

describe("Saved games — a record that will not read", () => {
  it("still lists it, and offers the one action that means anything", () => {
    saveGame({ ...save("g1", ["e4"]), pgn: "1. Zz9" });

    renderScreen();

    const row = screen.getByTestId("saved-games-item-g1");
    expect(row).toHaveTextContent("This game could not be read.");
    // Nowhere to take it — but it can still be got rid of.
    expect(screen.queryByTestId("saved-games-continue-g1")).not.toBeInTheDocument();
    expect(screen.getByTestId("saved-games-remove-g1")).toBeInTheDocument();
  });

  it("shows the message where the board would be, in the board view", async () => {
    saveGame({ ...save("g1", ["e4"]), pgn: "1. Zz9" });

    renderScreen();
    await userEvent.click(screen.getByTestId("saved-games-view-compact"));

    expect(screen.getByTestId("saved-games-item-g1")).toHaveTextContent(
      "This game could not be read.",
    );
    // No position to draw, so no board — and still deletable.
    expect(screen.queryByTestId("board-saved-games-preview-g1")).not.toBeInTheDocument();
    expect(screen.getByTestId("saved-games-remove-g1")).toBeInTheDocument();
  });
});

describe("Saved games — the boards view", () => {
  it("opens on the list, which is what the screen shipped with", () => {
    saveGame(save("g1", ["e4"]));

    renderScreen();

    expect(screen.getByTestId("saved-games-body")).toBeInTheDocument();
    expect(screen.queryByTestId("saved-games-grid")).not.toBeInTheDocument();
    expect(screen.getByTestId("saved-games-view-list")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("switches to boards, and back to the list", async () => {
    saveGame(save("g1", ["e4"]));
    renderScreen();

    await userEvent.click(screen.getByTestId("saved-games-view-compact"));
    expect(screen.getByTestId("saved-games-grid")).toBeInTheDocument();
    expect(screen.queryByTestId("saved-games-body")).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId("saved-games-view-list"));
    expect(screen.getByTestId("saved-games-body")).toBeInTheDocument();
    expect(screen.queryByTestId("saved-games-grid")).not.toBeInTheDocument();
  });

  it("previews the position the game was left at, not the one it started from", async () => {
    saveGame(save("g1", ["e4", "e5", "Nf3"]));

    renderScreen();
    await userEvent.click(screen.getByTestId("saved-games-view-compact"));

    /*
      Where `LibraryList` previews a game's *first* position, because that is
      where a replay begins. A saved game is one to pick back up, so the card
      shows what the reader will be looking at a click later.
    */
    const board = screen.getByTestId("board-saved-games-preview-g1");
    expect(board).toHaveAttribute(
      "data-position",
      expect.stringContaining("5N2"),
    );
  });

  it("gives each card its own board id, so several can share a page", async () => {
    saveGame(save("g1", ["e4"]));
    saveGame(save("g2", ["d4"]));

    renderScreen();
    await userEvent.click(screen.getByTestId("saved-games-view-comfortable"));

    expect(screen.getByTestId("board-saved-games-preview-g1")).toBeInTheDocument();
    expect(screen.getByTestId("board-saved-games-preview-g2")).toBeInTheDocument();
  });

  it("sizes the grid track from the button that was pressed", async () => {
    saveGame(save("g1", ["e4"]));
    renderScreen();

    await userEvent.click(screen.getByTestId("saved-games-view-compact"));
    expect(screen.getByTestId("saved-games-grid")).toHaveStyle({
      gridTemplateColumns: cardSizeTrack("compact"),
    });

    await userEvent.click(screen.getByTestId("saved-games-view-comfortable"));
    expect(screen.getByTestId("saved-games-grid")).toHaveStyle({
      gridTemplateColumns: cardSizeTrack("comfortable"),
    });
  });

  it("keeps all three destinations on a card", async () => {
    saveGame(save("g1", ["e4", "e5"]));

    renderScreen();
    await userEvent.click(screen.getByTestId("saved-games-view-compact"));

    // The board itself is the continue button — the primary action.
    const reference = encodeURIComponent("engine/saved/g1");
    expect(screen.getByTestId("saved-games-continue-g1")).toHaveAttribute(
      "href",
      "/engine/play?saved=g1",
    );
    expect(screen.getByTestId("saved-games-analysis-g1")).toHaveAttribute(
      "href",
      `/tools/analysis?game=${reference}`,
    );
    expect(screen.getByTestId("saved-games-loadpgn-g1")).toHaveAttribute(
      "href",
      `/games/load-pgn?game=${reference}`,
    );
  });

  it("deletes from the board view too", async () => {
    saveGame(save("g1", ["e4"]));
    renderScreen();
    await userEvent.click(screen.getByTestId("saved-games-view-compact"));

    await userEvent.click(screen.getByTestId("saved-games-remove-g1"));

    expect(screen.queryByTestId("saved-games-item-g1")).not.toBeInTheDocument();
    expect(screen.getByTestId("saved-games-empty")).toBeInTheDocument();
  });

  it("names the opening the game reached, with its ECO code", async () => {
    saveGame(save("g1", ["e4", "e5", "Nf3"]));

    renderScreen();
    await userEvent.click(screen.getByTestId("saved-games-view-compact"));

    // The book loads asynchronously, so the line arrives a tick later.
    const line = await screen.findByTestId("saved-games-opening-g1");
    expect(line).toHaveTextContent("King's Pawn Game · C20");
  });

  it("renders no opening line for a game the book does not name", async () => {
    saveGame(save("g1", ["d4", "d5"]));

    renderScreen();
    await userEvent.click(screen.getByTestId("saved-games-view-compact"));
    // Let the book resolve, so this is "not named" rather than "not loaded yet".
    await screen.findByTestId("board-saved-games-preview-g1");
    await act(async () => {});

    // An unrecognised position is a fact about chess, not an empty row.
    expect(screen.queryByTestId("saved-games-opening-g1")).not.toBeInTheDocument();
  });

  it("keeps the opening off the list view, which has no room for it", async () => {
    saveGame(save("g1", ["e4", "e5"]));

    renderScreen();
    await act(async () => {});

    expect(screen.queryByTestId("saved-games-opening-g1")).not.toBeInTheDocument();
  });

  it("says what each game is on its card, as the list does", async () => {
    saveGame(save("g1", ["e4", "e5"], { playAs: "black", skillLevel: 7 }));

    renderScreen();
    await userEvent.click(screen.getByTestId("saved-games-view-compact"));

    const card = screen.getByTestId("saved-games-item-g1");
    expect(card).toHaveTextContent("You played Black");
    expect(card).toHaveTextContent("2 moves");
    expect(card).toHaveTextContent("In progress");
    expect(card).toHaveTextContent("Level 7");
  });
});

describe("Saved games — the panel", () => {
  it("says plainly that this browser is the only copy", () => {
    renderScreen();

    expect(screen.getByTestId("saved-games-storage-note")).toHaveTextContent(
      "kept in this browser only",
    );
  });
});

/*
  A checkbox's `data-testid` sits on the Checkbox's root, and in jsdom a click
  there never reaches the input — so a row's checkbox is queried by role inside
  its row, and the header's inside its own box. The input is what carries the
  state (and MUI's `data-indeterminate`), and the click is what toggles it.
*/
const rowCheckbox = (id: string) =>
  within(screen.getByTestId(`saved-games-item-${id}`)).getByRole("checkbox");

const selectAllInput = () =>
  within(screen.getByTestId("saved-games-select-all")).getByRole("checkbox");

describe("Saved games — the folder browser", () => {
  /** Two roots, a sub-folder, and games filed at each level. */
  const seedTree = () => {
    const games = createGameFolder("Games", null);
    const e4 = createGameFolder("e4 games", games?.id ?? null);
    const endgames = createGameFolder("Endgames", null);

    saveIn("direct", ["e4"], games?.id ?? null);
    saveIn("nested", ["d4"], e4?.id ?? null);
    saveIn("loose", ["c4"], null);

    return { games: games?.id, e4: e4?.id, endgames: endgames?.id };
  };

  it("shows root folders at the top level, each counting everything under it", () => {
    const ids = seedTree();

    renderScreen();

    // Games' caption counts its whole subtree: the game in it and the one in
    // e4 games — a folder card stands for what is behind the click. e4 games
    // itself is one level down; only the roots are listed here.
    expect(screen.getByTestId(`saved-games-folder-${ids.games}`)).toHaveTextContent(
      "2 games",
    );
    // Endgames has nothing under it: the Unfiled game is an item at the top
    // level, not filed in a folder.
    expect(
      screen.getByTestId(`saved-games-folder-${ids.endgames}`),
    ).toHaveTextContent("0 games");
    // The Unfiled game is an item at the top level, not hidden away.
    expect(screen.getByTestId("saved-games-item-loose")).toBeInTheDocument();
    // No breadcrumb at the top — there is no chain to show.
    expect(
      screen.queryByTestId("saved-games-breadcrumb"),
    ).not.toBeInTheDocument();
  });

  it("drills in and shows that folder's sub-folders and its games", async () => {
    const ids = seedTree();
    renderScreen();

    await userEvent.click(
      screen.getByTestId(`saved-games-folder-open-${ids.games}`),
    );

    // The sub-folder is listed; the Unfiled game is not.
    expect(
      screen.queryByTestId(`saved-games-folder-${ids.e4}`),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("saved-games-item-loose")).not.toBeInTheDocument();
    // The game filed directly here shows; the nested one stays a level down.
    expect(screen.getByTestId("saved-games-item-direct")).toBeInTheDocument();
    expect(screen.queryByTestId("saved-games-item-nested")).not.toBeInTheDocument();
  });

  it("navigates back up by the breadcrumb chain", async () => {
    const ids = seedTree();
    renderScreen();

    await userEvent.click(
      screen.getByTestId(`saved-games-folder-open-${ids.games}`),
    );
    await userEvent.click(
      screen.getByTestId(`saved-games-folder-open-${ids.e4}`),
    );

    // Two levels down: the breadcrumb names the whole chain.
    expect(screen.getByTestId("saved-games-breadcrumb-root")).toBeInTheDocument();
    expect(screen.getByTestId(`saved-games-breadcrumb-${ids.games}`)).toBeInTheDocument();
    expect(screen.getByTestId(`saved-games-breadcrumb-${ids.e4}`)).toHaveTextContent(
      "e4 games",
    );

    await userEvent.click(
      screen.getByTestId(`saved-games-breadcrumb-${ids.games}`),
    );

    // Back at Games, not at the top.
    expect(screen.getByTestId("saved-games-item-direct")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("saved-games-breadcrumb-root"));

    // And the top level again: root folders and the Unfiled game.
    expect(screen.getByTestId(`saved-games-folder-${ids.games}`)).toBeInTheDocument();
    expect(screen.getByTestId("saved-games-item-loose")).toBeInTheDocument();
  });

  it("creates a folder under the folder the reader is standing in", async () => {
    const ids = seedTree();
    renderScreen();

    await userEvent.click(screen.getByTestId("saved-games-new-folder"));
    await userEvent.type(screen.getByTestId("game-folder-name-input"), "New root");
    await userEvent.click(screen.getByTestId("game-folder-name-save"));

    const created = gameFoldersSnapshot().find((f) => f.name === "New root");
    expect(created?.parentId).toBeNull();

    // Inside Games, the same button nests one level down.
    await userEvent.click(
      screen.getByTestId(`saved-games-folder-open-${ids.games}`),
    );
    await userEvent.click(screen.getByTestId("saved-games-new-folder"));
    await userEvent.type(screen.getByTestId("game-folder-name-input"), "New sub");
    await userEvent.click(screen.getByTestId("game-folder-name-save"));

    const sub = gameFoldersSnapshot().find((f) => f.name === "New sub");
    expect(sub?.parentId).toBe(ids.games);
  });

  it("renames a folder in place", async () => {
    const ids = seedTree();
    renderScreen();

    await userEvent.click(
      screen.getByTestId(`saved-games-folder-rename-${ids.games}`),
    );
    const input = screen.getByTestId("game-folder-name-input");
    await userEvent.clear(input);
    await userEvent.type(input, "Renamed");
    await userEvent.click(screen.getByTestId("game-folder-name-save"));

    expect(screen.getByTestId(`saved-games-folder-${ids.games}`)).toHaveTextContent(
      "Renamed",
    );
  });

  it("moves a folder via the dialog, never into its own subtree", async () => {
    const ids = seedTree();
    renderScreen();

    // Move "Games" from the top: Endgames is offered, but e4 games — inside
    // Games' own subtree — is never offered.
    await userEvent.click(
      screen.getByTestId(`saved-games-folder-move-${ids.games}`),
    );
    expect(
      screen.getByTestId(`game-folder-picker-${ids.endgames}`),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId(`game-folder-picker-${ids.e4}`),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId("game-folder-move-cancel"));
    expect(findGameFolder(ids.games)?.parentId).toBeNull();

    // Move "e4 games" (inside Games): Endgames is offered; e4 itself is not.
    await userEvent.click(
      screen.getByTestId(`saved-games-folder-open-${ids.games}`),
    );
    await userEvent.click(
      screen.getByTestId(`saved-games-folder-move-${ids.e4}`),
    );
    expect(
      screen.getByTestId(`game-folder-picker-${ids.endgames}`),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId(`game-folder-picker-${ids.e4}`),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByTestId(`game-folder-picker-${ids.endgames}`),
    );

    expect(findGameFolder(ids.e4)?.parentId).toBe(ids.endgames);
  });

  it("files a game via the move control, and back out to Unfiled", async () => {
    const ids = seedTree();
    renderScreen();

    // The Unfiled game carries the move control; the picker offers both roots.
    await userEvent.click(screen.getByTestId("saved-games-move-loose"));
    expect(
      screen.getByTestId(`game-folder-picker-${ids.games}`),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("game-folder-unfiled"),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByTestId(`game-folder-picker-${ids.endgames}`),
    );

    // Filed — it now shows inside Endgames, not at the top.
    expect(
      gameFoldersSnapshot().find((f) => f.id === ids.endgames),
    ).toBeDefined();
    expect(
      savedGamesSnapshot().find((row) => row.id === "loose")?.folderId,
    ).toBe(ids.endgames);

    await userEvent.click(
      screen.getByTestId(`saved-games-folder-open-${ids.endgames}`),
    );
    expect(screen.getByTestId("saved-games-item-loose")).toBeInTheDocument();

    // And back out: Unfiled is the picker's "none" choice.
    await userEvent.click(screen.getByTestId("saved-games-move-loose"));
    await userEvent.click(screen.getByTestId("game-folder-unfiled"));
    expect(
      savedGamesSnapshot().find((row) => row.id === "loose")?.folderId,
    ).toBeNull();
  });

  it("deletes an empty folder outright, without asking", async () => {
    const empty = createGameFolder("Empty", null);
    renderScreen();

    await userEvent.click(
      screen.getByTestId(`saved-games-folder-delete-${empty?.id}`),
    );

    expect(gameFoldersSnapshot()).toEqual([]);
    expect(
      screen.queryByTestId("game-folder-delete-confirm"),
    ).not.toBeInTheDocument();
  });

  it("asks before deleting a folder with contents, and keeps them", async () => {
    const ids = seedTree();
    renderScreen();

    await userEvent.click(
      screen.getByTestId(`saved-games-folder-delete-${ids.games}`),
    );

    // The dialog states the rule and what is behind the click — everything
    // under Games, directly and not: two games (one in e4 games), one
    // sub-folder.
    expect(screen.getByTestId("game-folder-delete-counts")).toHaveTextContent(
      "2 games",
    );
    expect(screen.getByTestId("game-folder-delete-counts")).toHaveTextContent(
      "1 sub-folders",
    );

    await userEvent.click(screen.getByTestId("game-folder-delete-cancel"));
    expect(findGameFolder(ids.games)).toBeDefined();

    await userEvent.click(
      screen.getByTestId(`saved-games-folder-delete-${ids.games}`),
    );
    await userEvent.click(screen.getByTestId("game-folder-delete-confirm"));

    // The folder is gone; the tree closed up — e4 games re-parented to the
    // top, its game still filed in it.
    expect(findGameFolder(ids.games)).toBeUndefined();
    expect(findGameFolder(ids.e4)?.parentId).toBeNull();
    expect(
      savedGamesSnapshot().find((row) => row.id === "nested")?.folderId,
    ).toBe(ids.e4);
  });

  it("files games filed directly in a deleted folder back to Unfiled", async () => {
    const only = createGameFolder("Only", null);
    saveIn("direct", ["e4"], only?.id ?? null);
    renderScreen();

    await userEvent.click(
      screen.getByTestId(`saved-games-folder-delete-${only?.id}`),
    );
    await userEvent.click(screen.getByTestId("game-folder-delete-confirm"));

    // The game survives, unfiled — it shows at the top level again.
    expect(
      savedGamesSnapshot().find((row) => row.id === "direct")?.folderId,
    ).toBeNull();
    expect(screen.getByTestId("saved-games-item-direct")).toBeInTheDocument();
  });
});

describe("Saved games — export with folders", () => {
  beforeEach(() => {
    downloadCalls.length = 0;
  });

  /** Two root folders, one game in each. */
  const seedTwoFolders = () => {
    const games = createGameFolder("Games", null);
    const endgames = createGameFolder("Endgames", null);
    saveIn("inGames", ["e4"], games?.id ?? null);
    saveIn("inEndgames", ["d4"], endgames?.id ?? null);
    return { games: games?.id, endgames: endgames?.id };
  };

  it("keeps the picks across folder navigation, and select-all in a folder adds to them", async () => {
    const ids = seedTwoFolders();
    renderScreen();

    // Drill into Games and pick its one game.
    await userEvent.click(screen.getByTestId(`saved-games-folder-open-${ids.games}`));
    await userEvent.click(rowCheckbox("inGames"));
    expect(screen.getByTestId("saved-games-selected-count")).toHaveTextContent(
      "1 selected",
    );

    // Back out and into Endgames: the pick persists, the chip stays visible.
    await userEvent.click(screen.getByTestId("saved-games-breadcrumb-root"));
    await userEvent.click(
      screen.getByTestId(`saved-games-folder-open-${ids.endgames}`),
    );
    expect(screen.getByTestId("saved-games-selected-count")).toHaveTextContent(
      "1 selected",
    );

    // Select-all here adds Endgames' game to the picks, not replaces them.
    await userEvent.click(selectAllInput());
    expect(screen.getByTestId("saved-games-selected-count")).toHaveTextContent(
      "2 selected",
    );

    // And the first pick is still ticked back in Games.
    await userEvent.click(screen.getByTestId("saved-games-breadcrumb-root"));
    await userEvent.click(screen.getByTestId(`saved-games-folder-open-${ids.games}`));
    expect(rowCheckbox("inGames")).toBeChecked();
    expect(screen.getByTestId("saved-games-selected-count")).toHaveTextContent(
      "2 selected",
    );
  });

  it("marks select-all indeterminate while only part of the folder is picked", async () => {
    const games = createGameFolder("Games", null);
    saveIn("a1", ["e4"], games?.id ?? null);
    saveIn("a2", ["d4"], games?.id ?? null);

    renderScreen();

    await userEvent.click(
      screen.getByTestId(`saved-games-folder-open-${games?.id}`),
    );
    await userEvent.click(rowCheckbox("a1"));

    // One of this folder's two games is picked — the header box says so,
    // without claiming that all of them are (MUI surfaces the tri-state as an
    // attribute on the input rather than the `.indeterminate` property).
    const selectAll = selectAllInput();
    expect(selectAll).toHaveAttribute("data-indeterminate", "true");
    expect(selectAll).not.toBeChecked();
  });

  it("exports one .pgn of everything under the folder, sub-folders included", async () => {
    const games = createGameFolder("Games", null);
    const e4 = createGameFolder("e4 games", games?.id ?? null);
    const direct = save("direct", ["e4"]);
    const nested = save("nested", ["d4"]);
    saveGame(direct);
    fileSavedGame("direct", games?.id ?? null);
    saveGame(nested);
    fileSavedGame("nested", e4?.id ?? null);
    saveIn("loose", ["c4"], null);

    renderScreen();

    await userEvent.click(
      screen.getByTestId(`saved-games-folder-download-${games?.id}`),
    );

    // One file, named from the folder, holding the subtree's games — the same
    // set the folder's count stands for — and not the Unfiled one. The store
    // is newest first, so the nested game (saved later) leads.
    expect(downloadCalls).toHaveLength(1);
    expect(downloadCalls[0].stem).toBe("games");
    expect(downloadCalls[0].pgns).toEqual([nested.pgn, direct.pgn]);
  });

  it("falls back to a fixed stem for a folder whose name slugs to nothing", async () => {
    // A folder named in Hebrew slugs to empty — `slugify` keeps [a-z0-9] only.
    const hebrew = createGameFolder("משחקים", null);
    saveIn("a1", ["e4"], hebrew?.id ?? null);

    renderScreen();

    await userEvent.click(
      screen.getByTestId(`saved-games-folder-download-${hebrew?.id}`),
    );

    expect(downloadCalls).toHaveLength(1);
    expect(downloadCalls[0].stem).toBe("saved-games");
  });

  it("disables a folder's download when it is empty, and enables one with contents", () => {
    const empty = createGameFolder("Empty", null);
    const full = createGameFolder("Full", null);
    saveIn("a1", ["d4"], full?.id ?? null);

    renderScreen();

    expect(
      screen.getByTestId(`saved-games-folder-download-${empty?.id}`),
    ).toBeDisabled();
    expect(
      screen.getByTestId(`saved-games-folder-download-${full?.id}`),
    ).toBeEnabled();
  });

  it("drops the selection when the view switches to boards", async () => {
    saveIn("a1", ["e4"], null);

    renderScreen();

    await userEvent.click(rowCheckbox("a1"));
    expect(screen.getByTestId("saved-games-selected-count")).toBeInTheDocument();

    // The checkboxes only exist in the list view, and the selection drops with
    // them.
    await userEvent.click(screen.getByTestId("saved-games-view-compact"));
    expect(screen.queryByTestId("saved-games-export")).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId("saved-games-view-list"));
    expect(screen.getByTestId("saved-games-download")).toBeDisabled();
    expect(rowCheckbox("a1")).not.toBeChecked();
  });

  it("shows an empty folder's body once the reader has drilled in", async () => {
    const empty = createGameFolder("Empty", null);
    renderScreen();

    await userEvent.click(
      screen.getByTestId(`saved-games-folder-open-${empty?.id}`),
    );

    expect(screen.getByTestId("saved-games-folder-empty")).toHaveTextContent(
      "This folder is empty.",
    );
    expect(screen.queryByTestId("saved-games-empty")).not.toBeInTheDocument();
  });
});
