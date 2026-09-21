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

  The claim the unified core makes is not "five screens look alike"; it is that
  the best-variations block and the panel skeleton live in **one component**, so
  a change to that component demonstrably changes all five boards. Asserting
  that by comparing rendered markup would only say they agree today. So this
  file **replaces** `core/BoardPanel` with a sentinel and renders all five
  boards: if any one of them grew a panel of its own — a fork, a copy, a second
  skeleton — its sentinel would be missing, and the count below would not be
  five.

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
import MaskedV2 from "./masked/MaskedV2";
import OpeningsV2 from "./openings/OpeningsV2";
import PlayV2 from "./play/PlayV2";
import RepertoireV2 from "./repertoire/RepertoireV2";

/** Every board of the Development section, by the name its route carries. */
const BOARDS: readonly { name: string; panelId: string; Screen: () => ReactNode }[] =
  [
    // Analysis v2, shipped as the Analysis Board (CTA-73) and kept under the
    // assertion it was built to pass.
    { name: "Analysis Board", panelId: "analysis-panel", Screen: AnalysisBoard },
    { name: "Play with Engine v2", panelId: "dev-play-panel", Screen: PlayV2 },
    { name: "Masked Pieces v2", panelId: "dev-masked-panel", Screen: MaskedV2 },
    { name: "Openings v2", panelId: "dev-openings-panel", Screen: OpeningsV2 },
    {
      name: "Repertoire v2",
      panelId: "dev-repertoire-panel",
      Screen: RepertoireV2,
    },
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
      change: one edit to one module, and all five boards render it. Five
      mounts, five sentinels, and the panel id proving each one came from the
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
    // tabs are common to all five because all five are boards with an engine.
    for (const { Screen } of BOARDS) {
      const { unmount } = renderBoard(Screen);
      const ids = screen.getByTestId("panel-tab-ids").textContent ?? "";
      expect(ids.split(",")).toEqual(expect.arrayContaining(["moves", "engine"]));
      unmount();
    }
  });
});
