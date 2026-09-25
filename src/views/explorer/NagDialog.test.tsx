import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import i18n from "../../i18n";
import AppThemeWithLang from "../../theme/AppThemeWithLang";
import { findNode, nodeAtSanPath, type GameTree } from "../../lib/gameTree";
import { parsePgnTree } from "../../lib/pgn";
import NagDialog from "./NagDialog";

/*
  The *Add annotation…* dialog (CTA-97): three tabs, one per section, and
  every toggle an edit through `onEditTree`. The harness holds the tree the
  way a screen's core does, so the dialog reads each edit back.
*/

const START = parsePgnTree("1. e4 e5 2. Nf3 $36 $250 Nc6 *");
const nf3 = nodeAtSanPath(START, ["e4", "e5", "Nf3"])!;

let latest: GameTree = START;
const edits = vi.fn();

function Harness() {
  const [tree, setTree] = useState(START);
  return (
    <NagDialog
      tree={tree}
      target={{ nodeId: nf3, label: "2. Nf3" }}
      onClose={vi.fn()}
      onEditTree={(next) => {
        latest = next;
        edits(next);
        setTree(next);
      }}
    />
  );
}

const mount = () =>
  render(
    <AppThemeWithLang>
      <Harness />
    </AppThemeWithLang>,
  );

const nagsNow = () => findNode(latest, nf3)?.nags;
const choice = (code: number) => screen.getByTestId(`nag-dialog-choice-${code}`);
const pressed = (code: number) => choice(code).getAttribute("aria-pressed") === "true";

beforeEach(async () => {
  latest = START;
  edits.mockClear();
  await i18n.changeLanguage("en");
});

describe("NagDialog — the tabs", () => {
  it("opens on Move Assessment, and shows each section's glyphs with their meanings", () => {
    mount();
    expect(screen.getByTestId("nag-dialog-move")).toHaveTextContent("2. Nf3↑$250");
    expect(screen.getByTestId("nag-dialog-panel-move")).toBeInTheDocument();
    expect(choice(1)).toHaveTextContent("!Good move");
    expect(choice(7)).toHaveTextContent("□Only move / forced move");

    fireEvent.click(screen.getByTestId("nag-dialog-tab-position"));
    expect(screen.getByTestId("nag-dialog-panel-position")).toBeInTheDocument();
    expect(choice(14)).toHaveTextContent("⩲White has a slight advantage");

    fireEvent.click(screen.getByTestId("nag-dialog-tab-features"));
    const features = screen.getByTestId("nag-dialog-panel-features");
    expect(within(features).getAllByRole("button")).toHaveLength(11);
    expect(choice(36)).toHaveTextContent("↑Initiative (White)");
    expect(choice(40)).toHaveTextContent("→Attack (White)");
    // What the move already carries is shown selected.
    expect(pressed(36)).toBe(true);
    expect(pressed(40)).toBe(false);
  });
});

describe("NagDialog — selecting", () => {
  it("sets a move assessment, replaces it, and removes it when picked again", () => {
    mount();
    fireEvent.click(choice(1));
    expect(nagsNow()).toEqual([36, 250, 1]);
    expect(pressed(1)).toBe(true);
    expect(screen.getByTestId("nag-dialog-move")).toHaveTextContent("2. Nf3!↑$250");

    fireEvent.click(choice(4));
    expect(nagsNow()).toEqual([36, 250, 4]);
    expect(pressed(1)).toBe(false);
    expect(pressed(4)).toBe(true);

    fireEvent.click(choice(4));
    expect(nagsNow()).toEqual([36, 250]);
    expect(pressed(4)).toBe(false);
    expect(edits).toHaveBeenCalledTimes(3);
  });

  it("keeps one evaluation beside the move assessment", () => {
    mount();
    fireEvent.click(choice(3));
    fireEvent.click(screen.getByTestId("nag-dialog-tab-position"));
    fireEvent.click(choice(16));
    fireEvent.click(choice(19));
    expect(nagsNow()).toEqual([36, 250, 3, 19]);
    expect(pressed(16)).toBe(false);
    expect(pressed(19)).toBe(true);
  });

  it("toggles several positional features at once", () => {
    mount();
    fireEvent.click(screen.getByTestId("nag-dialog-tab-features"));
    fireEvent.click(choice(40));
    fireEvent.click(choice(146));
    expect(nagsNow()).toEqual([36, 250, 40, 146]);
    expect([36, 40, 146].every(pressed)).toBe(true);

    fireEvent.click(choice(36));
    expect(nagsNow()).toEqual([250, 40, 146]);
    expect(pressed(36)).toBe(false);
  });

  it("removes the move's last glyph field entirely when the last glyph goes", () => {
    const marked = parsePgnTree("1. e4! *");
    render(
      <AppThemeWithLang>
        <NagDialog
          tree={marked}
          target={{ nodeId: marked.moves[0].id, label: "1. e4" }}
          onClose={vi.fn()}
          onEditTree={edits}
        />
      </AppThemeWithLang>,
    );
    fireEvent.click(choice(1));
    const [next] = edits.mock.calls[0] as [GameTree];
    expect("nags" in next.moves[0]).toBe(false);
  });
});
