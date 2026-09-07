import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { Chess } from "chess.js";

import i18n from "../../../i18n";
import AppThemeWithLang from "../../../theme/AppThemeWithLang";
import { DEFAULT_ENGINE_SETTINGS } from "../../../lib/engineSettings";
import { gameFromChess, type Game } from "../../../lib/gameModel";
import { savedGameOf, type SavedGame } from "../../../lib/savedGames";
import { saveGame } from "../../../lib/savedGameStore";
import { RightPanelOutlet, RightPanelProvider } from "../../main/rightPanel";
import SavedGames from "./SavedGames";

/*
  No board is rendered here — the screen is a list — so `react-chessboard` needs
  no stub. What it does need is the store, and that is the real one: it writes to
  the `localStorage` jsdom provides and `src/test/setup.ts` clears between tests,
  which is the behaviour under test rather than something to mock away.
*/

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
});

describe("Saved games — the panel", () => {
  it("says plainly that this browser is the only copy", () => {
    renderScreen();

    expect(screen.getByTestId("saved-games-storage-note")).toHaveTextContent(
      "kept in this browser only",
    );
  });
});
