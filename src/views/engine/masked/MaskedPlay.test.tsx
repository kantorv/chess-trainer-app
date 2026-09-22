import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { defaultPieces } from "react-chessboard";

import i18n from "../../../i18n";
import { DEFAULT_ENGINE_SETTINGS } from "../../../lib/engineSettings";
import { parsePgnTree } from "../../../lib/pgn";
import { MASK_PRESETS } from "../../../lib/pieceMask";
import { findPlayedGame, playedGamesSnapshot, savePlayedGame } from "../../../lib/playedGameStore";
import { playedGameOf, type PlayedGameMask } from "../../../lib/playedGames";
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

import MaskedPlay from "./MaskedPlay";
import PlayWithEngine from "../play/PlayWithEngine";

/*
  Masked Pieces, v2 (CTA-79): Play with Engine's screen in a costume. What is
  asserted here is the costume and only the costume — where it is drawn,
  where it is written, where it is stored — because everything underneath is
  Play with Engine's own, tested in `PlayWithEngine.test.tsx`, and the shared
  square and panel with the other v2 boards (`devBoards.test.tsx`,
  `devPanelPropagation.test.tsx`). The rules: `.claude/rules/masked-pieces.md`.
*/

const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
/** White to take a queen with a pawn: exd5. */
const QUEEN_EN_PRISE = "4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1";

function Where() {
  const location = useLocation();
  return <div data-testid="where">{`${location.pathname}${location.search}`}</div>;
}

const mount = (entry = "/engine/masked") =>
  render(
    <AppThemeWithLang>
      <MemoryRouter initialEntries={[entry]}>
        <RightPanelProvider>
          <Routes>
            <Route path="/engine/masked" element={<MaskedPlay />} />
            <Route path="/engine/play" element={<PlayWithEngine />} />
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

const click = (testId: string) => fireEvent.click(screen.getByTestId(testId));

/** What the board is told to draw for one piece type. */
const drawnAs = (type: string) =>
  (boardOptions().pieces as Record<string, unknown> | undefined)?.[type];

const openMaskingTab = () => click("masked-play-panel-tab-masking");

/** A masked game in the store, one move in. */
const storedMasked = (id: string, mask: PlayedGameMask) =>
  savePlayedGame(
    playedGameOf(
      id,
      parsePgnTree("1. Nf3 *"),
      ["Nf3"],
      DEFAULT_ENGINE_SETTINGS,
      undefined,
      new Date("2026-09-01T10:00:00Z"),
      undefined,
      undefined,
      mask,
    ),
  );

beforeEach(async () => {
  FakeEngine.reset();
  await i18n.changeLanguage("en");
});

describe("Masked Pieces — the costume on the board", () => {
  it("opens on the doc's canonical exercise: every non-king drawn as a pawn", () => {
    mount();
    expect(boardOptions().id).toBe("masked-play");
    expect(drawnAs("wQ")).toBe(defaultPieces.wP);
    expect(drawnAs("bN")).toBe(defaultPieces.bP);
    expect(drawnAs("wK")).toBe(defaultPieces.wK);
  });

  it("redraws the board when the mask changes, and the promotion picker is not the mask's", () => {
    mount();
    openMaskingTab();
    click("mask-preset-allIdentical");
    expect(drawnAs("wK")).toBe(defaultPieces.wP);
    click("mask-preset-identity");
    expect(drawnAs("wQ")).toBe(defaultPieces.wQ);
  });

  it("draws the captured strips in costume and hides the material diff", () => {
    mount(`/engine/masked?fen=${encodeURIComponent(QUEEN_EN_PRISE)}`);
    expect(drag("e4", "d5")).toBe(true);

    const white = screen.getByTestId("masked-play-captured-white");
    // The queen White took is drawn as what a black queen is drawn as.
    expect(within(white).getByTestId("piece-bP")).toBeInTheDocument();
    expect(within(white).queryByTestId("piece-bQ")).not.toBeInTheDocument();
    // "+9" beside a board of pawns would name the queen.
    expect(white).not.toHaveAttribute("data-diff");
  });

  it("shows the diff again once nothing is masked", () => {
    mount(`/engine/masked?fen=${encodeURIComponent(QUEEN_EN_PRISE)}`);
    drag("e4", "d5");
    openMaskingTab();
    click("mask-preset-identity");
    expect(screen.getByTestId("masked-play-captured-white")).toHaveAttribute("data-diff", "9");
  });

  it("plays the true game: a ?fen= with Black to move turns the board to Black", () => {
    mount(`/engine/masked?fen=${encodeURIComponent(AFTER_E4)}`);
    expect(boardOptions().position).toBe(AFTER_E4);
    expect(boardOptions().boardOrientation).toBe("black");
  });
});

describe("Masked Pieces — the costume in the notation", () => {
  it("writes a hidden piece's move as coordinates, in the list and in a side line", () => {
    mount();
    expect(drag("g1", "f3")).toBe(true);
    // Back to the start (Play pauses) and a second first move: a side line.
    click("board-control-first");
    expect(drag("b1", "c3")).toBe(true);

    const list = screen.getByTestId("move-list");
    expect(within(list).getByText("g1f3")).toBeInTheDocument();
    expect(within(list).getByText("1. b1c3")).toBeInTheDocument();
    expect(within(list).queryByText(/Nf3|Nc3/)).not.toBeInTheDocument();
  });

  it("writes the next-moves bar in coordinates too", () => {
    mount();
    drag("g1", "f3");
    click("board-control-first");
    drag("b1", "c3");
    click("board-control-first");

    const bar = screen.getByTestId("analysis-next-moves");
    expect(within(bar).getByText("g1f3")).toBeInTheDocument();
    expect(within(bar).getByText("b1c3")).toBeInTheDocument();
  });

  it("prints SAN again with the notation switch off", () => {
    mount();
    drag("g1", "f3");
    openMaskingTab();
    fireEvent.click(screen.getByTestId("mask-setting-notation"));
    click("masked-play-panel-tab-moves");
    expect(within(screen.getByTestId("move-list")).getByText("Nf3")).toBeInTheDocument();
  });

  it("leaves a move the mask does not hide as SAN", () => {
    mount();
    openMaskingTab();
    click("mask-preset-identity");
    click("masked-play-panel-tab-moves");
    drag("g1", "f3");
    expect(within(screen.getByTestId("move-list")).getByText("Nf3")).toBeInTheDocument();
  });
});

describe("Masked Pieces — the game is kept with the engine games", () => {
  it("writes the costume on the record, and a change of it in place", async () => {
    mount();
    drag("e2", "e4");
    await waitFor(() => expect(playedGamesSnapshot()).toHaveLength(1));
    const [saved] = playedGamesSnapshot() ?? [];
    expect(saved.mask).toEqual({ pieces: MASK_PRESETS.nonPawns, notation: true });
    await waitFor(() => expect(where()).toBe(`/engine/masked?saved=${saved.id}`));

    openMaskingTab();
    click("mask-preset-allIdentical");
    await waitFor(() =>
      expect(findPlayedGame(saved.id)?.mask?.pieces).toEqual(MASK_PRESETS.allIdentical),
    );
    expect(findPlayedGame(saved.id)?.updatedAt).toBe(saved.updatedAt);
  });

  it("resumes a masked game in the same disguise", async () => {
    await storedMasked("m1", { pieces: MASK_PRESETS.allIdentical, notation: false });
    mount("/engine/masked?saved=m1");
    expect(drawnAs("wK")).toBe(defaultPieces.wP);
    // The notation switch came back off: the list names the knight.
    expect(within(screen.getByTestId("move-list")).getByText("Nf3")).toBeInTheDocument();
    openMaskingTab();
    expect(screen.getByTestId("mask-preset-allIdentical")).toHaveAttribute("aria-pressed", "true");
  });

  it("sends an unmasked game to Play with Engine, where it was begun", async () => {
    await savePlayedGame(playedGameOf("p1", parsePgnTree("1. e4 *"), ["e4"], DEFAULT_ENGINE_SETTINGS));
    mount("/engine/masked?saved=p1");
    expect(where()).toBe("/engine/play?saved=p1");
    expect(boardOptions().id).toBe("play-with-engine");
    expect(findPlayedGame("p1")?.mask).toBeUndefined();
  });

  it("is sent here by Play with Engine when the game it names is masked", async () => {
    await storedMasked("m2", { pieces: MASK_PRESETS.nonPawns, notation: true });
    mount("/engine/play?saved=m2");
    expect(where()).toBe("/engine/masked?saved=m2");
    expect(boardOptions().id).toBe("masked-play");
  });
});
