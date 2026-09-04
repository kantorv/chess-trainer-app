import { useSyncExternalStore } from "react";

import type { PgnUpload } from "../../lib/pgnUploads";
import { subscribeUploads, uploadsSnapshot } from "../../lib/pgnUploadStore";

/**
 * The reader's uploaded PGNs, as React state — the whole of the binding between
 * [`lib/pgnUploadStore.ts`](../../lib/pgnUploadStore.ts) and the components.
 *
 * `useSyncExternalStore` rather than a context or a `useState` copy: the store
 * is `localStorage`, which is shared with the other tabs and is written from
 * plain functions (`addUpload`, `removeUpload`), so React has to *read* it
 * rather than own it. The store returns the same array until its stored text
 * changes, which is the identity requirement this hook is built on.
 *
 * Two callers, and they want different things from it:
 *
 * - `PgnUploads` renders the list, so it uses the value.
 * - `Sidebar` does not use the value at all — it re-derives `navTree()`, which
 *   grows a folder per upload. Subscribing is how the new row appears without
 *   a reload.
 *
 * A hook, so `src/lib/` stays free of React — the same line the folder notes
 * draw (`views/library/folderNotes.ts`).
 */
export const useUploads = (): readonly PgnUpload[] =>
  useSyncExternalStore(subscribeUploads, uploadsSnapshot, uploadsSnapshot);
