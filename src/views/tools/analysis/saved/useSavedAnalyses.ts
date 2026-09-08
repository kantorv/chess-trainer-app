import { useSyncExternalStore } from "react";

import type { SavedAnalysis } from "../../../../lib/savedAnalyses";
import {
  savedAnalysesSnapshot,
  subscribeSavedAnalyses,
} from "../../../../lib/savedAnalysisStore";

/**
 * The reader's saved analysis boards, as React state — the whole of the binding
 * between [`lib/savedAnalysisStore.ts`](../../../../lib/savedAnalysisStore.ts)
 * and the components.
 *
 * `useSyncExternalStore` rather than a context or a `useState` copy, for the
 * reason `views/engine/saved/useSavedGames.ts` gives: the store is
 * `localStorage`, shared with the other tabs and written from plain functions
 * called out of an effect on a different screen, so React has to *read* it
 * rather than own it. A hook, so `src/lib/` stays free of React.
 */
export const useSavedAnalyses = (): readonly SavedAnalysis[] =>
  useSyncExternalStore(
    subscribeSavedAnalyses,
    savedAnalysesSnapshot,
    savedAnalysesSnapshot,
  );
