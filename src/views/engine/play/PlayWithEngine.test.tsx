import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";

import i18n from "../../../i18n";
import { DEFAULT_ENGINE_SETTINGS } from "../../../lib/engineSettings";
import { parsePgnGame, parsePgnTree } from "../../../lib/pgn";
import { findPlayedGame, playedGamesSnapshot, savePlayedGame } from "../../../lib/playedGameStore";
import { playedGameOf } from "../../../lib/playedGames";
import { saveGame } from "../../../lib/savedGameStore";
import { savedGameOf } from "../../../lib/savedGames";
import AppThemeWithLang from "../../../theme/AppThemeWithLang";
import { boardOptions, FakeEngine } from "../../dev/devTestHarness";
import { RightPanelOutlet, RightPanelProvider } from "../../main/rightPanel";

vi.mock("../../../lib/engine", async () => ({
  default: (await import("../../dev/devTestHarness")).FakeEngine,
}));

vi.mock("react-chessboard", async () => {
  const { reactChessboardMock } = await import("../../dev/devTestHarness");
  return reactChessboardMock();
});

vi.mock("../../../lib/openings", async (importOriginal) => {
  const { openingsMock } = await import("../../dev/devTestHarness");
  return openingsMock(
    importOriginal as () => Promise<typeof import("../../../lib/openings")>,
  );
});

import PlayWithEngine from "./PlayWithEngine";

/*
  Play with Engine, v2 (CTA-74): a new board with Play on, the engine playing
  the side not at the bottom, pausing on a step back or a change of side, side
  lines from an earlier position, the autosave to the played-games store, and
  the `?fen=` / `?saved=` arrivals (the old store's ids too). The shared panel
  and square are asserted with the other v2 boards (`devBoards.test.tsx`,
  `devPanelPropagation.test.tsx`).
*/

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
const AFTER_E4_E5 = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
const AFTER_D4 = "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1";

function Where() {
  const location = useLocation();
  return <div data-testid="where">{`${location.pathname}${location.search}`}</div>;
}

const mount = (entry = "/engine/play") =>
  render(
    <AppThemeWithLang>
      <MemoryRouter initialEntries={[entry]}>
        <RightPanelProvider>
          <Routes>
            <Route path="/engine/play" element={<PlayWithEngine />} />
            <Route path="*" element={<div data-testid="elsewhere" />} />
          </Routes>
          <Where />
          <RightPanelOutlet />
        </RightPanelProvider>
      </MemoryRouter>
    </AppThemeWithLang>,
  );

const where = () => screen.getByTestId("where").textContent ?? "";

const drag = (from: string, to: string) => {
  let accepted = false;
  act(() => {
    accepted = boardOptions().onPieceDrop!({ sourceSquare: from, targetSquare: to });
  });
  return accepted;
};

/** End the search for the position on screen with a line and a bestmove. */
const engineSearches = (pv: string) => {
  const engine = FakeEngine.latest();
  const fen = engine.lastSearch;
  act(() => {
    engine.say({ fen, uciMessage: "info", depth: 12, multipv: 1, positionEvaluation: "20", pv });
  });
  act(() => {
    engine.say({ fen, uciMessage: "bestmove", bestMove: pv.split(" ")[0] });
  });
};

const playButton = () => screen.getByTestId("play-with-engine-play");
const isPlaying = () => playButton().getAttribute("aria-pressed") === "true";
const click = (testId: string) => fireEvent.click(screen.getByTestId(testId));

beforeEach(async () => {
  localStorage.clear();
  FakeEngine.reset();
  await i18n.changeLanguage("en");
});

describe("Play with Engine — a new game", () => {
  it("opens on the standard start, the reader on White, the engine on and Play on", () => {
    mount();
    expect(boardOptions().id).toBe("play-with-engine");
    expect(boardOptions().position).toBe(START);
    expect(boardOptions().boardOrientation).toBe("white");
    expect(
      screen.getByTestId("play-with-engine-setting-engine").querySelector("input"),
    ).toBeChecked();
    expect(isPlaying()).toBe(true);
    expect(screen.getByTestId("play-with-engine-play-status")).toHaveAttribute(
      "data-status",
      "your-move",
    );
  });

  it("opens a ?fen= with Black to move with the reader on Black, the board turned", () => {
    mount(`/engine/play?fen=${encodeURIComponent(AFTER_E4)}`);
    expect(boardOptions().position).toBe(AFTER_E4);
    expect(boardOptions().boardOrientation).toBe("black");
    expect(isPlaying()).toBe(true);
    expect(screen.getByTestId("play-with-engine-play-status")).toHaveAttribute(
      "data-status",
      "your-move",
    );
  });

  it("ignores an unreadable ?fen=", () => {
    mount("/engine/play?fen=nonsense");
    expect(boardOptions().position).toBe(START);
  });
});

describe("Play with Engine — the engine plays the other side", () => {
  it("answers the reader's move, and never plays the reader's side", () => {
    mount();
    // A search of the start finished: it is the reader's turn, so nothing moves.
    engineSearches("e2e4 e7e5");
    expect(boardOptions().position).toBe(START);

    expect(drag("e2", "e4")).toBe(true);
    expect(screen.getByTestId("play-with-engine-play-status")).toHaveAttribute(
      "data-status",
      "thinking",
    );
    expect(screen.getByTestId("play-with-engine-play-spinner")).toBeInTheDocument();
    engineSearches("e7e5 g1f3");
    expect(boardOptions().position).toBe(AFTER_E4_E5);
  });

  it("pauses when the reader switches side, and Play then has the engine take White at once", () => {
    mount();
    // The engine searched the start and finished while it was the reader's turn.
    engineSearches("d2d4 d7d5");
    click("board-control-flip");
    expect(boardOptions().boardOrientation).toBe("black");
    expect(isPlaying()).toBe(false);
    expect(boardOptions().position).toBe(START);

    fireEvent.click(playButton());
    expect(isPlaying()).toBe(true);
    // White's turn, a finished search in hand: its move is played at once.
    expect(boardOptions().position).toBe(AFTER_D4);
  });

  it("takes the Engine tab's Play as for the side — the board turns and Play pauses", () => {
    mount();
    click("play-with-engine-panel-tab-engine");
    click("engine-setting-playas-black");
    expect(boardOptions().boardOrientation).toBe("black");
    expect(isPlaying()).toBe(false);
  });

  it("pauses on a step back, and a move by hand there is a side line Play goes on from", () => {
    mount();
    drag("e2", "e4");
    engineSearches("e7e5");
    expect(boardOptions().position).toBe(AFTER_E4_E5);

    click("board-control-first");
    expect(isPlaying()).toBe(false);
    expect(boardOptions().position).toBe(START);

    // By hand, from the start: a side line beside 1. e4.
    expect(drag("d2", "d4")).toBe(true);
    expect(boardOptions().position).toBe(AFTER_D4);
    const moves = screen.getByTestId("play-with-engine-panel-content-moves");
    expect(moves).toHaveTextContent(/e4/);
    expect(moves).toHaveTextContent(/d4/);

    // Play again: the engine answers there, in the side line.
    fireEvent.click(playButton());
    expect(isPlaying()).toBe(true);
    engineSearches("d7d5");
    expect(boardOptions().position).toBe(
      "rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 2",
    );
  });

  it("stops when the engine is switched off", () => {
    mount();
    click("play-with-engine-setting-engine");
    expect(isPlaying()).toBe(false);
    expect(playButton()).toBeDisabled();
  });
});

describe("Play with Engine — the game saves itself", () => {
  it("writes nothing for an untouched board", () => {
    mount();
    expect(playedGamesSnapshot()).toHaveLength(0);
    expect(where()).toBe("/engine/play");
  });

  it("writes the game on every move, and the URL names it", () => {
    mount();
    drag("e2", "e4");
    expect(playedGamesSnapshot()).toHaveLength(1);
    const [game] = playedGamesSnapshot();
    expect(game.path).toEqual(["e4"]);
    expect(game.settings.playAs).toBe("white");
    expect(where()).toBe(`/engine/play?saved=${game.id}`);

    engineSearches("e7e5");
    expect(playedGamesSnapshot()).toHaveLength(1);
    expect(playedGamesSnapshot()[0].path).toEqual(["e4", "e5"]);
    expect(playedGamesSnapshot()[0].pgn).toContain("1. e4 e5");
    // The finished scores ride along, keyed by position.
    expect(playedGamesSnapshot()[0].evals?.some((entry) => entry.fen === AFTER_E4)).toBe(true);
  });

  it("keeps side lines in the record", () => {
    mount();
    drag("e2", "e4");
    click("board-control-first");
    drag("d2", "d4");
    expect(playedGamesSnapshot()[0].pgn).toMatch(/1\. e4 \(1\. d4\)/);
  });

  it("starts a new row on New game, leaving the last one as it was", () => {
    mount();
    drag("e2", "e4");
    const first = playedGamesSnapshot()[0];
    click("play-with-engine-new-game");
    expect(boardOptions().position).toBe(START);
    expect(isPlaying()).toBe(true);
    expect(where()).toBe("/engine/play");

    drag("d2", "d4");
    expect(playedGamesSnapshot()).toHaveLength(2);
    expect(playedGamesSnapshot()[0].id).not.toBe(first.id);
    expect(findPlayedGame(first.id)?.pgn).toBe(first.pgn);
  });
});

describe("Play with Engine — resuming", () => {
  const stored = (pgn: string, path: string[], playAs: "white" | "black") => {
    const record = playedGameOf(
      "p1",
      parsePgnTree(pgn),
      path,
      { ...DEFAULT_ENGINE_SETTINGS, playAs, skillLevel: 7 },
      undefined,
      new Date("2026-01-01T00:00:00Z"),
    );
    savePlayedGame(record);
    return record;
  };

  it("goes on at the node and on the side it was left, at its strength", () => {
    stored("1. e4 e5 2. Nf3 *", ["e4"], "black");
    mount("/engine/play?saved=p1");
    expect(boardOptions().position).toBe(AFTER_E4);
    expect(boardOptions().boardOrientation).toBe("black");
    click("play-with-engine-panel-tab-engine");
    expect(screen.getByText(/Level 7/)).toBeInTheDocument();
  });

  it("re-orders nothing by being opened", () => {
    const record = stored("1. e4 e5 *", ["e4", "e5"], "white");
    mount("/engine/play?saved=p1");
    const after = findPlayedGame("p1");
    expect(after?.pgn).toBe(record.pgn);
    expect(after?.updatedAt).toBe(record.updatedAt);
    expect(where()).toBe("/engine/play?saved=p1");
  });

  it("plays on into the same row", () => {
    stored("1. e4 e5 *", ["e4", "e5"], "white");
    mount("/engine/play?saved=p1");
    drag("g1", "f3");
    expect(playedGamesSnapshot()).toHaveLength(1);
    expect(findPlayedGame("p1")?.path).toEqual(["e4", "e5", "Nf3"]);
  });

  it("resumes a game of the old store at its end, written as a new game once played on", () => {
    saveGame(
      savedGameOf("old1", parsePgnGame("1. e4 e5 *"), { ...DEFAULT_ENGINE_SETTINGS, playAs: "white" }),
    );
    mount("/engine/play?saved=old1");
    expect(boardOptions().position).toBe(AFTER_E4_E5);
    expect(playedGamesSnapshot()).toHaveLength(0);

    drag("g1", "f3");
    expect(playedGamesSnapshot()).toHaveLength(1);
    const [game] = playedGamesSnapshot();
    expect(game.id).not.toBe("old1");
    expect(game.path).toEqual(["e4", "e5", "Nf3"]);
    expect(where()).toBe(`/engine/play?saved=${game.id}`);
  });
});
