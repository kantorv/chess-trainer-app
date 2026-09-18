import { useSyncExternalStore } from "react";

import type { SavedRepertoire } from "../../lib/savedRepertoires";
import {
  savedRepertoiresSnapshot,
  subscribeSavedRepertoires,
} from "../../lib/savedRepertoireStore";

/**
 * The reader's repertoires, as React state — the whole of the binding between
 * [`lib/savedRepertoireStore.ts`](../../lib/savedRepertoireStore.ts) and the
 * components, for the reason `views/engine/saved/useSavedGames.ts` gives: the
 * store is `localStorage`, shared with the other tabs, so React has to *read*
 * it rather than own it. A hook, so `src/lib/` stays free of React.
 */
export const useSavedRepertoires = (): readonly SavedRepertoire[] =>
  useSyncExternalStore(
    subscribeSavedRepertoires,
    savedRepertoiresSnapshot,
    savedRepertoiresSnapshot,
  );
