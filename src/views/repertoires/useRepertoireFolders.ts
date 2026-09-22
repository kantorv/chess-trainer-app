import { useSyncExternalStore } from "react";

import type { RepertoireFolder } from "../../lib/savedRepertoireFolders";
import {
  repertoireFoldersSnapshot,
  subscribeRepertoireFolders,
} from "../../lib/savedRepertoireFolderStore";

/**
 * The reader's repertoire folders, as React state — `useSavedRepertoires`
 * again, over the folders' own store — `undefined` while its first read is out.
 */
export const useRepertoireFolders = (): readonly RepertoireFolder[] | undefined =>
  useSyncExternalStore(
    subscribeRepertoireFolders,
    repertoireFoldersSnapshot,
    repertoireFoldersSnapshot,
  );
