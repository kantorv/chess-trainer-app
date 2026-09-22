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
  createAnalysisFolder,
  loadAnalysisFolders,
  MAX_ANALYSIS_FOLDERS,
  moveAnalysisFolder,
  removeAnalysisFolder,
  renameAnalysisFolder,
  resetAnalysisFolderStore,
} from "./savedAnalysisFolderStore";
import {
  addAnalyses,
  findSavedAnalysis,
  loadSavedAnalyses,
  savedAnalysesSnapshot,
} from "./savedAnalysisStore";

/*
  The analyses' nested folders (CTA-73) — the saved games' model over its own
  store (IndexedDB since CTA-77): create hands the folder back, a move refuses
  the folder's own subtree, and a delete keeps the contents.
*/

const analysis = (id: string, folderId: string | null) => ({
  ...savedAnalysisOf(id, emptyTree(), [], DEFAULT_ANALYSIS_SETTINGS, "white"),
  folderId,
});

const folders = () => analysisFoldersSnapshot() ?? [];

describe("the saved-analysis folders", () => {
  it("are read once, and kept: undefined until then", async () => {
    expect(analysisFoldersSnapshot()).toBeUndefined();
    expect(await loadAnalysisFolders()).toEqual([]);
    expect(analysisFoldersSnapshot()).toEqual([]);
  });

  it("creates, nests and renames — refusing an empty name and an unknown parent", async () => {
    const top = (await createAnalysisFolder("  Openings ", null))!;
    const child = (await createAnalysisFolder("Sicilian", top.id))!;
    expect(top.name).toBe("Openings");
    expect(await createAnalysisFolder("   ", null)).toBeUndefined();
    expect(await createAnalysisFolder("Lost", "nowhere")).toBeUndefined();

    await renameAnalysisFolder(child.id, "Najdorf");
    expect(analysisFolderChildren(folders(), top.id).map((folder) => folder.name)).toEqual([
      "Najdorf",
    ]);
    expect(analysisFolderPath(folders(), child.id).map((folder) => folder.name)).toEqual([
      "Openings",
      "Najdorf",
    ]);
  });

  it("keeps them in creation order, across a fresh read", async () => {
    await createAnalysisFolder("First", null);
    await createAnalysisFolder("Second", null);
    await createAnalysisFolder("Third", null);
    await renameAnalysisFolder(folders()[0].id, "First, renamed");

    resetAnalysisFolderStore();
    expect((await loadAnalysisFolders()).map((folder) => folder.name)).toEqual([
      "First, renamed",
      "Second",
      "Third",
    ]);
  });

  it("refuses a folder past the cap", async () => {
    for (let index = 0; index < MAX_ANALYSIS_FOLDERS; index += 1) {
      await createAnalysisFolder(`F${index}`, null);
    }
    expect(await createAnalysisFolder("One too many", null)).toBeUndefined();
    expect(folders()).toHaveLength(MAX_ANALYSIS_FOLDERS);
  });

  it("refuses to move a folder into its own subtree", async () => {
    const a = (await createAnalysisFolder("A", null))!;
    const b = (await createAnalysisFolder("B", a.id))!;
    await moveAnalysisFolder(a.id, b.id);
    expect(folders().find((folder) => folder.id === a.id)?.parentId).toBeNull();

    const c = (await createAnalysisFolder("C", null))!;
    await moveAnalysisFolder(c.id, b.id);
    expect(folders().find((folder) => folder.id === c.id)?.parentId).toBe(b.id);
  });

  it("keeps a deleted folder's contents: sub-folders up a level, analyses Unfiled", async () => {
    const a = (await createAnalysisFolder("A", null))!;
    const b = (await createAnalysisFolder("B", a.id))!;
    const c = (await createAnalysisFolder("C", b.id))!;
    await addAnalyses([analysis("in-b", b.id), analysis("in-c", c.id)]);

    // The subtree's count before the delete: both, directly and not.
    expect(
      analysesInFolder(savedAnalysesSnapshot() ?? [], folders(), b.id).map((row) => row.id),
    ).toEqual(["in-b", "in-c"]);

    await removeAnalysisFolder(b.id);

    expect(folders().find((folder) => folder.id === c.id)?.parentId).toBe(a.id);
    expect(findSavedAnalysis("in-b")?.folderId).toBeNull();
    expect(findSavedAnalysis("in-c")?.folderId).toBe(c.id);
  });

  it("lists an analysis naming a folder that is gone at the top level", async () => {
    await addAnalyses([analysis("stray", "gone"), analysis("top", null)]);
    await loadAnalysisFolders();
    expect(
      analysesHere(await loadSavedAnalyses(), folders(), null).map((row) => row.id),
    ).toEqual(["stray", "top"]);
  });
});
