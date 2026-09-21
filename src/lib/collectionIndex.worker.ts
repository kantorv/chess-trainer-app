import { buildCollectionIndex, loadOpeningLookup } from "./collectionIndex";

/**
 * **The upload's index pass, off the main thread** — `buildCollectionIndex`
 * over the games it is sent, with the app's opening book, posting its progress
 * about ten times a second and then the rows. Run by
 * `views/library/indexCollection.ts`, which terminates it to cancel.
 *
 * In: `{ games: string[] }`. Out: `{ type: "progress", done, total }`, then
 * `{ type: "done", rows }` — or `{ type: "error", message }`.
 */

type Scope = {
  onmessage: ((event: MessageEvent<{ games: string[] }>) => void) | null;
  postMessage: (message: unknown) => void;
};
const scope = self as unknown as Scope;

scope.onmessage = async (event) => {
  try {
    const lookup = await loadOpeningLookup();
    let shown = 0;
    const { rows } = buildCollectionIndex(event.data.games, {
      lookup,
      onProgress: (done, total) => {
        const now = performance.now();
        if (done === total || now - shown > 100) {
          shown = now;
          scope.postMessage({ type: "progress", done, total });
        }
      },
    });
    scope.postMessage({ type: "done", rows });
  } catch (error) {
    scope.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
};
