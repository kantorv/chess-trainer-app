import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../i18n";
import AppThemeWithLang from "../../theme/AppThemeWithLang";
import PromotionPicker from "./PromotionPicker";

/*
  Only the SVGs are stubbed here; the placement maths under test is the picker's
  own, and `chessColumnToColumnIndex` is the real one from the library so a wrong
  orientation cannot pass by agreeing with a stub.
*/
vi.mock("react-chessboard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-chessboard")>();
  return {
    ...actual,
    defaultPieces: Object.fromEntries(
      ["wQ", "wR", "wN", "wB", "bQ", "bR", "bN", "bB"].map((key) => [
        key,
        () => <svg data-testid={`piece-${key}`} />,
      ]),
    ),
  };
});

const renderPicker = (
  overrides: Partial<{
    targetSquare: string;
    orientation: "white" | "black";
    color: "w" | "b";
  }> = {},
) => {
  const onSelect = vi.fn();
  render(
    <AppThemeWithLang>
      <PromotionPicker
        targetSquare={overrides.targetSquare ?? "e8"}
        orientation={overrides.orientation ?? "white"}
        color={overrides.color ?? "w"}
        onSelect={onSelect}
      />
    </AppThemeWithLang>,
  );
  return onSelect;
};

const picker = () => screen.getByTestId("promotion-picker");

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

describe("the promotion picker", () => {
  it("offers all four pieces, not just a queen", () => {
    renderPicker();

    // Underpromotion is the reason this component exists; a hardcoded queen is
    // a demo shortcut this screen is not allowed.
    for (const piece of ["q", "r", "n", "b"]) {
      expect(screen.getByTestId(`promotion-choice-${piece}`)).toBeInTheDocument();
    }
  });

  it("reports the chosen piece", async () => {
    const onSelect = renderPicker();

    await userEvent.click(screen.getByTestId("promotion-choice-r"));

    expect(onSelect).toHaveBeenCalledWith("r");
  });

  it("reports a dismissal as no choice at all", async () => {
    const onSelect = renderPicker();

    await userEvent.click(screen.getByTestId("promotion-scrim"));

    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("shows the promoting side's own pieces", () => {
    renderPicker({ color: "b", targetSquare: "e1" });

    expect(screen.getByTestId("piece-bQ")).toBeInTheDocument();
    expect(screen.queryByTestId("piece-wQ")).not.toBeInTheDocument();
  });

  it("stands over the file the pawn is promoting on", () => {
    // e is the fifth file, so four squares of an eight-wide board: 50%.
    expect(renderPicker({ targetSquare: "e8" }) && picker()).toHaveStyle({
      insetInlineStart: "50%",
      width: "12.5%",
    });
  });

  it("follows the file when the board is turned around", () => {
    renderPicker({ targetSquare: "e8", orientation: "black" });

    // Seen from Black, the e-file is the fourth column from the left.
    expect(picker()).toHaveStyle({ insetInlineStart: "37.5%" });
  });

  it("hangs from the edge the pawn promoted on", () => {
    // White promotes at the top of a White-facing board...
    renderPicker({ color: "w", orientation: "white", targetSquare: "e8" });
    expect(picker()).toHaveStyle({ top: "0px" });

    // ...and at the bottom once the board is turned around.
    renderPicker({ color: "w", orientation: "black", targetSquare: "e8" });
    expect(screen.getAllByTestId("promotion-picker").at(-1)).toHaveStyle({
      bottom: "0px",
    });
  });

  it("names itself and its choices for assistive tech", () => {
    renderPicker();

    expect(screen.getByRole("group", { name: "Choose a piece" })).toBeInTheDocument();
    expect(screen.getByLabelText("Knight")).toBeInTheDocument();
  });
});
