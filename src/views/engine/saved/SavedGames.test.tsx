import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { Chess } from "chess.js";

import i18n from "../../../i18n";
import AppThemeWithLang from "../../../theme/AppThemeWithLang";
import { DEFAULT_ENGINE_SETTINGS } from "../../../lib/engineSettings";
import { gameFromChess, type Game } from "../../../lib/gameModel";
import { savedGameOf, type SavedGame } from "../../../lib/savedGames";
import { saveGame } from "../../../lib/savedGameStore";
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
