import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import i18n from "../../../i18n";
import { DEFAULT_ENGINE_SETTINGS } from "../../../lib/engineSettings";
import { parsePgnTree } from "../../../lib/pgn";
import { playedGamesSnapshot, savePlayedGame } from "../../../lib/playedGameStore";
import { playedGameOf } from "../../../lib/playedGames";
import { MASK_PRESETS } from "../../../lib/pieceMask";
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
  await i18n.changeLanguage("en");
});

describe("Saved games (v2) — the list", () => {
  it("says it is reading until the store's first read lands, then that there is nothing yet", async () => {
    mount();
    expect(screen.getByTestId("played-games-loading")).toBeInTheDocument();
    expect(await screen.findByTestId("played-games-empty")).toBeInTheDocument();
    expect(screen.getByTestId("played-games-count")).toHaveTextContent("Games: 0");
  });

  it("lists the games newest first, titled by the pairing, White first", async () => {
    await store("a", "1. e4 (1. d4) 1... e5 *");
    await store("b", "1. d4 d5 *", "black");
    mount();

    const rows = screen.getAllByTestId(/^played-games-item-/);
    expect(rows.map((row) => row.dataset.testid)).toEqual([
      "played-games-item-b",
      "played-games-item-a",
    ]);
    expect(screen.getByTestId("played-games-title-a")).toHaveTextContent(
      "Human - Stockfish level 5",
    );
    expect(screen.getByTestId("played-games-title-b")).toHaveTextContent(
      "Stockfish level 5 - Human",
    );
  });

  it("gives the length, the side lines and the result as PGN writes it", async () => {
    await store("a", "1. e4 (1. d4) 1... e5 *");
    await store("m", "1. f3 e5 2. g4 Qh4# 0-1");
    mount();
    expect(screen.getByTestId("played-games-caption-a")).toHaveTextContent(
      /^1 move · 1 side line · \* · /,
    );
    expect(screen.getByTestId("played-games-caption-m")).toHaveTextContent(/ · 0-1 · /);
  });

  it("continues a game on Play with Engine, and hands it to the Analysis Board", async () => {
    await store("a", "1. e4 *");
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

  it("deletes a game only once asked", async () => {
    await store("a", "1. e4 *");
    mount();
    fireEvent.click(screen.getByTestId("played-games-remove-a"));
    expect(playedGamesSnapshot()).toHaveLength(1);
    fireEvent.click(screen.getByTestId("played-games-delete-confirm"));
    expect(await screen.findByTestId("played-games-empty")).toBeInTheDocument();
    expect(playedGamesSnapshot()).toHaveLength(0);
  });
});

describe("Saved games — a masked game (CTA-79)", () => {
  it("is marked Masked, continues on Masked Pieces and opens unmasked in Analysis", async () => {
    await store("plain", "1. e4 *");
    await savePlayedGame(
      playedGameOf(
        "m",
        parsePgnTree("1. Nf3 *"),
        [],
        DEFAULT_ENGINE_SETTINGS,
        undefined,
        undefined,
        undefined,
        undefined,
        { pieces: MASK_PRESETS.nonPawns, notation: true },
      ),
    );
    mount();

    expect(screen.getByTestId("played-games-masked-m")).toHaveTextContent("Masked");
    expect(screen.queryByTestId("played-games-masked-plain")).not.toBeInTheDocument();
    expect(screen.getByTestId("played-games-continue-m")).toHaveAttribute(
      "href",
      "/engine/masked?saved=m",
    );
    expect(screen.getByTestId("played-games-continue-plain")).toHaveAttribute(
      "href",
      "/engine/play?saved=plain",
    );
    // The PGN is the true game: the Analysis Board reads it as any other.
    expect(screen.getByTestId("played-games-analysis-m")).toHaveAttribute(
      "href",
      `/tools/analysis?game=${encodeURIComponent("play/games/m")}`,
    );
  });
});
