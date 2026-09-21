import { useSyncExternalStore } from "react";

import type { AnalysisFolder } from "../../../../lib/savedAnalysisFolders";
import {
  analysisFoldersSnapshot,
  subscribeAnalysisFolders,
} from "../../../../lib/savedAnalysisFolderStore";

/**
 * The reader's saved-analysis folders, as React state (CTA-73) — the binding
 * between [`lib/savedAnalysisFolderStore.ts`](../../../../lib/savedAnalysisFolderStore.ts)
 * and the components, `views/engine/saved/useGameFolders.ts` again.
 */
export const useAnalysisFolders = (): readonly AnalysisFolder[] =>
  useSyncExternalStore(
    subscribeAnalysisFolders,
    analysisFoldersSnapshot,
    analysisFoldersSnapshot,
  );
