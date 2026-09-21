import { describe, expect, it } from "vitest";

import { DEFAULT_ANALYSIS_SETTINGS } from "./analysisSettings";
import { emptyTree } from "./gameTree";
import { savedAnalysisOf } from "./savedAnalyses";
import {
  analysesHere,
  analysesInFolder,
  analysisFolderChildren,
  analysisFolderPath,
} from "./savedAnalysisFolders";
import {
  analysisFoldersSnapshot,
  ANALYSIS_FOLDERS_STORAGE_KEY,
  createAnalysisFolder,
  moveAnalysisFolder,
  removeAnalysisFolder,
  renameAnalysisFolder,
} from "./savedAnalysisFolderStore";
/** The key the old saved games' folders were kept under (removed with that list, CTA-74). */
const GAME_FOLDERS_STORAGE_KEY = "chessapp.savedGameFolders.v1";
import {
  addAnalyses,
  findSavedAnalysis,
  savedAnalysesSnapshot,
} from "./savedAnalysisStore";

/*
  The analyses' nested folders (CTA-73) — the saved games' model over its own
  key: create hands the folder back, a move refuses the folder's own subtree,
  and a delete keeps the contents.
*/

const analysis = (id: string, folderId: string | null) => ({
  ...savedAnalysisOf(id, emptyTree(), [], DEFAULT_ANALYSIS_SETTINGS, "white"),
  folderId,
});

describe("the saved-analysis folders", () => {
  it("live under their own key, apart from the games' folders", () => {
    expect(ANALYSIS_FOLDERS_STORAGE_KEY).not.toBe(GAME_FOLDERS_STORAGE_KEY);
    createAnalysisFolder("Openings", null);
    expect(localStorage.getItem(GAME_FOLDERS_STORAGE_KEY)).toBeNull();
    expect(analysisFoldersSnapshot()).toHaveLength(1);
  });

  it("creates, nests and renames — refusing an empty name and an unknown parent", () => {
    const top = createAnalysisFolder("  Openings ", null)!;
    const child = createAnalysisFolder("Sicilian", top.id)!;
    expect(top.name).toBe("Openings");
    expect(createAnalysisFolder("   ", null)).toBeUndefined();
    expect(createAnalysisFolder("Lost", "nowhere")).toBeUndefined();

    renameAnalysisFolder(child.id, "Najdorf");
    const folders = analysisFoldersSnapshot();
    expect(analysisFolderChildren(folders, top.id).map((folder) => folder.name)).toEqual([
      "Najdorf",
    ]);
    expect(analysisFolderPath(folders, child.id).map((folder) => folder.name)).toEqual([
      "Openings",
      "Najdorf",
    ]);
  });

  it("refuses to move a folder into its own subtree", () => {
    const a = createAnalysisFolder("A", null)!;
    const b = createAnalysisFolder("B", a.id)!;
    moveAnalysisFolder(a.id, b.id);
    expect(analysisFoldersSnapshot().find((folder) => folder.id === a.id)?.parentId).toBeNull();

    const c = createAnalysisFolder("C", null)!;
    moveAnalysisFolder(c.id, b.id);
    expect(analysisFoldersSnapshot().find((folder) => folder.id === c.id)?.parentId).toBe(b.id);
  });

  it("keeps a deleted folder's contents: sub-folders up a level, analyses Unfiled", () => {
    const a = createAnalysisFolder("A", null)!;
    const b = createAnalysisFolder("B", a.id)!;
    const c = createAnalysisFolder("C", b.id)!;
    addAnalyses([analysis("in-b", b.id), analysis("in-c", c.id)]);

    // The subtree's count before the delete: both, directly and not.
    expect(
      analysesInFolder(savedAnalysesSnapshot(), analysisFoldersSnapshot(), b.id).map(
        (row) => row.id,
      ),
    ).toEqual(["in-b", "in-c"]);

    removeAnalysisFolder(b.id);

    expect(analysisFoldersSnapshot().find((folder) => folder.id === c.id)?.parentId).toBe(a.id);
    expect(findSavedAnalysis("in-b")?.folderId).toBeNull();
    expect(findSavedAnalysis("in-c")?.folderId).toBe(c.id);
  });

  it("lists an analysis naming a folder that is gone at the top level", () => {
    addAnalyses([analysis("stray", "gone"), analysis("top", null)]);
    expect(
      analysesHere(savedAnalysesSnapshot(), analysisFoldersSnapshot(), null).map(
        (row) => row.id,
      ),
    ).toEqual(["stray", "top"]);
  });
});
