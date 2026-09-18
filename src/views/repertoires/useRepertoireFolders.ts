import { useSyncExternalStore } from "react";

import type { RepertoireFolder } from "../../lib/savedRepertoireFolders";
import {
  repertoireFoldersSnapshot,
  subscribeRepertoireFolders,
} from "../../lib/savedRepertoireFolderStore";

/**
 * The reader's repertoire folders, as React state — `useSavedRepertoires`
 * again, over the folders' own store.
 */
export const useRepertoireFolders = (): readonly RepertoireFolder[] =>
  useSyncExternalStore(
    subscribeRepertoireFolders,
    repertoireFoldersSnapshot,
    repertoireFoldersSnapshot,
  );
