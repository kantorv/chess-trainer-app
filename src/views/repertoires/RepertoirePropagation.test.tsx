import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen } from "@testing-library/react";

import i18n from "../../i18n";
import { renderSection, storeRepertoire } from "./repertoireTestKit";

/*
  **The propagation assertion, for the first shipped screen on the v2 core** —
  CTA-61's acceptance criterion 4, asserted the way CTA-60's
  `views/dev/devPanelPropagation.test.tsx` asserts it for the five dev boards.

  The two shared components are **replaced by sentinels**: the panel skeleton
  (`views/dev/core/BoardPanel`) and the board square (`views/shared/EngineBoardSquare`).
  If this screen grew a panel or a square of its own — a copy that looks
  perfectly reasonable in review — its sentinel would be missing here. What
  `RepertoireBoard.test.tsx` asserts about their insides is the other half.
*/
vi.mock("../dev/core/BoardPanel", () => ({
  default: ({ testId, tabs }: { testId: string; tabs: readonly { id: string }[] }) => (
    <div data-testid="the-one-board-panel" data-panel-id={testId}>
      <span data-testid="panel-tab-ids">{tabs.map((tab) => tab.id).join(",")}</span>
    </div>
  ),
}));

vi.mock("../shared/EngineBoardSquare", () => ({
  default: ({ id }: { id: string }) => (
    <div data-testid="the-one-board-square" data-square-id={id} />
  ),
}));

vi.mock("../../lib/engine", async () => ({
  default: (await import("../dev/devTestHarness")).FakeEngine,
}));
vi.mock("../../lib/openings", async (importOriginal) => {
  const { openingsMock } = await import("../dev/devTestHarness");
  return openingsMock(
    importOriginal as () => Promise<typeof import("../../lib/openings")>,
  );
});

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

describe("the repertoire board is composed, not written", () => {
  it("renders the one shared panel and the one shared square, and nothing of its own", () => {
    storeRepertoire("r");

    renderSection("/repertoires/r");

    const panels = screen.getAllByTestId("the-one-board-panel");
    expect(panels).toHaveLength(1);
    expect(panels[0]).toHaveAttribute("data-panel-id", "repertoire-board-panel");
    // The slots this screen fills.
    expect(screen.getByTestId("panel-tab-ids")).toHaveTextContent("moves,settings,engine");

    const squares = screen.getAllByTestId("the-one-board-square");
    expect(squares).toHaveLength(1);
    expect(squares[0]).toHaveAttribute("data-square-id", "repertoire-board");
  });

  // The repertoire games (CTA-63) are under the same guarantee: the trainer
  // and a game's rules are modules, not a panel of their own.
  it.each(["end", "backtrack"])("plays the %s game on the same shared panel and square", (game) => {
    vi.useFakeTimers();
    try {
      storeRepertoire("r");
      renderSection(`/repertoires/r/games/${game}`);
      act(() => {
        vi.advanceTimersByTime(0);
      });

      const panels = screen.getAllByTestId("the-one-board-panel");
      expect(panels).toHaveLength(1);
      expect(panels[0]).toHaveAttribute("data-panel-id", "repertoire-game-panel");
      expect(screen.getByTestId("panel-tab-ids")).toHaveTextContent(
        game === "backtrack" ? "moves,score,map,settings,engine" : "moves,score,settings,engine",
      );

      const squares = screen.getAllByTestId("the-one-board-square");
      expect(squares).toHaveLength(1);
      expect(squares[0]).toHaveAttribute("data-square-id", "repertoire-game");
    } finally {
      vi.useRealTimers();
    }
  });
});
