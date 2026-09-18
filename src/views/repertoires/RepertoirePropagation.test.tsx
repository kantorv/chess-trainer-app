import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";

import i18n from "../../i18n";
import { checkRepertoirePgn, savedRepertoireOf } from "../../lib/savedRepertoires";
import { saveRepertoire } from "../../lib/savedRepertoireStore";
import { CARO, renderSection } from "./repertoireTestKit";

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
    const check = checkRepertoirePgn(CARO);
    if (!check.ok) throw new Error("fixture did not read");
    saveRepertoire(savedRepertoireOf("r", CARO, "", check.previewFen));

    renderSection("/repertoires/r");

    const panels = screen.getAllByTestId("the-one-board-panel");
    expect(panels).toHaveLength(1);
    expect(panels[0]).toHaveAttribute("data-panel-id", "repertoire-board-panel");
    // The slots this screen fills — the Lines tab is its own addition.
    expect(screen.getByTestId("panel-tab-ids")).toHaveTextContent("lines,moves,tree,engine");

    const squares = screen.getAllByTestId("the-one-board-square");
    expect(squares).toHaveLength(1);
    expect(squares[0]).toHaveAttribute("data-square-id", "repertoire-board");
  });
});
