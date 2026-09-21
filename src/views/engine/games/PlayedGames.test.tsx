import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import i18n from "../../../i18n";
import { DEFAULT_ENGINE_SETTINGS } from "../../../lib/engineSettings";
import { parsePgnTree } from "../../../lib/pgn";
import { playedGamesSnapshot, savePlayedGame } from "../../../lib/playedGameStore";
import { playedGameOf } from "../../../lib/playedGames";
import AppThemeWithLang from "../../../theme/AppThemeWithLang";
import { RightPanelOutlet, RightPanelProvider } from "../../main/rightPanel";
import PlayedGames from "./PlayedGames";

/*
  The Saved games list of Play with Engine v2 (CTA-74): flat, newest first,
  and each row's Continue, Analysis and asked-first delete.
*/

const mount = () =>
  render(
    <AppThemeWithLang>
      <MemoryRouter initialEntries={["/engine/games"]}>
        <RightPanelProvider>
          <PlayedGames />
          <RightPanelOutlet />
        </RightPanelProvider>
      </MemoryRouter>
    </AppThemeWithLang>,
  );

const store = (id: string, pgn: string, playAs: "white" | "black" = "white") =>
  savePlayedGame(
    playedGameOf(id, parsePgnTree(pgn), [], { ...DEFAULT_ENGINE_SETTINGS, playAs, skillLevel: 5 }),
  );

beforeEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage("en");
});

describe("Saved games (v2) — the list", () => {
  it("says so when there is nothing yet", () => {
    mount();
    expect(screen.getByTestId("played-games-empty")).toBeInTheDocument();
    expect(screen.getByTestId("played-games-count")).toHaveTextContent("Games: 0");
  });

  it("lists the games newest first, each with its side, length, side lines and level", () => {
    store("a", "1. e4 (1. d4) 1... e5 *");
    store("b", "1. d4 d5 *", "black");
    mount();

    const rows = screen.getAllByTestId(/^played-games-item-/);
    expect(rows.map((row) => row.dataset.testid)).toEqual([
      "played-games-item-b",
      "played-games-item-a",
    ]);
    expect(rows[0]).toHaveTextContent("You played Black");
    expect(screen.getByTestId("played-games-caption-a")).toHaveTextContent(
      /1 move · 1 side line · In progress · Level 5/,
    );
  });

  it("continues a game on Play with Engine, and hands it to the Analysis Board", () => {
    store("a", "1. e4 *");
    mount();
    expect(screen.getByTestId("played-games-continue-a")).toHaveAttribute(
      "href",
      "/engine/play?saved=a",
    );
    expect(screen.getByTestId("played-games-analysis-a")).toHaveAttribute(
      "href",
      `/tools/analysis?game=${encodeURIComponent("play/games/a")}`,
    );
  });

  it("deletes a game only once asked", () => {
    store("a", "1. e4 *");
    mount();
    fireEvent.click(screen.getByTestId("played-games-remove-a"));
    expect(playedGamesSnapshot()).toHaveLength(1);
    fireEvent.click(screen.getByTestId("played-games-delete-confirm"));
    expect(playedGamesSnapshot()).toHaveLength(0);
    expect(screen.getByTestId("played-games-empty")).toBeInTheDocument();
  });

  it("points at the old list, whose games are not here", () => {
    mount();
    expect(screen.getByTestId("played-games-old-link")).toHaveAttribute("href", "/engine/saved");
  });
});
