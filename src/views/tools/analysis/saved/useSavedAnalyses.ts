import { useSyncExternalStore } from "react";

import type { SavedAnalysis } from "../../../../lib/savedAnalyses";
import {
  savedAnalysesSnapshot,
  subscribeSavedAnalyses,
} from "../../../../lib/savedAnalysisStore";

/**
 * The reader's saved analysis boards, as React state — the whole of the binding
 * between [`lib/savedAnalysisStore.ts`](../../../../lib/savedAnalysisStore.ts)
 * and the components. **`undefined` while the store's first read is out**
 * (IndexedDB since CTA-77 — a read is a promise); subscribing starts it, and
 * every later visit renders the kept list on its first frame.
 *
 * `useSyncExternalStore` rather than a context or a `useState` copy, for the
 * reason `views/engine/games/usePlayedGames.ts` gives: the store is shared with
 * the other tabs and written from plain functions called out of button
 * handlers on a different screen, so React has to *read* it rather than own
 * it. A hook, so `src/lib/` stays free of React.
 */
export const useSavedAnalyses = (): readonly SavedAnalysis[] | undefined =>
  useSyncExternalStore(
    subscribeSavedAnalyses,
    savedAnalysesSnapshot,
    savedAnalysesSnapshot,
  );
