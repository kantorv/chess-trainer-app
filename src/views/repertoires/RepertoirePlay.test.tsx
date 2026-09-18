import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { Chess } from "chess.js";

import i18n from "../../i18n";
import { downloadPgn } from "../../lib/pgnExport";
import { SAVED_REPERTOIRES_STORAGE_KEY } from "../../lib/savedRepertoireStore";
import {
  NEXT_MOVE_ARROW_COLOR,
  SIDELINE_NEXT_MOVE_ARROW_COLOR,
} from "../tools/analysis/nextMoveArrows";
import { boardOptions, FakeEngine } from "../dev/devTestHarness";
import {
  CARO_TWO_GAMES,
  renderSection,
  storeLegacyRepertoire,
  storeRepertoire,
} from "./repertoireTestKit";

/*
  The Play repertoire screen (CTA-63), with the real panel —
  `RepertoirePropagation.test.tsx` is the other half, with the panel replaced
  by a sentinel. The board is stubbed as `chessboard.md` §8 requires (the
  Development section's stand-ins, `defaultPieces` included), the trainer's
  "thinking" delay runs on fake timers, and `Math.random` is pinned so the
  trainer's uniform pick is deterministic.
*/
vi.mock("react-chessboard", async () => {
  const { reactChessboardMock } = await import("../dev/devTestHarness");
  return reactChessboardMock();
});
vi.mock("../../lib/engine", async () => ({
  default: (await import("../dev/devTestHarness")).FakeEngine,
}));
vi.mock("../../lib/openings", async (importOriginal) => {
  const { openingsMock } = await import("../dev/devTestHarness");
  return openingsMock(
    importOriginal as () => Promise<typeof import("../../lib/openings")>,
  );
});
vi.mock("../../lib/pgnExport", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/pgnExport")>()),
  downloadPgn: vi.fn(() => true),
}));

/** `3... Bf5` mainline, `3... c5` a side line: the trainer's one real choice. */
const CARO = [
  '[Event "My Caro"]',
  "",
  "1. e4 c6 2. d4 d5 3. e5 Bf5 (3... c5 4. dxc5) 4. Nf3 *",
].join("\n");

/** The FEN after a line of SANs from the start. */
const fenAfter = (...sans: string[]) => {
  const chess = new Chess();
  for (const san of sans) chess.move(san);
  return chess.fen();
};

const position = () => boardOptions().position;
const status = () => screen.getByTestId("repertoire-play-status").getAttribute("data-status");

/** Mount the screen and let the tree be read (the `setTimeout(0)` parse). */
const mount = (path: string) => {
  renderSection(path);
  act(() => {
    vi.advanceTimersByTime(0);
  });
};

/** The reader drags a piece. */
const drop = (from: string, to: string) =>
  act(() => {
    boardOptions().onPieceDrop!({ sourceSquare: from, targetSquare: to });
  });

/** Open the Settings tab, where the side and the arrows live. */
const openSettings = () =>
  fireEvent.click(screen.getByTestId("repertoire-play-panel-tab-settings"));

/** Switch the engine on — its switch is in the Settings tab. */
const engineOn = () => {
  openSettings();
  fireEvent.click(screen.getByTestId("repertoire-play-setting-engine").querySelector("input")!);
};

/** Long enough for the trainer to have replied, if it is going to. */
const wait = () =>
  act(() => {
    vi.advanceTimersByTime(2_000);
  });

beforeEach(async () => {
  FakeEngine.reset();
  await i18n.changeLanguage("en");
  vi.mocked(downloadPgn).mockClear();
  vi.useFakeTimers();
  // The first of the node's moves — children[0] — every time.
  vi.spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("playing a repertoire against the trainer", () => {
  it("renders on the shared shell, facing the repertoire's main color, engine off", () => {
    mount(`/repertoires/${storeRepertoire("r", CARO, "Caro")}/play`);

    expect(boardOptions().id).toBe("repertoire-play");
    expect(screen.getByTestId("repertoire-play-panel")).toBeInTheDocument();
    expect(screen.getByTestId("repertoire-play-name")).toHaveTextContent("Caro");
    expect(screen.getByTestId("board")).toHaveAttribute("data-orientation", "white");
    // A drill shows no answer until asked: the engine is off — no lines, no
    // bar, no search — and the status row says so.
    expect(screen.queryByTestId("repertoire-play-panel-variations")).not.toBeInTheDocument();
    expect(screen.queryByTestId("eval-bar")).not.toBeInTheDocument();
    expect(FakeEngine.latest().searches).toEqual([]);
    expect(screen.getByTestId("repertoire-play-panel-status")).toHaveTextContent(
      i18n.t("analysis.settings.engineOff"),
    );
    // Moves · Settings · Engine, the Engine tab disabled while its engine is off.
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.getAttribute("data-testid"))).toEqual([
      "repertoire-play-panel-tab-moves",
      "repertoire-play-panel-tab-settings",
      "repertoire-play-panel-tab-engine",
    ]);
    expect(screen.getByTestId("repertoire-play-panel-tab-engine")).toBeDisabled();
    // Its switch is in Settings, and off.
    openSettings();
    expect(
      screen.getByTestId("repertoire-play-setting-engine").querySelector("input"),
    ).not.toBeChecked();
    expect(status()).toBe("your-move");
  });

  it("replies from the repertoire after the reader moves", () => {
    mount(`/repertoires/${storeRepertoire("r", CARO)}/play`);

    drop("e2", "e4");
    expect(status()).toBe("trainer-thinking");
    expect(position()).toBe(fenAfter("e4"));

    wait();
    expect(position()).toBe(fenAfter("e4", "c6"));
    expect(status()).toBe("your-move");
  });

  it("picks among the repertoire's moves, not only the mainline", () => {
    vi.mocked(Math.random).mockReturnValue(0.9);
    mount(`/repertoires/${storeRepertoire("r", CARO)}/play`);

    for (const [from, to] of [["e2", "e4"], ["d2", "d4"], ["e4", "e5"]]) {
      drop(from, to);
      wait();
    }
    // At 3. e5 the repertoire has Bf5 and c5; a draw near 1 takes the second.
    expect(position()).toBe(fenAfter("e4", "c6", "d4", "d5", "e5", "c5"));
  });

  it("moves first when the reader takes Black, and the side toggle restarts", () => {
    mount(`/repertoires/${storeRepertoire("r", CARO)}/play`);
    drop("e2", "e4");
    wait();
    expect(position()).toBe(fenAfter("e4", "c6"));

    openSettings();
    fireEvent.click(screen.getByTestId("repertoire-play-side-black"));
    // Back at the start, facing Black, and the trainer thinking as White.
    expect(position()).toBe(new Chess().fen());
    expect(screen.getByTestId("board")).toHaveAttribute("data-orientation", "black");
    expect(status()).toBe("trainer-thinking");

    wait();
    expect(position()).toBe(fenAfter("e4"));
  });

  it("adds a move the repertoire does not have, marks it, and stays silent after it", () => {
    mount(`/repertoires/${storeRepertoire("r", CARO)}/play`);
    drop("e2", "e4");
    wait();

    // 2. d3 instead of the repertoire's 2. d4: a new side line.
    drop("d2", "d3");
    expect(status()).toBe("out-of-book");
    const added = document.querySelector('[data-san="d3"]');
    expect(added).toHaveAttribute("data-extension", "true");
    // The repertoire's own moves are not marked.
    expect(screen.getByTestId("move-ply-3")).not.toHaveAttribute("data-extension");

    wait();
    expect(position()).toBe(fenAfter("e4", "c6", "d3"));

    // Past the end of the variation the reader moves both colours, and every
    // move extends the repertoire.
    drop("e7", "e5");
    expect(position()).toBe(fenAfter("e4", "c6", "d3", "e5"));
    expect(document.querySelector('[data-san="e5"][data-extension="true"]')).not.toBeNull();
  });

  it("marks an extension of the mainline in the numbered rows", () => {
    mount(`/repertoires/${storeRepertoire("r", CARO)}/play`);
    for (const [from, to] of [["e2", "e4"], ["d2", "d4"], ["e4", "e5"], ["g1", "f3"]]) {
      drop(from, to);
      wait();
    }
    // 4. Nf3 ends the mainline: nothing to answer with.
    expect(status()).toBe("out-of-book");
    drop("e7", "e6");
    expect(screen.getByTestId("move-ply-8")).toHaveAttribute("data-extension", "true");
    expect(screen.getByTestId("move-ply-7")).not.toHaveAttribute("data-extension");
  });

  it("does not reply when the reader merely steps back to the trainer's turn", () => {
    mount(`/repertoires/${storeRepertoire("r", CARO)}/play`);
    drop("e2", "e4");
    wait();
    drop("d2", "d4");
    wait();
    expect(position()).toBe(fenAfter("e4", "c6", "d4", "d5"));

    // Back to after 2. d4 — Black's move there, the trainer's side.
    fireEvent.click(screen.getByTestId("board-control-previous"));
    expect(position()).toBe(fenAfter("e4", "c6", "d4"));
    wait();
    expect(position()).toBe(fenAfter("e4", "c6", "d4"));

    // Stepping away while it thinks cancels the reply.
    fireEvent.click(screen.getByTestId("board-control-first"));
    drop("e2", "e4");
    fireEvent.click(screen.getByTestId("board-control-first"));
    wait();
    expect(position()).toBe(new Chess().fen());
  });

  it("draws no arrows until asked, then the mainline and side lines in two colours", () => {
    mount(`/repertoires/${storeRepertoire("r", CARO)}/play`);
    // Off by default: a drill does not show the answer.
    expect(boardOptions().arrows).toEqual([]);

    openSettings();
    fireEvent.click(screen.getByTestId("repertoire-play-arrows").querySelector("input")!);
    // One continuation is still drawn — unlike the reading boards.
    expect(boardOptions().arrows).toEqual([
      { startSquare: "e2", endSquare: "e4", color: NEXT_MOVE_ARROW_COLOR },
    ]);

    // Add 2. d3 beside the repertoire's 2. d4, then step back to where both hang.
    drop("e2", "e4");
    wait();
    drop("d2", "d3");
    fireEvent.click(screen.getByTestId("board-control-previous"));
    expect(boardOptions().arrows).toEqual([
      { startSquare: "d2", endSquare: "d4", color: NEXT_MOVE_ARROW_COLOR },
      { startSquare: "d2", endSquare: "d3", color: SIDELINE_NEXT_MOVE_ARROW_COLOR },
    ]);

    // And off again.
    fireEvent.click(screen.getByTestId("repertoire-play-arrows").querySelector("input")!);
    expect(boardOptions().arrows).toEqual([]);
  });

  it("shows the best variations once the engine is switched on, and never moves for it", () => {
    mount(`/repertoires/${storeRepertoire("r", CARO)}/play`);
    engineOn();
    expect(screen.getByTestId("repertoire-play-panel-tab-engine")).toBeEnabled();

    const engine = FakeEngine.latest();
    expect(engine.lastSearch).toBe(new Chess().fen());
    act(() => {
      engine.say({
        fen: engine.lastSearch,
        uciMessage: "info",
        depth: 14,
        multipv: 1,
        positionEvaluation: "42",
        pv: "e2e4 e7e5",
      });
    });
    const block = screen.getByTestId("repertoire-play-panel-variations");
    expect(within(block).getByText("+0.42")).toBeInTheDocument();
    expect(screen.getByTestId("eval-bar")).toBeInTheDocument();

    // A bestmove is not a reply: the trainer is the only opponent.
    act(() => {
      engine.say({ fen: engine.lastSearch, uciMessage: "bestmove", bestMove: "e2e4" });
    });
    wait();
    expect(position()).toBe(new Chess().fen());

    // The engine's settings are the other boards' own Engine tab.
    fireEvent.click(screen.getByTestId("repertoire-play-panel-tab-engine"));
    expect(screen.getByTestId("analysis-settings")).toBeInTheDocument();
  });

  it("clears the session's additions from the Engine tab", () => {
    mount(`/repertoires/${storeRepertoire("r", CARO)}/play`);
    drop("e2", "e4");
    wait();
    drop("d2", "d3");
    expect(document.querySelector('[data-san="d3"]')).not.toBeNull();

    engineOn();
    fireEvent.click(screen.getByTestId("repertoire-play-panel-tab-engine"));
    fireEvent.click(screen.getByTestId("analysis-clear"));
    fireEvent.click(screen.getByTestId("repertoire-play-panel-tab-moves"));
    expect(position()).toBe(new Chess().fen());
    expect(document.querySelector('[data-san="d3"]')).toBeNull();
  });

  it("keeps the side and the arrows in a Settings tab beside Moves", () => {
    mount(`/repertoires/${storeRepertoire("r", CARO)}/play`);
    for (const tab of ["moves", "settings"]) {
      expect(screen.getByTestId(`repertoire-play-panel-tab-${tab}`)).toBeInTheDocument();
    }
    // Not in the header any more, and not on screen until the tab is opened.
    const header = screen.getByTestId("repertoire-play-panel-header");
    expect(header.querySelector('[data-testid="repertoire-play-side"]')).toBeNull();
    expect(screen.queryByTestId("repertoire-play-arrows")).not.toBeInTheDocument();

    const list = screen.getByTestId("move-list");
    openSettings();
    expect(screen.getByTestId("repertoire-play-settings")).toBeInTheDocument();
    expect(screen.getByTestId("repertoire-play-side-white")).toHaveAttribute("aria-pressed", "true");
    // The move list is kept mounted, hidden, while Settings shows.
    expect(screen.getByTestId("repertoire-play-panel-content-moves")).not.toBeVisible();

    fireEvent.click(screen.getByTestId("repertoire-play-panel-tab-moves"));
    expect(screen.getByTestId("move-list")).toBe(list);
  });

  describe("game mode", () => {
    const gameModeOn = () => {
      openSettings();
      fireEvent.click(screen.getByTestId("repertoire-play-setting-game").querySelector("input")!);
    };
    const tally = () => [
      screen.getByTestId("repertoire-play-score-successes").textContent,
      screen.getByTestId("repertoire-play-score-failures").textContent,
    ];

    it("brings a Score tab with it, opened, and takes it away again", () => {
      mount(`/repertoires/${storeRepertoire("r", CARO)}/play`);
      expect(screen.queryByTestId("repertoire-play-panel-tab-score")).not.toBeInTheDocument();

      gameModeOn();
      expect(screen.getAllByRole("tab").map((tab) => tab.getAttribute("data-testid"))).toEqual([
        "repertoire-play-panel-tab-moves",
        "repertoire-play-panel-tab-score",
        "repertoire-play-panel-tab-settings",
        "repertoire-play-panel-tab-engine",
      ]);
      expect(screen.getByTestId("repertoire-play-score")).toBeVisible();
      expect(tally()).toEqual(["0", "0"]);
      expect(screen.getByTestId("repertoire-play-score-accuracy")).toHaveTextContent("–");

      openSettings();
      fireEvent.click(screen.getByTestId("repertoire-play-setting-game").querySelector("input")!);
      expect(screen.queryByTestId("repertoire-play-panel-tab-score")).not.toBeInTheDocument();
    });

    it("counts a right move, takes a wrong one back, and counts a position once", () => {
      mount(`/repertoires/${storeRepertoire("r", CARO)}/play`);
      gameModeOn();

      drop("e2", "e4");
      wait();
      expect(tally()).toEqual(["1", "0"]);
      expect(position()).toBe(fenAfter("e4", "c6"));

      // 2. d3 is not the repertoire's move: refused, counted, not added.
      drop("d2", "d3");
      expect(tally()).toEqual(["1", "1"]);
      expect(position()).toBe(fenAfter("e4", "c6"));
      expect(document.querySelector('[data-san="d3"]')).toBeNull();
      expect(status()).toBe("try-again");
      wait();
      expect(position()).toBe(fenAfter("e4", "c6"));

      // Retries at the same position count nothing more, wrong or right.
      drop("c2", "c3");
      drop("d2", "d4");
      expect(tally()).toEqual(["1", "1"]);
      wait();
      expect(position()).toBe(fenAfter("e4", "c6", "d4", "d5"));

      // An illegal drop is not a move at all.
      drop("e4", "e6");
      expect(tally()).toEqual(["1", "1"]);

      // The next position is judged afresh.
      drop("e4", "e5");
      expect(tally()).toEqual(["2", "1"]);
      expect(screen.getByTestId("repertoire-play-score-accuracy")).toHaveTextContent("67%");
    });

    it("judges only inside the repertoire, and counts again after a restart", () => {
      mount(`/repertoires/${storeRepertoire("r", CARO)}/play`);
      gameModeOn();
      for (const [from, to] of [["e2", "e4"], ["d2", "d4"], ["e4", "e5"], ["g1", "f3"]]) {
        drop(from, to);
        wait();
      }
      expect(tally()).toEqual(["4", "0"]);

      // Past the end of the line: free play, extending, not judged.
      drop("e7", "e6");
      expect(tally()).toEqual(["4", "0"]);
      expect(screen.getByTestId("move-ply-8")).toHaveAttribute("data-extension", "true");

      fireEvent.click(screen.getByTestId("repertoire-play-restart"));
      drop("d2", "d4");
      expect(tally()).toEqual(["4", "1"]);

      fireEvent.click(screen.getByTestId("repertoire-play-panel-tab-score"));
      fireEvent.click(screen.getByTestId("repertoire-play-score-reset"));
      expect(tally()).toEqual(["0", "0"]);
    });

    it("leaves moves unjudged, and extensions allowed, while it is off", () => {
      mount(`/repertoires/${storeRepertoire("r", CARO)}/play`);
      drop("e2", "e4");
      wait();
      drop("d2", "d3");
      expect(position()).toBe(fenAfter("e4", "c6", "d3"));
      expect(status()).toBe("out-of-book");
    });
  });

  it("restarts at the start position and keeps the extensions", () => {
    mount(`/repertoires/${storeRepertoire("r", CARO)}/play`);
    drop("e2", "e4");
    wait();
    drop("d2", "d3");

    fireEvent.click(screen.getByTestId("repertoire-play-restart"));
    expect(position()).toBe(new Chess().fen());
    expect(document.querySelector('[data-san="d3"][data-extension="true"]')).not.toBeNull();
  });

  it("downloads the extended tree as PGN, and never touches the saved record", () => {
    storeRepertoire("r", CARO, "My Caro");
    const stored = localStorage.getItem(SAVED_REPERTOIRES_STORAGE_KEY);
    mount("/repertoires/r/play");
    drop("e2", "e4");
    wait();
    drop("d2", "d3");

    fireEvent.click(screen.getByTestId("repertoire-play-download"));
    expect(downloadPgn).toHaveBeenCalledTimes(1);
    const [stem, pgns] = vi.mocked(downloadPgn).mock.calls[0];
    expect(stem).toBe("my-caro");
    expect(pgns).toHaveLength(1);
    // The extension as a side line, the repertoire's own side line kept.
    expect(pgns[0]).toContain("2. d4 (2. d3) 2... d5");
    expect(pgns[0]).toContain("(3... c5 4. dxc5)");

    expect(localStorage.getItem(SAVED_REPERTOIRES_STORAGE_KEY)).toBe(stored);
  });
});

describe("arriving at the play route", () => {
  it("says so for an id this browser does not hold", () => {
    mount("/repertoires/nope/play");
    expect(screen.getByTestId("repertoire-board-missing")).toBeInTheDocument();
  });

  it("sends a record from before the one-game rule to its merge-or-split choice", () => {
    mount(`/repertoires/${storeLegacyRepertoire("old", CARO_TWO_GAMES, "Old")}/play`);
    expect(screen.getByTestId("repertoire-board-multi")).toBeInTheDocument();
    expect(screen.queryByTestId("repertoire-play-panel")).not.toBeInTheDocument();
  });

  it("is reached from the repertoire's board and from its row in the list", () => {
    storeRepertoire("r", CARO);
    mount("/repertoires/r");
    expect(screen.getByTestId("repertoire-board-play")).toHaveAttribute(
      "href",
      "/repertoires/r/play",
    );
  });

  it("is reached from the list", () => {
    storeRepertoire("r", CARO);
    mount("/repertoires");
    expect(screen.getByTestId("repertoires-play-r")).toHaveAttribute(
      "href",
      "/repertoires/r/play",
    );
  });
});
