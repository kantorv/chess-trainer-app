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

  it("hands a move click the same prefix in both states", async () => {
    // CTA-56: the chevron may expand the row, but a move is a move wherever
    // it shows — a visible move is a playable one, collapsed or expanded.
    const onSelectMove = vi.fn();
    renderVariations(
      { fen: DEFAULT_POSITION, depth: 18, lines: [line(1, 32, "e2e4 e7e5 g1f3")] },
      3,
      { onSelectMove },
    );

    const user = userEvent.setup();
    await user.click(screen.getByTestId("variation-1-move-2"));
    expect(onSelectMove).toHaveBeenLastCalledWith(["e4", "e5"]);

    await user.click(screen.getByTestId("variation-1-toggle"));
    await user.click(screen.getByTestId("variation-1-move-3"));
    expect(onSelectMove).toHaveBeenLastCalledWith(["e4", "e5", "Nf3"]);
  });

  it("prints the moves as plain text when no click handler is given", () => {
    // The two engine screens' Variations tab: a move there is a thing to read
    // while playing one of one's own, so no move is a button — the row's
    // chevron is the one button the tab has (CTA-56).
    renderVariations({
      fen: DEFAULT_POSITION,
      depth: 18,
      lines: [line(1, 32, "e2e4 e7e5")],
    });

    expect(screen.queryByTestId("variation-1-move-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("variation-1-line")).toHaveTextContent(
      "1. e4 e5",
    );
    // The score is plain text again — the toggle moved to the row's chevron.
    expect(screen.getByTestId("variation-1-score").tagName).toBe("SPAN");
    expect(screen.getByTestId("variation-1-toggle").tagName).toBe("BUTTON");
  });

  it("collapses each variation to one line, every move still in the DOM", () => {
    // CTA-56: collapsed, the row is one line — the moves that fit, the cut
    // marked by an ellipsis — and the cutting is CSS on the span, so every
    // move still renders and only the clipping differs. jsdom has no line
    // boxes, so what a test can read is the span's markers, not the
    // truncation itself.
    renderVariations({
      fen: DEFAULT_POSITION,
      depth: 18,
      lines: [line(1, 32, "e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 e1g1")],
    });

    expect(screen.getByTestId("variation-1-toggle")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByTestId("variation-1-line")).toHaveAttribute(
      "data-expanded",
      "false",
    );
    // Nothing is cut out of the DOM — the CSS clips, the moves all render.
    expect(screen.getByTestId("variation-1-line")).toHaveTextContent(
      "1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. O-O",
    );
  });

  it("expands a row through its chevron and collapses it the same way", async () => {
    // Plain mode — no click handler — is where the toggle has to work on its
    // own: the two engine screens' tab has nothing else clickable. The label
    // flips with the state and names the variation, the score and the action,
    // because an icon's aria-label replaces its content for a screen reader
    // and the icon alone says none of the three.
    renderVariations({
      fen: DEFAULT_POSITION,
      depth: 18,
      lines: [line(1, 32, "e2e4 e7e5 g1f3"), line(2, 18, "d2d4 d7d5")],
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("variation-1-toggle"));

    expect(screen.getByTestId("variation-1-toggle")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByTestId("variation-1-line")).toHaveAttribute(
      "data-expanded",
      "true",
    );
    expect(screen.getByTestId("variation-1-toggle")).toHaveAccessibleName(
      "Variation 1, +0.32 — collapse the line",
    );
    // Rows are independent — each chevron speaks for its own line alone.
    expect(screen.getByTestId("variation-2-toggle")).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    await user.click(screen.getByTestId("variation-1-toggle"));

    expect(screen.getByTestId("variation-1-toggle")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByTestId("variation-1-line")).toHaveAttribute(
      "data-expanded",
      "false",
    );
    expect(screen.getByTestId("variation-1-toggle")).toHaveAccessibleName(
      "Variation 1, +0.32 — show the full line",
    );
  });

  it("keeps an expansion through the same position deepening, and drops it on a new one", async () => {
    // An expansion belongs to the position it was made on (CTA-56): the
    // search streaming deeper results for the same FEN keeps it — the row
    // re-renders its longer line — and the next position starts every row
    // collapsed.
    const afterE4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1";
    const before: Analysis = {
      fen: DEFAULT_POSITION,
      depth: 18,
      lines: [line(1, 32, "e2e4 e7e5 g1f3")],
    };
    const deeper: Analysis = {
      fen: DEFAULT_POSITION,
      depth: 21,
      lines: [line(1, 32, "e2e4 e7e5 g1f3 b8c6 f1b5", 21)],
    };
    const movedOn: Analysis = {
      fen: afterE4,
      depth: 15,
      lines: [
        {
          multipv: 1,
          score: { kind: "cp", value: 20 },
          depth: 15,
          san: pvToSan(afterE4, "g8f6 g1f3"),
        },
      ],
    };

    const view = renderVariations(before);
    const user = userEvent.setup();
    await user.click(view.getByTestId("variation-1-toggle"));

    // Same FEN, deeper search — the row stays open and grows its line.
    view.rerender(
      <AppThemeWithLang>
        <BestVariations analysis={deeper} requested={3} />
      </AppThemeWithLang>,
    );
    expect(view.getByTestId("variation-1-toggle")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(view.getByTestId("variation-1-line")).toHaveTextContent(
      "1. e4 e5 2. Nf3 Nc6 3. Bb5",
    );

    // New FEN — every row starts collapsed.
    view.rerender(
      <AppThemeWithLang>
        <BestVariations analysis={movedOn} requested={3} />
      </AppThemeWithLang>,
    );
    expect(view.getByTestId("variation-1-toggle")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(view.getByTestId("variation-1-line")).toHaveAttribute(
      "data-expanded",
      "false",
    );
  });

  it("hides the lines behind the header's checkbox, and brings them back", async () => {
    // CTA-56: the header's checkbox is the block's own control — clearing it
    // puts the engine's lines away entirely, for the reader analysing a
    // position on their own. The row itself stays: the checkbox is the way
    // back, and it speaks its own name.
    renderVariations({
      fen: DEFAULT_POSITION,
      depth: 18,
      lines: [line(1, 32, "e2e4 e7e5 g1f3"), line(2, 18, "d2d4 d7d5")],
    });

    // The testid lands on the MUI Checkbox's root, not its input, so the
    // input is found by its role — and the name in the query asserts the
    // label with it, the way the saved-list tests find their checkboxes.
    const toggle = screen.getByRole("checkbox", { name: "Variations" });
    expect(toggle).toBeChecked();

    const user = userEvent.setup();
    await user.click(toggle);

    expect(toggle).not.toBeChecked();
    expect(screen.queryByTestId("variation-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("variation-2")).not.toBeInTheDocument();
    // The block stays on screen — only its contents are gone.
    expect(screen.getByTestId("best-variations")).toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toBeChecked();
    expect(screen.getByTestId("variation-1")).toBeInTheDocument();
    expect(screen.getByTestId("variation-2")).toBeInTheDocument();
  });

  it("keeps the lines hidden across a new analysed position", async () => {
    // Hiding the lines is a working mode, not an expansion: it is about the
    // reader, not the position, so — unlike the expansion set — a new FEN
    // must not bring back what was put away.
    const afterE4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1";
    const movedOn: Analysis = {
      fen: afterE4,
      depth: 15,
      lines: [
        {
          multipv: 1,
          score: { kind: "cp", value: 20 },
          depth: 15,
          san: pvToSan(afterE4, "g8f6 g1f3"),
        },
      ],
    };

    const view = renderVariations({
      fen: DEFAULT_POSITION,
      depth: 18,
      lines: [line(1, 32, "e2e4 e7e5 g1f3")],
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("checkbox", { name: "Variations" }));

    view.rerender(
      <AppThemeWithLang>
        <BestVariations analysis={movedOn} requested={3} />
      </AppThemeWithLang>,
    );

    expect(screen.getByRole("checkbox", { name: "Variations" })).not.toBeChecked();
    expect(view.queryByTestId("variation-1")).not.toBeInTheDocument();
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

  it("expands a masked row without unmasking it", async () => {
    // The costume covers both states (CTA-56): the expanded line prints the
    // same coordinates the collapsed one did, and a click still carries the
    // true SANs — the mask is never a rule (`lib/pieceMask.ts`).
    const onSelectMove = vi.fn();
    renderVariations(
      { fen: DEFAULT_POSITION, depth: 18, lines: [line(1, 0, "g1f3 g8f6 b1c3")] },
      3,
      { mask: MASK_PRESETS.nonPawns, onSelectMove },
    );

    const user = userEvent.setup();
    await user.click(screen.getByTestId("variation-1-toggle"));
    expect(screen.getByTestId("variation-1-line")).toHaveAttribute(
      "data-expanded",
      "true",
    );
    expect(screen.getByTestId("variation-1-line")).toHaveTextContent(
      "1. g1f3 g8f6 2. b1c3",
    );

    const move = screen.getByTestId("variation-1-move-3");
    expect(move).toHaveAttribute("data-san", "Nc3");
    await user.click(move);
    expect(onSelectMove).toHaveBeenLastCalledWith(["Nf3", "Nf6", "Nc3"]);
  });
});

describe("the space the variations take while the engine thinks", () => {
  /*
    Stepping to a new position clears the analysis, and the lines land one rank
    at a time. The block must hold its height through all of it (CTA-61): one
    row per requested line in every state — a line when it is in, a same-shaped
    placeholder when it is not. jsdom has no layout to measure, so what is
    asserted is the invariant the height rests on: the row count, and that the
    placeholder is the line row's box (`li` in the same list) rather than a
    loose line of text.
  */
  const rows = () => screen.getByTestId("best-variations").querySelectorAll("ol > li");

  it("reserves every requested row before the first result, waiting text in the first", () => {
    renderVariations({ fen: DEFAULT_POSITION, depth: 0, lines: [] }, 3);

    expect(rows()).toHaveLength(3);
    expect(screen.getByTestId("variation-1-pending")).toHaveTextContent(
      "Waiting for the engine…",
    );
    expect(screen.getByTestId("variation-2-pending")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByTestId("variation-3-pending")).toBeInTheDocument();
  });

  it("keeps the row count while the set fills in, each line taking its own rank's place", () => {
    const lines: EngineLine[] = [];
    lines[1] = line(2, -5, "d2d4");
    const { rerender } = renderVariations({ fen: DEFAULT_POSITION, depth: 14, lines }, 3);

    expect(rows()).toHaveLength(3);
    expect([...rows()].map((row) => row.getAttribute("data-testid"))).toEqual([
      "variation-1-pending",
      "variation-2",
      "variation-3-pending",
    ]);
    // Once a line is in, the waiting text is gone — the gaps are bars.
    expect(screen.getByTestId("best-variations")).not.toHaveTextContent(
      "Waiting for the engine…",
    );

    rerender(
      <AppThemeWithLang>
        <BestVariations
          analysis={{
            fen: DEFAULT_POSITION,
            depth: 16,
            lines: [line(1, 30, "e2e4"), line(2, 20, "d2d4"), line(3, 10, "c2c4")],
          }}
          requested={3}
        />
      </AppThemeWithLang>,
    );
    expect(rows()).toHaveLength(3);
    expect(screen.queryByTestId(/-pending$/)).not.toBeInTheDocument();
  });

  it("says a set is partial in the header row, not on a line under the rows", () => {
    renderVariations({ fen: DEFAULT_POSITION, depth: 14, lines: [line(1, 30, "e2e4")] }, 3);

    const partial = screen.getByTestId("variations-partial");
    expect(partial.parentElement).toContainElement(screen.getByTestId("analysis-depth"));
  });
});
