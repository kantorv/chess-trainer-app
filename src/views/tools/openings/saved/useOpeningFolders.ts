import { useSyncExternalStore } from "react";

import type { OpeningFolder } from "../../../../lib/savedOpeningFolders";
import {
  openingFoldersSnapshot,
  subscribeOpeningFolders,
} from "../../../../lib/savedOpeningFolderStore";

/**
 * The reader's saved-opening folders, as React state — the whole of the binding
 * between [`lib/savedOpeningFolderStore.ts`](../../../../lib/savedOpeningFolderStore.ts)
 * and the components. `views/tools/openings/saved/useSavedOpenings.ts` again,
 * over the folders' own store, for the same reason: the store is
 * `localStorage`, shared with the other tabs and written from plain functions
 * called out of button handlers on a different screen, so React has to *read*
 * it rather than own it.
 */
export const useOpeningFolders = (): readonly OpeningFolder[] =>
  useSyncExternalStore(
    subscribeOpeningFolders,
    openingFoldersSnapshot,
    openingFoldersSnapshot,
  );
