import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import i18n from "../../i18n";
import AppThemeWithLang from "../../theme/AppThemeWithLang";
import CapturedPieces from "./CapturedPieces";
import type { CapturedPieceLetter } from "../../lib/capturedPieces";

/*
  Only the SVGs are stood in for here — the strip's own work is the icon lookup
  (a capture is always of the opponent's man, so White's captured pawn is drawn
  as a *black* pawn) and the diff beside the side that is ahead. The stand-ins
  need the two colours distinguishable, which is how a test reads which man a
  strip shows.
*/
vi.mock("react-chessboard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-chessboard")>();
  return {
    ...actual,
    defaultPieces: Object.fromEntries(
      ["w", "b"].flatMap((color) =>
        ["K", "Q", "R", "B", "N", "P"].map((letter) => {
          const type = `${color}${letter}`;
          return [type, () => <svg data-testid={`piece-${type}`} />];
        }),
      ),
    ),
  };
});

const renderStrip = (
  overrides: Partial<{
    color: "white" | "black";
    captured: readonly CapturedPieceLetter[];
    diff: number | null;
  }> = {},
) =>
  render(
    <AppThemeWithLang>
      <CapturedPieces
        testId="strip"
        color={overrides.color ?? "white"}
        captured={overrides.captured ?? []}
        diff={overrides.diff ?? null}
      />
    </AppThemeWithLang>,
  );

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

describe("CapturedPieces — the strip beside the board", () => {
  it("draws each captured piece at the opponent's colour", () => {
    renderStrip({ color: "white", captured: ["p", "q"] });

    // White took a black pawn and a black queen, so both are black icons.
    expect(screen.getByTestId("strip-white-piece-0")).toContainElement(
      screen.getByTestId("piece-bP"),
    );
    expect(screen.getByTestId("strip-white-piece-1")).toContainElement(
      screen.getByTestId("piece-bQ"),
    );
    expect(screen.queryByTestId("piece-wP")).not.toBeInTheDocument();
  });

  it("draws white icons on Black's strip", () => {
    renderStrip({ color: "black", captured: ["n"] });

    expect(screen.getByTestId("strip-black-piece-0")).toContainElement(
      screen.getByTestId("piece-wN"),
    );
  });

  it("names itself by the side that took the pieces, for screen readers", () => {
    renderStrip({ color: "white" });

    expect(screen.getByTestId("strip-white")).toHaveAttribute(
      "aria-label",
      "Captured by White",
    );
  });

  it("shows the material diff while this side is ahead", () => {
    renderStrip({ color: "white", captured: ["p", "p"], diff: 2 });

    expect(screen.getByTestId("strip-white")).toHaveAttribute("data-diff", "2");
    expect(screen.getByTestId("strip-white")).toHaveTextContent("+2");
  });

  it("hides the diff when this side is level or behind", () => {
    renderStrip({ color: "white", diff: null });

    expect(screen.getByTestId("strip-white")).not.toHaveAttribute("data-diff");
    expect(screen.getByTestId("strip-white")).not.toHaveTextContent("+");
  });

  it("renders even when empty, so the board's size stays steady", () => {
    // A study with no captures shows empty strips, not a board that resizes
    // when the first capture lands.
    renderStrip({ color: "black" });

    expect(screen.getByTestId("strip-black")).toBeInTheDocument();
    expect(screen.queryByTestId(/^strip-black-piece-/)).not.toBeInTheDocument();
  });
});
