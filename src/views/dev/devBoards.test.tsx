import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";
import { Chess } from "chess.js";

import i18n from "../../i18n";
import AppThemeWithLang from "../../theme/AppThemeWithLang";
import { navFolders } from "../main/navFolders";
import { navItems } from "../main/navItems";
import { navLabelKeys } from "../main/navTree";
import { RightPanelOutlet, RightPanelProvider } from "../main/rightPanel";

/*
  The Development section's five boards, rendered for real (CTA-60 acceptance
  criteria 2, 3, 4, 5 and 6).

  `devPanelPropagation.test.tsx` is the other half of criterion 4: it replaces
  the panel with a sentinel to prove all five render *one* component. This file
  keeps the real one and asserts what is inside it — that the shared skeleton's
  parts actually reach every board, that the masked board adds a mask and
  nothing else, and that each board keeps the one thing that is its own.
*/

vi.mock("../../lib/engine", async () => ({
  default: (await import("./devTestHarness")).FakeEngine,
}));

vi.mock("react-chessboard", async () => {
  const { reactChessboardMock } = await import("./devTestHarness");
  return reactChessboardMock();
});

vi.mock("../../lib/openings", async (importOriginal) => {
  const { openingsMock } = await import("./devTestHarness");
  return openingsMock(
    importOriginal as () => Promise<typeof import("../../lib/openings")>,
  );
});

import { boardOptions, FakeEngine } from "./devTestHarness";
import { DEV_NAV_FOLDER_ID, devNavItems } from "./devNav";
import { devSavedGamesSnapshot, devSavedOpeningsSnapshot } from "./core/devStores";
import AnalysisV2 from "./analysis/AnalysisV2";
import MaskedV2 from "./masked/MaskedV2";
import OpeningsV2 from "./openings/OpeningsV2";
import PlayV2 from "./play/PlayV2";
import RepertoireV2 from "./repertoire/RepertoireV2";

const BOARDS: readonly {
  name: string;
  id: string;
  Screen: () => ReactNode;
}[] = [
  { name: "Analysis v2", id: "dev-analysis", Screen: AnalysisV2 },
  { name: "Play with Engine v2", id: "dev-play", Screen: PlayV2 },
  { name: "Masked Pieces v2", id: "dev-masked", Screen: MaskedV2 },
  { name: "Openings v2", id: "dev-openings", Screen: OpeningsV2 },
  { name: "Repertoire v2", id: "dev-repertoire", Screen: RepertoireV2 },
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

describe("the Development section", () => {
  it("is gated on import.meta.env.DEV, and so is in the sidebar under test", () => {
    /*
      Criterion 2. Under Vitest `import.meta.env.DEV` is true, which is exactly
      what makes this assertable: the folder and its five screens are in the
      registries here, so the *only* thing keeping them out of a production
      bundle is that same expression being replaced by `false` — and the
      absence from `dist/` is checked by the build, not by jsdom.
    */
    expect(import.meta.env.DEV).toBe(true);

    expect(navFolders().map((folder) => folder.id)).toContain(
      DEV_NAV_FOLDER_ID,
    );
    expect(navItems().filter((item) => item.folder === DEV_NAV_FOLDER_ID)).toHaveLength(
      5,
    );
  });

  it("names every dev screen with a key both catalogs resolve", () => {
    // `locales.test.ts` asserts this over the whole nav; stated here too
    // because a dev-only label is the one kind nobody sees in production and
    // a missing Hebrew string would otherwise be found by nobody.
    const keys = navLabelKeys();
    for (const item of devNavItems()) {
      expect(keys).toContain(item.labelKey);
      expect(i18n.t(item.labelKey!)).not.toBe(item.labelKey);
    }
  });

  it("routes the five boards at /dev/*", () => {
    expect(devNavItems().map((item) => item.to)).toEqual([
      "/dev/analysis",
      "/dev/play",
      "/dev/masked",
      "/dev/openings",
      "/dev/repertoire",
    ]);
  });
});

describe("all five boards, from the same core", () => {
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
    expect(screen.getByTestId(`${id}-panel-variations`)).toBeInTheDocument();
    expect(screen.getByTestId(`${id}-panel-status`)).toBeInTheDocument();
    expect(screen.getByTestId(`${id}-panel-tab-moves`)).toBeInTheDocument();
    expect(screen.getByTestId(`${id}-panel-tab-engine`)).toBeInTheDocument();
    expect(screen.getByTestId("board-controls")).toBeInTheDocument();

    unmount();
  });

  it.each(BOARDS)("$name pins the engine's lines above its tabs", ({ id, Screen }) => {
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
  });

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

describe("Play with Engine v2", () => {
  it("plays the engine's reply at the live position", () => {
    renderBoard(PlayV2);

    expect(drag("e2", "e4")).toBe(true);

    // The reply, through the capability's `onBestMove` — which only this board
    // supplies. `e7e5` answers the position the human just made.
    engineReports({ depth: 12, cp: 10, pv: "e7e5" });
    engineFinishes("e7e5");

    // Two plies played: the human's, and the engine's answer to it. Compared
    // against a `chess.js` that made the same two moves rather than a FEN
    // written out by hand.
    const expected = new Chess();
    expected.move("e4");
    expected.move("e5");
    expect(boardOptions().position).toBe(expected.fen());
  });

  it("writes the game to the dev store, not the shipped one", () => {
    renderBoard(PlayV2);

    expect(drag("e2", "e4")).toBe(true);

    const saved = devSavedGamesSnapshot();
    expect(saved).toHaveLength(1);
    expect(saved[0].pgn).toContain("e4");
  });

  it("refuses a drag off the live position, so the game stays one line", () => {
    renderBoard(PlayV2);

    expect(drag("e2", "e4")).toBe(true);
    // Step back to the start and try to branch: `canMoveAt` refuses, which is
    // the one seam that makes this board linear.
    act(() => {
      screen.getByTestId("board-control-first").click();
    });

    expect(drag("d2", "d4")).toBe(false);
  });
});

describe("Analysis v2", () => {
  it("never moves a piece, whatever the engine says", () => {
    renderBoard(AnalysisV2);

    const before = boardOptions().position;
    engineReports({ depth: 12, cp: 10, pv: "e2e4" });
    engineFinishes("e2e4");

    // No `onBestMove` is passed, so the branch that plays one does not exist.
    expect(boardOptions().position).toBe(before);
  });

  it("accepts moves for both colours, from any node", () => {
    renderBoard(AnalysisV2);

    expect(drag("e2", "e4")).toBe(true);
    expect(drag("e7", "e5")).toBe(true);
    // Back to the start, and a different first move: a variation, not an error.
    act(() => {
      screen.getByTestId("board-control-first").click();
    });
    expect(drag("d2", "d4")).toBe(true);
  });
});

describe("Masked Pieces v2", () => {
  it("adds a mask and nothing else", () => {
    /*
      Criterion 5. The masked board hands the board a `pieces` renderer — the
      only honest place to disguise a piece — and the same composition
      underneath, which is why the true position it reports is identical to the
      unmasked board's.
    */
    const { unmount } = renderBoard(MaskedV2);
    expect(boardOptions().pieces).toBeDefined();
    const maskedStart = boardOptions().position;
    // The extra tab, and only one.
    expect(screen.getByTestId("dev-masked-panel-tab-mask")).toBeInTheDocument();
    unmount();

    renderBoard(PlayV2);
    expect(boardOptions().pieces).toBeUndefined();
    expect(boardOptions().position).toBe(maskedStart);
    expect(
      screen.queryByTestId("dev-play-panel-tab-mask"),
    ).not.toBeInTheDocument();
  });

  it("plays ordinary legal chess underneath the costume", () => {
    renderBoard(MaskedV2);

    // A knight move the mask draws as a pawn is still a knight move.
    expect(drag("g1", "f3")).toBe(true);
    // And an illegal one is still illegal.
    expect(drag("a1", "a5")).toBe(false);
  });

  it("does not persist, because a costume cannot be restored on /dev/play", () => {
    renderBoard(MaskedV2);

    expect(drag("e2", "e4")).toBe(true);

    expect(devSavedGamesSnapshot()).toEqual([]);
  });
});

describe("Openings v2", () => {
  it("keeps its button-triggered save, and never autosaves", async () => {
    // Criterion 6: an opening is explored and discarded far more often than it
    // is kept, so this is the one derived board that composes no persistence.
    const user = userEvent.setup();
    renderBoard(OpeningsV2);

    expect(drag("e2", "e4")).toBe(true);
    expect(devSavedOpeningsSnapshot()).toEqual([]);

    await user.type(screen.getByTestId("dev-openings-note"), "My line");
    await user.click(screen.getByTestId("dev-openings-save"));

    const saved = devSavedOpeningsSnapshot();
    expect(saved).toHaveLength(1);
    expect(saved[0].note).toBe("My line");
  });

  it("carries the book explorer in its footer", () => {
    renderBoard(OpeningsV2);

    // The book is stubbed empty here, so what is asserted is that the explorer
    // is on screen at all — the slot, not eco.json.
    expect(screen.getByTestId("dev-openings-explorer")).toBeInTheDocument();
    expect(screen.getByTestId("dev-openings-panel-footer")).toContainElement(
      screen.getByTestId("dev-openings-explorer"),
    );
  });
});

describe("Repertoire v2", () => {
  it("replays a line out of the shipped catalog, tree and all", () => {
    renderBoard(RepertoireV2);

    // It falls back to the catalog's first game when no `?game=` arrived, so
    // the screen is never a blank board in dev.
    expect(screen.getByTestId("dev-repertoire-source")).toHaveTextContent(
      i18n.t("dev.repertoire.source"),
    );
    // The flowing tree is the one view the merged list does not replace.
    expect(screen.getByTestId("dev-repertoire-panel-tab-tree")).toBeInTheDocument();
    expect(screen.getByTestId("dev-repertoire-panel-tab-info")).toBeInTheDocument();
  });
});
