import { useSyncExternalStore } from "react";

import type { AnalysisFolder } from "../../../../lib/savedAnalysisFolders";
import {
  analysisFoldersSnapshot,
  subscribeAnalysisFolders,
} from "../../../../lib/savedAnalysisFolderStore";

/**
 * The reader's saved-analysis folders, as React state (CTA-73) — the binding
 * between [`lib/savedAnalysisFolderStore.ts`](../../../../lib/savedAnalysisFolderStore.ts)
 * and the components, `useSavedAnalyses.ts` again: `undefined` while the
 * store's first read is out.
 */
export const useAnalysisFolders = (): readonly AnalysisFolder[] | undefined =>
  useSyncExternalStore(
    subscribeAnalysisFolders,
    analysisFoldersSnapshot,
    analysisFoldersSnapshot,
  );
