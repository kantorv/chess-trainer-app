import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";

import i18n from "../../i18n";
import AppThemeWithLang from "../../theme/AppThemeWithLang";
import { RightPanelOutlet, RightPanelProvider } from "../main/rightPanel";

/*
  **The propagation assertion** — CTA-60's acceptance criterion 4, and the whole
  reason the issue exists.

  The claim the unified core makes is not "the screens look alike"; it is that
  the best-variations block and the panel skeleton live in **one component**, so
  a change to that component demonstrably changes every board. Asserting
  that by comparing rendered markup would only say they agree today. So this
  file **replaces** `core/BoardPanel` with a sentinel and renders every
  board: if any one of them grew a panel of its own — a fork, a copy, a second
  skeleton — its sentinel would be missing, and the count below would be short.

  That is the failure this test exists to catch, and it is the one a reviewer
  cannot catch by reading: a screen that renders `<MyOwnPanel>` looks perfectly
  reasonable in isolation.

  `devBoards.test.tsx` is the other half — it renders the real panel and asserts
  what is inside it.
*/

vi.mock("./core/BoardPanel", () => ({
  default: ({
    testId,
    tabs,
  }: {
    testId: string;
    tabs: readonly { id: string; label: string }[];
  }) => (
    <div data-testid="the-one-board-panel" data-panel-id={testId}>
      {/* The tabs come through, so the sentinel also proves the slot contract
          is what each screen is filling rather than a panel of its own. */}
      <span data-testid="panel-tab-ids">
        {tabs.map((tab) => tab.id).join(",")}
      </span>
    </div>
  ),
}));

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

/** Every board composed from the core, by the id its panel carries. */
const BOARDS: readonly { name: string; panelId: string; Screen: () => ReactNode }[] =
  [
    // Analysis v2, shipped as the Analysis Board (CTA-73) and kept under the
    // assertion it was built to pass.
    { name: "Analysis Board", panelId: "analysis-panel", Screen: AnalysisBoard },
    // Play with Engine, a v2 screen since CTA-74.
    { name: "Play with Engine", panelId: "play-with-engine-panel", Screen: PlayWithEngine },
    // The Library's game board (CTA-75), composed as the Analysis Board is.
    { name: "Library game", panelId: "library-game-panel", Screen: LibraryGame },
    // The Openings explorer (CTA-78), in Openings v2's place.
    { name: "Openings explorer", panelId: "openings-panel", Screen: OpeningsBoard },
    // Masked Pieces (CTA-79), Play with Engine's screen in a costume — in the
    // dev boards' place.
    { name: "Masked Pieces", panelId: "masked-play-panel", Screen: MaskedPlay },
  ];

const renderBoard = (Screen: () => ReactNode) =>
  render(
    <AppThemeWithLang>
      <MemoryRouter initialEntries={["/dev"]}>
        <RightPanelProvider>
          <Screen />
          <RightPanelOutlet />
        </RightPanelProvider>
      </MemoryRouter>
    </AppThemeWithLang>,
  );

beforeEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage("en");
});

describe("the one panel skeleton", () => {
  it.each(BOARDS)(
    "$name renders it, and no panel of its own",
    ({ panelId, Screen }) => {
      const { unmount } = renderBoard(Screen);

      const panels = screen.getAllByTestId("the-one-board-panel");
      // Exactly one, and it is this screen's — a board that built its own
      // would render zero of these, and a board that rendered two skeletons
      // would be a bug of its own.
      expect(panels).toHaveLength(1);
      expect(panels[0]).toHaveAttribute("data-panel-id", panelId);

      unmount();
    },
  );

  it("changes every board at once when that one component changes", () => {
    /*
      The propagation itself, stated as an assertion. The mock above *is* the
      change: one edit to one module, and every board renders it. A mount
      and a sentinel each, and the panel id proving each one came from the
      screen under test rather than from a leftover mount.
    */
    const seen: string[] = [];

    for (const { Screen } of BOARDS) {
      const { unmount } = renderBoard(Screen);
      seen.push(
        screen
          .getByTestId("the-one-board-panel")
          .getAttribute("data-panel-id") ?? "missing",
      );
      expect(screen.getByTestId("panel-tab-ids").textContent).toContain(
        "moves",
      );
      unmount();
    }

    expect(seen).toEqual(BOARDS.map((board) => board.panelId));
  });

  it("gives every board the Moves and Engine tabs, through the same slot", () => {
    // The tab strip is the skeleton's; what goes in it is the screen's. Two
    // tabs are common to all of them because all are boards with an engine.
    for (const { Screen } of BOARDS) {
      const { unmount } = renderBoard(Screen);
      const ids = screen.getByTestId("panel-tab-ids").textContent ?? "";
      expect(ids.split(",")).toEqual(expect.arrayContaining(["moves", "engine"]));
      unmount();
    }
  });
});
