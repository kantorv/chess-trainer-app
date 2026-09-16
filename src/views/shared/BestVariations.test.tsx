import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_POSITION } from "chess.js";
import i18n from "../../i18n";
import AppThemeWithLang from "../../theme/AppThemeWithLang";
import { pvToSan } from "../../lib/engineAnalysis";
import { MASK_PRESETS } from "../../lib/pieceMask";
import BestVariations from "./BestVariations";
import type { Analysis, EngineLine } from "../../lib/engineAnalysis";
import type { PieceMask } from "../../lib/pieceMask";

const line = (
  multipv: number,
  cp: number,
  pv: string,
  depth = 18,
): EngineLine => ({
  multipv,
  score: { kind: "cp", value: cp },
  depth,
  san: pvToSan(DEFAULT_POSITION, pv),
});

/*
  What only the Analysis Board passes (CTA-55): a mask is Masked Pieces'
  business, and the click handler is what turns a line the reader reads into
  one they play.
*/
type PlayableProps = {
  mask?: PieceMask;
  onSelectMove?: (san: readonly string[]) => void;
};

const renderVariations = (
  analysis: Analysis,
  requested = 3,
  { mask, onSelectMove }: PlayableProps = {},
) =>
  render(
    <AppThemeWithLang>
      <BestVariations
        analysis={analysis}
        requested={requested}
        mask={mask}
        onSelectMove={onSelectMove}
      />
    </AppThemeWithLang>,
  );

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

describe("the best variations view", () => {
  it("shows each line with its score and its variation in SAN", () => {
    renderVariations({
      fen: DEFAULT_POSITION,
      depth: 18,
      lines: [line(1, 32, "e2e4 e7e5 g1f3"), line(2, 18, "d2d4 d7d5")],
    });

    expect(screen.getByTestId("variation-1-score")).toHaveTextContent("+0.32");
    expect(screen.getByTestId("variation-1-line")).toHaveTextContent(
      "1. e4 e5 2. Nf3",
    );
    expect(screen.getByTestId("variation-2-score")).toHaveTextContent("+0.18");
    expect(screen.getByTestId("variation-2-line")).toHaveTextContent(
      "1. d4 d5",
    );
  });

  it("shows the depth the search has reached", () => {
    renderVariations({
      fen: DEFAULT_POSITION,
      depth: 21,
      lines: [line(1, 10, "e2e4")],
    });

    expect(screen.getByTestId("analysis-depth")).toHaveTextContent("Depth 21");
  });

  it("writes a mate as mate-in-N", () => {
    renderVariations({
      fen: DEFAULT_POSITION,
      depth: 12,
      lines: [
        { multipv: 1, score: { kind: "mate", value: 3 }, depth: 12, san: ["e4"] },
      ],
    });

    expect(screen.getByTestId("variation-1-score")).toHaveTextContent("M3");
  });

  it("says it is waiting before the first result arrives", () => {
    renderVariations({ fen: DEFAULT_POSITION, depth: 0, lines: [] });

    expect(screen.getByTestId("best-variations")).toHaveTextContent(
      "Waiting for the engine…",
    );
    expect(screen.queryByTestId("variation-1")).not.toBeInTheDocument();
  });

  it("renders a set that is still filling in, without a hole for the missing rank", () => {
    /*
      MultiPV lines arrive out of order and the array is indexed by rank, so a
      partially filled set is normal rather than a bug — rank 2 having landed
      before rank 1 must not render an empty row or throw.
    */
    const lines: EngineLine[] = [];
    lines[1] = line(2, -5, "d2d4");

    renderVariations({ fen: DEFAULT_POSITION, depth: 14, lines }, 3);

    expect(screen.getByTestId("variation-2")).toBeInTheDocument();
    expect(screen.queryByTestId("variation-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("variations-partial")).toHaveTextContent(
      "1 of 3 lines so far.",
    );
  });

  it("drops the ranks left over from a wider search when MultiPV is lowered", () => {
    /*
      Lowering MultiPV re-searches the *same* position, so the analysis state is
      kept rather than replaced and the old ranks are still in the array — the
      engine has simply stopped reporting them. Asking for one line must show
      one line, not three, two of which no longer move.
    */
    renderVariations(
      {
        fen: DEFAULT_POSITION,
        depth: 14,
        lines: [
          line(1, 94, "e2e4 e7e6"),
          line(2, 77, "c2c4 e7e6"),
          line(3, 53, "d2d4 g8f6"),
        ],
      },
      1,
    );

    expect(screen.getByTestId("variation-1")).toBeInTheDocument();
    expect(screen.queryByTestId("variation-2")).not.toBeInTheDocument();
    expect(screen.queryByTestId("variation-3")).not.toBeInTheDocument();
    // One of one is a complete set, so nothing calls it partial either.
    expect(screen.queryByTestId("variations-partial")).not.toBeInTheDocument();
  });

  it("says nothing about a partial set once every requested line is in", () => {
    renderVariations(
      {
        fen: DEFAULT_POSITION,
        depth: 18,
        lines: [line(1, 30, "e2e4"), line(2, 20, "d2d4")],
      },
      2,
    );

    expect(screen.queryByTestId("variations-partial")).not.toBeInTheDocument();
  });

  it("numbers a variation from the position it starts at", () => {
    // A line off Black's 24th move must read "24... Kf7", not "1. Kf7".
    const late = "8/5k2/8/8/8/6K1/6P1/8 b - - 0 24";
    renderVariations({
      fen: late,
      depth: 10,
      lines: [
        { multipv: 1, score: { kind: "cp", value: 0 }, depth: 10, san: ["Kf6", "Kf3"] },
      ],
    });

    expect(screen.getByTestId("variation-1-line")).toHaveTextContent(
      "24... Kf6 25. Kf3",
    );
  });

  it("keeps SAN pinned to LTR for Hebrew readers", async () => {
    // A CSS declaration would be flipped by the RTL emotion cache; the attribute
    // is out of that plugin's reach. See the root CLAUDE.md.
    await i18n.changeLanguage("he");
    renderVariations({
      fen: DEFAULT_POSITION,
      depth: 12,
      lines: [line(1, 25, "e2e4 e7e5")],
    });

    expect(screen.getByTestId("variation-1-line")).toHaveAttribute("dir", "ltr");
    expect(screen.getByTestId("variation-1-score")).toHaveAttribute("dir", "ltr");
  });

  it("hands a click the prefix up to the move clicked, when a click handler is given", async () => {
    // lichess analysis behaviour (CTA-55): clicking the third move of a line
    // plays all three, so the click carries the first three SANs — and the
    // first move's click carries one, which is the same rule at the smallest
    // size.
    const onSelectMove = vi.fn();
    renderVariations(
      { fen: DEFAULT_POSITION, depth: 18, lines: [line(1, 32, "e2e4 e7e5 g1f3")] },
      3,
      { onSelectMove },
    );

    const user = userEvent.setup();
    await user.click(screen.getByTestId("variation-1-move-1"));
    expect(onSelectMove).toHaveBeenLastCalledWith(["e4"]);
    await user.click(screen.getByTestId("variation-1-move-3"));
    expect(onSelectMove).toHaveBeenLastCalledWith(["e4", "e5", "Nf3"]);
  });

  it("prints plain text with no buttons when no click handler is given", () => {
    // The two engine screens' Variations tab: a move there is a thing to read
    // while playing one of one's own, and the DOM is the text it always was.
    renderVariations({
      fen: DEFAULT_POSITION,
      depth: 18,
      lines: [line(1, 32, "e2e4 e7e5")],
    });

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByTestId("variation-1-line")).toHaveTextContent(
      "1. e4 e5",
    );
  });

  it("prints a masked line in coordinates but the click carries the true SAN", async () => {
    // The mask is a costume, never a rule (`lib/pieceMask.ts`): what a move
    // prints is disguised, what it reports is not — the Analysis Board's lines
    // play on the real board.
    const onSelectMove = vi.fn();
    renderVariations(
      { fen: DEFAULT_POSITION, depth: 18, lines: [line(1, 0, "g1f3 g8f6")] },
      3,
      { mask: MASK_PRESETS.nonPawns, onSelectMove },
    );

    // The printed line is coordinates — a knight is drawn as a pawn.
    expect(screen.getByTestId("variation-1-line")).toHaveTextContent(
      "1. g1f3 g8f6",
    );

    const user = userEvent.setup();
    const move = screen.getByTestId("variation-1-move-1");
    expect(move).toHaveAttribute("data-san", "Nf3");
    await user.click(move);
    expect(onSelectMove).toHaveBeenCalledWith(["Nf3"]);
  });
});
