import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";

import i18n from "../../../i18n";
import { DEFAULT_ENGINE_SETTINGS } from "../../../lib/engineSettings";
import { parsePgnTree } from "../../../lib/pgn";
import { playedGamesSnapshot, savePlayedGame } from "../../../lib/playedGameStore";
import { playedGameOf } from "../../../lib/playedGames";
import { MASK_PRESETS } from "../../../lib/pieceMask";
import AppThemeWithLang from "../../../theme/AppThemeWithLang";
import { RightPanelOutlet, RightPanelProvider } from "../../main/rightPanel";
import type { OpeningBook } from "../../../lib/openings";
import { FakeEngine } from "../../dev/devTestHarness";
import PlayedGames from "./PlayedGames";

/*
  The engine's Lobby (CTA-82; the Saved games list of CTA-74): the games flat
  and newest first, each row's Continue, Analysis and asked-first delete, the
  colour and opening filters — and the new-game form in the right panel.
*/

// The form handshakes an engine (never searching) for the options it declares.
vi.mock("../../../lib/engine", async () => ({
  default: (await import("../../dev/devTestHarness")).FakeEngine,
}));

/*
  A two-entry book, handed over when the test says so — so "until the book
  lands" is a state a test can stand in.
*/
const book = vi.hoisted(() => ({
  resolve: (() => {}) as (landed: OpeningBook) => void,
  promise: Promise.resolve({} as OpeningBook),
}));
vi.mock("../../../lib/openings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../lib/openings")>()),
  loadOpeningBook: () => book.promise,
}));
const OPENINGS: OpeningBook = {
  "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2": {
    eco: "C20",
    name: "King's Pawn Game",
    moves: "1. e4 e5",
  },
  "rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 2": {
    eco: "D00",
    name: "Queen's Pawn Game",
    moves: "1. d4 d5",
  },
};
const landBook = async () => {
  await act(async () => {
    book.resolve(OPENINGS);
    await book.promise;
  });
};

function Where() {
  const location = useLocation();
  return <div data-testid="where">{`${location.pathname}${location.search}`}</div>;
}

const mount = (entry = "/engine/games") =>
  render(
    <AppThemeWithLang>
      <MemoryRouter initialEntries={[entry]}>
        <RightPanelProvider>
          <PlayedGames />
          <RightPanelOutlet />
          <Where />
        </RightPanelProvider>
      </MemoryRouter>
    </AppThemeWithLang>,
  );

const listed = () =>
  screen.queryAllByTestId(/^played-games-item-/).map((row) => row.dataset.testid?.slice(18));

const store = (id: string, pgn: string, playAs: "white" | "black" = "white") =>
  savePlayedGame(
    playedGameOf(id, parsePgnTree(pgn), [], { ...DEFAULT_ENGINE_SETTINGS, playAs, skillLevel: 5 }),
  );

beforeEach(async () => {
  FakeEngine.reset();
  book.promise = new Promise((resolve) => {
    book.resolve = resolve;
  });
  await i18n.changeLanguage("en");
});

describe("Lobby — the list", () => {
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

describe("Lobby — a masked game (CTA-79)", () => {
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

describe("Lobby — filters (CTA-82)", () => {
  const three = async () => {
    await store("w1", "1. e4 e5 2. Nf3 *", "white");
    await store("b1", "1. e4 e5 *", "black");
    await store("w2", "1. d4 d5 *", "white");
  };
  const pickOpening = (name: string) => {
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Opening" }));
    fireEvent.click(within(screen.getByRole("listbox")).getByRole("option", { name }));
  };

  it("narrows the list to the side the reader played, and says how many of how many", async () => {
    await three();
    mount();
    fireEvent.click(screen.getByTestId("played-games-filter-color-black"));
    expect(listed()).toEqual(["b1"]);
    expect(screen.getByTestId("played-games-count")).toHaveTextContent("Games: 1 of 3");
    expect(screen.getByTestId("where")).toHaveTextContent("/engine/games?color=black");

    fireEvent.click(screen.getByTestId("played-games-filter-color-all"));
    expect(listed()).toEqual(["w2", "b1", "w1"]);
    expect(screen.getByTestId("played-games-count")).toHaveTextContent("Games: 3");
  });

  it("offers the openings the list reached once the book lands, and narrows by one", async () => {
    await three();
    mount();
    // Until the book lands: the filter is off and the list whole.
    expect(screen.getByRole("combobox", { name: "Opening" })).toHaveAttribute("aria-disabled", "true");
    expect(listed()).toHaveLength(3);

    await landBook();
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Opening" }));
    expect(
      within(screen.getByRole("listbox")).getAllByRole("option").map((option) => option.textContent),
    ).toEqual(["All openings", "King's Pawn Game", "Queen's Pawn Game"]);
    fireEvent.click(within(screen.getByRole("listbox")).getByRole("option", { name: "Queen's Pawn Game" }));
    expect(listed()).toEqual(["w2"]);
  });

  it("combines the filters, and says so when nothing is left", async () => {
    await three();
    mount();
    await landBook();
    pickOpening("King's Pawn Game");
    expect(listed()).toEqual(["b1", "w1"]);
    fireEvent.click(screen.getByTestId("played-games-filter-color-white"));
    expect(listed()).toEqual(["w1"]);

    pickOpening("Queen's Pawn Game");
    fireEvent.click(screen.getByTestId("played-games-filter-color-black"));
    expect(listed()).toEqual([]);
    expect(screen.getByTestId("played-games-no-match")).toHaveTextContent(
      "No games match these filters.",
    );
    expect(screen.getByTestId("played-games-count")).toHaveTextContent("Games: 0 of 3");
  });

  it("reads the filters from the URL — the opening only once the book has landed", async () => {
    await three();
    mount(`/engine/games?color=white&opening=${encodeURIComponent("King's Pawn Game")}`);
    expect(listed()).toEqual(["w2", "w1"]);
    await landBook();
    expect(listed()).toEqual(["w1"]);
  });
});

describe("Lobby — the new-game form (CTA-82)", () => {
  const startHref = () =>
    new URLSearchParams(
      screen.getByTestId("new-game-start").getAttribute("href")!.split("?")[1],
    );

  it("renders the Engine tab's controls from the defaults, with the side and Start", async () => {
    mount();
    expect(screen.getByTestId("new-game-form")).toBeInTheDocument();
    expect(screen.getByTestId("engine-settings")).toBeInTheDocument();
    expect(screen.getByText(/Level 10/)).toBeInTheDocument();
    expect(screen.getByTestId("new-game-side-white")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("played-games-storage-note")).toBeInTheDocument();
    // An engine was handshaken for its options, and never asked to search.
    expect(FakeEngine.latest().searches).toEqual([]);

    const start = screen.getByTestId("new-game-start");
    expect(start.getAttribute("href")!.startsWith("/engine/play?")).toBe(true);
    expect(Object.fromEntries(startHref())).toEqual({
      side: "white",
      skill: "10",
      depth: "14",
      movetime: "1000",
      lines: "3",
      threads: "1",
      hash: "16",
      evalbar: "1",
    });
  });

  it("carries the reader's choices on Start's link", async () => {
    mount();
    fireEvent.click(screen.getByTestId("new-game-side-random"));
    fireEvent.click(screen.getByTestId("engine-setting-evalbar"));
    const depth = within(screen.getByTestId("engine-setting-depth")).getByRole("slider");
    fireEvent.change(depth, { target: { value: 9 } });

    const params = startHref();
    expect(params.get("side")).toBe("random");
    expect(params.get("evalbar")).toBe("0");
    expect(params.get("depth")).toBe("9");
  });
});
