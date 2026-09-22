import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";

import i18n from "../../../../i18n";
import { DEFAULT_ANALYSIS_SETTINGS } from "../../../../lib/analysisSettings";
import { parsePgnTree } from "../../../../lib/pgn";
import { savedAnalysisOf } from "../../../../lib/savedAnalyses";
import { createAnalysisFolder } from "../../../../lib/savedAnalysisFolderStore";
import {
  findSavedAnalysis,
  saveAnalysis,
  savedAnalysesSnapshot,
} from "../../../../lib/savedAnalysisStore";
import AppThemeWithLang from "../../../../theme/AppThemeWithLang";
import { RightPanelOutlet, RightPanelProvider } from "../../../main/rightPanel";
import AnalysisSettingsScreen from "./AnalysisSettingsScreen";

/*
  A saved analysis' settings (CTA-73): title, description, side, arrows and
  folder — one draft, written on Save, dropped on Cancel.
*/

function Where() {
  const location = useLocation();
  return <div data-testid="where">{`${location.pathname}${location.search}`}</div>;
}

const mount = (id: string) =>
  render(
    <AppThemeWithLang>
      <MemoryRouter initialEntries={[`/tools/analysis/saved/${id}/settings`]}>
        <RightPanelProvider>
          <Routes>
            <Route path="/tools/analysis/saved/:id/settings" element={<AnalysisSettingsScreen />} />
            <Route path="*" element={<div data-testid="elsewhere" />} />
          </Routes>
          <Where />
          <RightPanelOutlet />
        </RightPanelProvider>
      </MemoryRouter>
    </AppThemeWithLang>,
  );

const store = (id: string) =>
  saveAnalysis({
    ...savedAnalysisOf(id, parsePgnTree("1. e4 e5 *"), ["e4"], DEFAULT_ANALYSIS_SETTINGS, "white"),
    name: "Open game",
  });

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

describe("a saved analysis' settings screen", () => {
  it("says it is reading, then that the analysis is not there", async () => {
    mount("nothing");
    expect(screen.getByTestId("analysis-settings-loading")).toBeInTheDocument();
    expect(await screen.findByTestId("analysis-settings-missing")).toBeInTheDocument();
  });

  it("seeds the draft from the record", async () => {
    await store("a1");
    mount("a1");
    expect(await screen.findByTestId("analysis-settings-name")).toHaveValue("Open game");
    expect(screen.getByTestId("analysis-settings-description")).toHaveValue("");
    expect(screen.getByTestId("analysis-settings-color-white")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("analysis-settings-show-arrows")).toBeChecked();
  });

  it("writes title, description, side, arrows and folder on Save, and goes to the board", async () => {
    await store("a1");
    await store("a2");
    const folder = (await createAnalysisFolder("Openings", null))!;
    mount("a1");

    fireEvent.change(await screen.findByTestId("analysis-settings-name"), {
      target: { value: "Italian" },
    });
    fireEvent.change(screen.getByTestId("analysis-settings-description"), {
      target: { value: "Giuoco piano ideas." },
    });
    fireEvent.click(screen.getByTestId("analysis-settings-color-black"));
    fireEvent.click(screen.getByTestId("analysis-settings-show-arrows"));
    fireEvent.click(screen.getByTestId(`analysis-settings-folder-picker-${folder.id}`));
    fireEvent.click(screen.getByTestId("analysis-settings-save"));

    await waitFor(() =>
      expect(screen.getByTestId("where")).toHaveTextContent("/tools/analysis?analysis=a1"),
    );
    expect(findSavedAnalysis("a1")).toMatchObject({
      name: "Italian",
      description: "Giuoco piano ideas.",
      orientation: "black",
      showArrows: false,
      folderId: folder.id,
    });
    // In place: the list's order is kept.
    expect(savedAnalysesSnapshot()?.map((row) => row.id)).toEqual(["a2", "a1"]);
  });

  it("writes nothing on Cancel", async () => {
    await store("a1");
    mount("a1");
    fireEvent.change(await screen.findByTestId("analysis-settings-name"), {
      target: { value: "Changed" },
    });
    fireEvent.click(screen.getByTestId("analysis-settings-cancel"));
    expect(findSavedAnalysis("a1")?.name).toBe("Open game");
  });
});
