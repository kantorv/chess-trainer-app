import { useSyncExternalStore } from "react";

import type { GameFolder } from "../../../lib/savedGameFolders";
import {
  gameFoldersSnapshot,
  subscribeGameFolders,
} from "../../../lib/savedGameFolderStore";

/**
 * The reader's saved-game folders, as React state — the whole of the binding
 * between [`lib/savedGameFolderStore.ts`](../../../lib/savedGameFolderStore.ts)
 * and the components. `views/tools/openings/saved/useOpeningFolders.ts` again,
 * over the games folders' own store, for the same reason: the store is
 * `localStorage`, shared with the other tabs and written from plain functions
 * called out of button handlers on a different screen, so React has to *read*
 * it rather than own it.
 */
export const useGameFolders = (): readonly GameFolder[] =>
  useSyncExternalStore(
    subscribeGameFolders,
    gameFoldersSnapshot,
    gameFoldersSnapshot,
  );
