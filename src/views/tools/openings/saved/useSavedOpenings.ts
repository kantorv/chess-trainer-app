import { useSyncExternalStore } from "react";

import type { SavedOpening } from "../../../../lib/savedOpenings";
import {
  savedOpeningsSnapshot,
  subscribeSavedOpenings,
} from "../../../../lib/savedOpeningStore";

/**
 * The reader's saved openings, as React state — the whole of the binding
 * between [`lib/savedOpeningStore.ts`](../../../../lib/savedOpeningStore.ts)
 * and the components.
 *
 * `useSyncExternalStore` rather than a context or a `useState` copy, for the
 * reason `views/engine/saved/useSavedGames.ts` gives: the store is
 * `localStorage`, shared with the other tabs and written from plain functions
 * called out of a button handler on a different screen, so React has to *read*
 * it rather than own it. A hook, so `src/lib/` stays free of React.
 */
export const useSavedOpenings = (): readonly SavedOpening[] =>
  useSyncExternalStore(
    subscribeSavedOpenings,
    savedOpeningsSnapshot,
    savedOpeningsSnapshot,
  );