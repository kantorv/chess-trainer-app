import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { Chess } from "chess.js";

import i18n from "../../i18n";
import { boardOptions, FakeEngine } from "../dev/devTestHarness";
import { REQUIRED_MOVE_ARROW_COLOR } from "../tools/analysis/nextMoveArrows";
import { BACKTRACK_DELAY_MS } from "./RepertoirePlayer";
import {
  CARO_TWO_GAMES,
  renderSection,
  storeLegacyRepertoire,
  storeRepertoire,
} from "./repertoireTestKit";

/*
  The repertoire games (CTA-63) — `/repertoires/<id>/games/<game>`, the player
  with a game's rules. Stubbed as `RepertoirePlayer.test.tsx` is: the board
  (`chessboard.md` §8), the engine, the book; fake timers for the trainer's
  delay and Backtracking's return; `Math.random` pinned so the trainer's pick
  is the first move it may choose.
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

/** Two lines: `4. Nf3` (mainline) and `3... c5 4. dxc5`. */
const CARO = [
  '[Event "My Caro"]',
  "",
  "1. e4 c6 2. d4 d5 3. e5 Bf5 (3... c5 4. dxc5) 4. Nf3 *",
].join("\n");

/** Two lines that fork at White's own move: `2. Nf3` and `2. Bc4`. */
const WHITE_FORK = ['[Event "Fork"]', "", "1. e4 e5 2. Nf3 (2. Bc4) *"].join("\n");

const ID = "repertoire-game";

const fenAfter = (...sans: string[]) => {
  const chess = new Chess();
  for (const san of sans) chess.move(san);
  return chess.fen();
};

const position = () => boardOptions().position;
const status = () => screen.getByTestId(`${ID}-status`).getAttribute("data-status");
const tally = () => [
  screen.getByTestId(`${ID}-score-successes`).textContent,
  screen.getByTestId(`${ID}-score-failures`).textContent,
];
const lines = () => screen.getByTestId(`${ID}-score-lines`).textContent;

const mount = (path: string) => {
  renderSection(path);
  act(() => {
    vi.advanceTimersByTime(0);
  });
};

const drop = (from: string, to: string) =>
  act(() => {
    boardOptions().onPieceDrop!({ sourceSquare: from, targetSquare: to });
  });

/** Long enough for the trainer to reply — not long enough to backtrack. */
const reply = () =>
  act(() => {
    vi.advanceTimersByTime(500);
  });

/** Long enough for Backtracking to go back, and the trainer to answer there. */
const backtrack = () => {
  act(() => {
    vi.advanceTimersByTime(BACKTRACK_DELAY_MS);
  });
  reply();
};

/** Play a line of drops, letting the trainer answer each. */
const play = (...moves: [string, string][]) => {
  for (const [from, to] of moves) {
    drop(from, to);
    reply();
  }
};

beforeEach(async () => {
  FakeEngine.reset();
  await i18n.changeLanguage("en");
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("reaching a game", () => {
  it("is a menu on the repertoire's own view, and on its row in the list", () => {
    storeRepertoire("r", CARO);
    mount("/repertoires/r");
    fireEvent.click(screen.getByTestId("repertoire-board-games"));
    expect(screen.getByTestId("repertoire-board-games-end")).toHaveAttribute(
      "href",
      "/repertoires/r/games/end",
    );
    expect(screen.getByTestId("repertoire-board-games-backtrack")).toHaveAttribute(
      "href",
      "/repertoires/r/games/backtrack",
    );
  });

  it("is the same menu in the list", () => {
    storeRepertoire("r", CARO);
    mount("/repertoires");
    fireEvent.click(screen.getByTestId("repertoires-games-r"));
    expect(screen.getByTestId("repertoires-games-r-backtrack")).toHaveAttribute(
      "href",
      "/repertoires/r/games/backtrack",
    );
  });

  it("opens on the Score tab, with the trainer playing and no Autoplay switch", () => {
    mount(`/repertoires/${storeRepertoire("r", CARO, "Caro")}/games/end`);
    expect(boardOptions().id).toBe(ID);
    expect(screen.getByTestId(`${ID}-title`)).toHaveTextContent("Get to the end");
    expect(screen.getByTestId(`${ID}-score`)).toBeVisible();
    expect(tally()).toEqual(["0", "0"]);
    fireEvent.click(screen.getByTestId(`${ID}-panel-tab-settings`));
    expect(screen.queryByTestId(`${ID}-setting-autoplay`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`${ID}-back`)).toHaveAttribute("href", "/repertoires/r");
  });

  it("says so for a game there is no such thing as", () => {
    storeRepertoire("r", CARO);
    mount("/repertoires/r/games/nope");
    expect(screen.getByTestId("repertoire-board-missing")).toBeInTheDocument();
  });

  it("offers a record from before the one-game rule its merge-or-split choice", () => {
    mount(`/repertoires/${storeLegacyRepertoire("old", CARO_TWO_GAMES, "Old")}/games/end`);
    expect(screen.getByTestId("repertoire-board-multi")).toBeInTheDocument();
  });
});

describe("Get to the end", () => {
  it("counts a right move, takes a wrong one back, and counts a position once", () => {
    mount(`/repertoires/${storeRepertoire("r", CARO)}/games/end`);

    play(["e2", "e4"]);
    expect(tally()).toEqual(["1", "0"]);
    expect(position()).toBe(fenAfter("e4", "c6"));

    // 2. d3 is not the repertoire's move: refused, counted, not added.
    drop("d2", "d3");
    expect(tally()).toEqual(["1", "1"]);
    expect(position()).toBe(fenAfter("e4", "c6"));
    expect(document.querySelector('[data-san="d3"]')).toBeNull();
    expect(status()).toBe("try-again");

    // Retries at the same position count nothing more, wrong or right.
    drop("c2", "c3");
    play(["d2", "d4"]);
    expect(tally()).toEqual(["1", "1"]);
    expect(position()).toBe(fenAfter("e4", "c6", "d4", "d5"));

    // An illegal drop is not a move at all.
    drop("e4", "e6");
    expect(tally()).toEqual(["1", "1"]);

    drop("e4", "e5");
    expect(tally()).toEqual(["2", "1"]);
    expect(screen.getByTestId(`${ID}-score-accuracy`)).toHaveTextContent("67%");
  });

  it("finishes a line at its end, counts it, and counts again after a restart", () => {
    mount(`/repertoires/${storeRepertoire("r", CARO)}/games/end`);
    play(["e2", "e4"], ["d2", "d4"], ["e4", "e5"], ["g1", "f3"]);
    expect(status()).toBe("line-complete");
    expect(lines()).toBe("1 line finished");

    // Navigating back onto the end is not finishing it again.
    fireEvent.click(screen.getByTestId("board-control-previous"));
    fireEvent.click(screen.getByTestId("board-control-next"));
    expect(status()).toBe("out-of-book");
    expect(lines()).toBe("1 line finished");

    // Past the end: free play, extending, not judged.
    drop("e7", "e6");
    expect(tally()).toEqual(["4", "0"]);
    fireEvent.click(screen.getByTestId(`${ID}-panel-tab-moves`));
    expect(screen.getByTestId("move-ply-8")).toHaveAttribute("data-extension", "true");

    fireEvent.click(screen.getByTestId(`${ID}-restart`));
    play(["e2", "e4"], ["d2", "d4"], ["e4", "e5"], ["g1", "f3"]);
    fireEvent.click(screen.getByTestId(`${ID}-panel-tab-score`));
    expect(lines()).toBe("2 lines finished");

    fireEvent.click(screen.getByTestId(`${ID}-score-reset`));
    expect(tally()).toEqual(["0", "0"]);
  });
});

describe("Backtracking", () => {
  it("covers one line, goes back to the next, and ends when every line is covered", () => {
    mount(`/repertoires/${storeRepertoire("r", CARO)}/games/backtrack`);
    expect(screen.getByTestId(`${ID}-title`)).toHaveTextContent("Backtracking");
    expect(lines()).toBe("Lines covered: 0 of 2");

    play(["e2", "e4"], ["d2", "d4"], ["e4", "e5"]);
    // The trainer's first uncovered choice at 3. e5: the mainline's Bf5.
    expect(position()).toBe(fenAfter("e4", "c6", "d4", "d5", "e5", "Bf5"));
    drop("g1", "f3");
    expect(status()).toBe("line-covered");
    expect(lines()).toBe("Lines covered: 1 of 2");

    // Back to 3. e5 — the deepest position with a line left — where the
    // trainer now plays the side line, the only one still open.
    backtrack();
    expect(position()).toBe(fenAfter("e4", "c6", "d4", "d5", "e5", "c5"));

    drop("d4", "c5");
    expect(status()).toBe("all-covered");
    expect(lines()).toBe("Lines covered: 2 of 2");
    // Finished: it stays where it is.
    backtrack();
    expect(position()).toBe(fenAfter("e4", "c6", "d4", "d5", "e5", "c5", "dxc5"));
    expect(tally()).toEqual(["5", "0"]);
  });

  it("marks the required move where the reader's other moves are covered, and refuses those", () => {
    mount(`/repertoires/${storeRepertoire("f", WHITE_FORK)}/games/backtrack`);
    play(["e2", "e4"]);
    // Both of White's moves still lead somewhere new: nothing required.
    expect(status()).toBe("your-move");
    expect(boardOptions().arrows).toEqual([]);

    drop("g1", "f3");
    expect(status()).toBe("line-covered");
    backtrack();
    expect(position()).toBe(fenAfter("e4", "e5"));

    // Only 2. Bc4 is left: marked, and said.
    expect(status()).toBe("required");
    expect(boardOptions().arrows).toEqual([
      { startSquare: "f1", endSquare: "c4", color: REQUIRED_MOVE_ARROW_COLOR },
    ]);

    // 2. Nf3 is right but finished: refused, and not a failure.
    drop("g1", "f3");
    expect(position()).toBe(fenAfter("e4", "e5"));
    expect(tally()).toEqual(["2", "0"]);

    drop("f1", "c4");
    expect(tally()).toEqual(["3", "0"]);
    expect(status()).toBe("all-covered");
  });

  it("starts over with nothing covered", () => {
    mount(`/repertoires/${storeRepertoire("f", WHITE_FORK)}/games/backtrack`);
    play(["e2", "e4"]);
    drop("g1", "f3");
    expect(lines()).toBe("Lines covered: 1 of 2");

    fireEvent.click(screen.getByTestId(`${ID}-panel-tab-score`));
    fireEvent.click(screen.getByTestId(`${ID}-score-start-over`));
    expect(lines()).toBe("Lines covered: 0 of 2");
    expect(position()).toBe(new Chess().fen());
    // The Score tab stays where it was.
    expect(within(screen.getByTestId(`${ID}-score`)).getByTestId(`${ID}-score-lines`)).toBeVisible();
  });
});
