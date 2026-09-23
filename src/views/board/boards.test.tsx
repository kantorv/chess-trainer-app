import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";

import i18n from "../../i18n";
import AppThemeWithLang from "../../theme/AppThemeWithLang";
import { RightPanelOutlet, RightPanelProvider } from "../main/rightPanel";

/*
  Every board composed from the v2 core, rendered for real (CTA-60's criteria,
  carried on as the boards shipped): the Analysis Board, Play with Engine,
  Masked Pieces (CTA-79), the Library's game board and the Openings explorer.
  (The Development section's own boards, Play v2 and Masked v2, were the last
  there and went with CTA-79.)

  `panelPropagation.test.tsx` is the other half: it replaces the panel with
  a sentinel to prove every board renders *one* component. This file keeps
  the real one and asserts what is inside it — that the shared skeleton's
  parts actually reach every board, that the masked board adds a costume and
  nothing else, and that each board keeps the one thing that is its own.
*/

vi.mock("../../lib/engine", async () => ({
  default: (await import("./boardTestHarness")).FakeEngine,
}));

vi.mock("react-chessboard", async () => {
  const { reactChessboardMock } = await import("./boardTestHarness");
  return reactChessboardMock();
});

vi.mock("../../lib/openings", async (importOriginal) => {
  const { openingsMock } = await import("./boardTestHarness");
  return openingsMock(
    importOriginal as () => Promise<typeof import("../../lib/openings")>,
  );
});

import { boardOptions, FakeEngine } from "./boardTestHarness";
import { loadPlayedGames, playedGamesSnapshot } from "../../lib/playedGameStore";
import AnalysisBoard from "../tools/analysis/AnalysisBoard";
import PlayWithEngine from "../engine/play/PlayWithEngine";
import LibraryGameBoard from "../library/LibraryGameBoard";
import OpeningsBoard from "../openings/OpeningsBoard";
import { parsePgnTree } from "../../lib/pgn";
import MaskedPlay from "../engine/masked/MaskedPlay";


/** A game of an uploaded collection on the Library's board (CTA-75). */
const LIBRARY_FIXTURE = {
  id: "fixture",
  name: "Fixture",
  source: "uploaded" as const,
  games: ['[White "A"]\n[Black "B"]\n\n1. e4 e5 *'],
};
const LibraryGame = () => (
  <LibraryGameBoard
    collection={LIBRARY_FIXTURE}
    number={1}
    tree={parsePgnTree(LIBRARY_FIXTURE.games[0])}
  />
);
const BOARDS: readonly {
  name: string;
  id: string;
  Screen: () => ReactNode;
  /** Whether the pinned engine lines show from the start — all but Masked Pieces. */
  linesShown?: false;
}[] = [
  // Analysis v2 shipped as the Analysis Board (CTA-73); it stays in the set.
  { name: "Analysis Board", id: "analysis", Screen: AnalysisBoard },
  // Play with Engine, a v2 screen since CTA-74.
  { name: "Play with Engine", id: "play-with-engine", Screen: PlayWithEngine },
  { name: "Library game", id: "library-game", Screen: LibraryGame },
  // The Openings explorer (CTA-78), in Openings v2's place.
  { name: "Openings explorer", id: "openings", Screen: OpeningsBoard },
  // Masked Pieces (CTA-79): Play with Engine's screen in a costume — its
  // engine lines wait behind a switch.
  { name: "Masked Pieces", id: "masked-play", Screen: MaskedPlay, linesShown: false },
];

const renderBoard = (Screen: () => ReactNode, entry = "/dev") =>
  render(
    <AppThemeWithLang>
      <MemoryRouter initialEntries={[entry]}>
        <RightPanelProvider>
          <Screen />
          <RightPanelOutlet />
        </RightPanelProvider>
      </MemoryRouter>
    </AppThemeWithLang>,
  );

/** Drag a piece, the way the board would report it. */
const drag = (from: string, to: string) => {
  let accepted = false;
  act(() => {
    accepted = boardOptions().onPieceDrop!({
      sourceSquare: from,
      targetSquare: to,
    });
  });
  return accepted;
};

/** Push one `info` line for the position currently being searched. */
const engineReports = (info: {
  depth: number;
  multipv?: number;
  cp?: number;
  pv: string;
}) => {
  const engine = FakeEngine.latest();
  const fen = engine.lastSearch;
  act(() => {
    engine.say({
      fen,
      uciMessage: "info",
      depth: info.depth,
      multipv: info.multipv,
      positionEvaluation: info.cp === undefined ? undefined : String(info.cp),
      pv: info.pv,
    });
  });
};

/** End the current search with a bestmove, as the wrapper would. */
const engineFinishes = (bestMove: string) => {
  const engine = FakeEngine.latest();
  const fen = engine.lastSearch;
  act(() => {
    engine.say({ fen, uciMessage: "bestmove", bestMove });
  });
};

beforeEach(async () => {
  localStorage.clear();
  FakeEngine.reset();
  await i18n.changeLanguage("en");
});

describe("every v2 board, from the same core", () => {
  it.each(BOARDS)("$name renders the shared board square", ({ id, Screen }) => {
    // Criterion 3: the board, the eval bar and the captured strips are the
    // shared `EngineBoardSquare`'s, reached through `BoardShell` — so the
    // square's own test ids are the same on every board but the prefix.
    const { unmount } = renderBoard(Screen);

    expect(screen.getByTestId(`${id}-screen`)).toBeInTheDocument();
    expect(screen.getByTestId(`${id}-board`)).toBeInTheDocument();
    expect(boardOptions().id).toBe(id);

    unmount();
  });

  it.each(BOARDS)("$name renders the shared panel skeleton", ({ id, Screen }) => {
    const { unmount } = renderBoard(Screen);

    // Criterion 4, rendered for real: the pinned variations block, the status
    // row, the Moves and Engine tabs and the shared board controls.
    expect(screen.getByTestId(`${id}-panel`)).toBeInTheDocument();
    expect(screen.getByTestId(`${id}-panel-status`)).toBeInTheDocument();
    expect(screen.getByTestId(`${id}-panel-tab-moves`)).toBeInTheDocument();
    expect(screen.getByTestId(`${id}-panel-tab-engine`)).toBeInTheDocument();
    expect(screen.getByTestId("board-controls")).toBeInTheDocument();

    unmount();
  });

  it.each(BOARDS.filter((board) => board.linesShown !== false))(
    "$name pins the engine's lines above its tabs",
    ({ id, Screen }) => {
    /*
      CTA-55 on every board, which is the drift this issue closes: before
      CTA-60 this block existed on the Analysis Board alone. The lines are
      pushed through the fake engine, so what is asserted is a real search
      result reaching a real `BestVariations`.
    */
    const { unmount } = renderBoard(Screen);

    engineReports({ depth: 14, multipv: 1, cp: 42, pv: "e2e4 e7e5" });

    const block = screen.getByTestId(`${id}-panel-variations`);
    expect(within(block).getByText("+0.42")).toBeInTheDocument();
    expect(screen.getByTestId(`${id}-panel-status-score`)).toHaveTextContent(
      "+0.42",
    );

    unmount();
    },
  );

  it.each(BOARDS)("$name hides the lines while its engine is off", ({ id, Screen }) => {
    const { unmount } = renderBoard(Screen);

    act(() => {
      screen.getByTestId(`${id}-setting-engine`).click();
    });

    expect(
      screen.queryByTestId(`${id}-panel-variations`),
    ).not.toBeInTheDocument();
    // The status row stays and says so honestly, rather than the block
    // claiming to be waiting for a switch the reader turned off.
    expect(screen.getByTestId(`${id}-panel-status`)).toHaveTextContent(
      i18n.t("analysis.settings.engineOff"),
    );

    unmount();
  });

  it.each(BOARDS)("$name searches the position on screen", ({ Screen }) => {
    const { unmount } = renderBoard(Screen);

    expect(FakeEngine.latest().lastSearch).toBe(boardOptions().position);

    unmount();
  });
});

describe("the Analysis Board (Analysis v2, shipped)", () => {
  it("never moves a piece, whatever the engine says", () => {
    renderBoard(AnalysisBoard);

    const before = boardOptions().position;
    engineReports({ depth: 12, cp: 10, pv: "e2e4" });
    engineFinishes("e2e4");

    // No `onBestMove` is passed, so the branch that plays one does not exist.
    expect(boardOptions().position).toBe(before);
  });

  it("accepts moves for both colours, from any node", () => {
    renderBoard(AnalysisBoard);

    expect(drag("e2", "e4")).toBe(true);
    expect(drag("e7", "e5")).toBe(true);
    // Back to the start, and a different first move: a variation, not an error.
    act(() => {
      screen.getByTestId("board-control-first").click();
    });
    expect(drag("d2", "d4")).toBe(true);
  });
});

describe("Masked Pieces (CTA-79)", () => {
  it("adds a costume and nothing else", () => {
    /*
      The masked board hands the board a `pieces` renderer — the only honest
      place to disguise a piece — and the same composition underneath, which
      is why the true position it reports is identical to Play with Engine's.
    */
    const { unmount } = renderBoard(MaskedPlay);
    expect(boardOptions().pieces).toBeDefined();
    const maskedStart = boardOptions().position;
    // The extra tab, and only one.
    expect(screen.getByTestId("masked-play-panel-tab-masking")).toBeInTheDocument();
    unmount();

    renderBoard(PlayWithEngine);
    expect(boardOptions().pieces).toBeUndefined();
    expect(boardOptions().position).toBe(maskedStart);
    expect(
      screen.queryByTestId("play-with-engine-panel-tab-masking"),
    ).not.toBeInTheDocument();
  });

  it("plays ordinary legal chess underneath the costume", () => {
    renderBoard(MaskedPlay);

    // A knight move the mask draws as a pawn is still a knight move.
    expect(drag("g1", "f3")).toBe(true);
    // And an illegal one is still illegal.
    expect(drag("a1", "a5")).toBe(false);
  });

  it("keeps its engine lines behind a switch, the score chip with them (CTA-91)", () => {
    renderBoard(MaskedPlay);

    engineReports({ depth: 14, multipv: 1, cp: 42, pv: "e2e4 e7e5" });
    expect(screen.queryByTestId("masked-play-panel-variations")).not.toBeInTheDocument();
    // The chip hides with the block: the engine's lines away is the engine's
    // talk away, the number included. The status row itself stays.
    expect(screen.queryByTestId("masked-play-panel-status-score")).not.toBeInTheDocument();
    expect(screen.getByTestId("masked-play-panel-status")).toBeInTheDocument();

    act(() => {
      screen.getByTestId("masked-play-panel-tab-masking").click();
    });
    act(() => {
      screen.getByTestId("mask-setting-lines").querySelector("input")!.click();
    });
    expect(screen.getByTestId("masked-play-panel-variations")).toBeInTheDocument();
    expect(screen.getByTestId("masked-play-panel-status-score")).toHaveTextContent("+0.42");
  });

  it("saves its game with the engine games, costume and all", async () => {
    renderBoard(MaskedPlay);

    expect(drag("e2", "e4")).toBe(true);

    await waitFor(() => expect(playedGamesSnapshot()).toHaveLength(1));
    expect(playedGamesSnapshot()?.[0].mask?.notation).toBe(true);
  });
});

describe("the Openings explorer (CTA-78)", () => {
  it("keeps nothing: no save, and no store written", async () => {
    renderBoard(OpeningsBoard);

    expect(drag("e2", "e4")).toBe(true);
    expect(screen.queryByTestId("openings-save")).not.toBeInTheDocument();
    expect(await loadPlayedGames()).toEqual([]);
  });

  it("carries the book explorer in a tab of its own", () => {
    renderBoard(OpeningsBoard);

    // The book is stubbed empty here, so what is asserted is that the explorer
    // is on screen at all — the slot, not eco.json.
    expect(screen.getByTestId("openings-panel-tab-book")).toBeInTheDocument();
    expect(screen.getByTestId("openings-book")).toBeInTheDocument();
  });
});
