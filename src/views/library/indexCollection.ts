import {
  buildCollectionIndexAsync,
  loadOpeningLookup,
  type IndexedRow,
} from "../../lib/collectionIndex";

/**
 * **Index an upload's games before it is kept** (CTA-75) — the full
 * `chess.js` pass of `lib/collectionIndex.ts`, about 8 ms a game, so a
 * 10,000-game upload is over a minute of work. It runs in a **Web Worker**
 * (`lib/collectionIndex.worker.ts`), so the page stays responsive and paints
 * the progress; where there is no worker (a test's jsdom) it runs here, in
 * batches that yield between them.
 *
 * `signal` cancels: the worker is terminated and the promise rejects with an
 * `AbortError`.
 */
export const indexCollection = (
  games: readonly string[],
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<IndexedRow[]> => {
  if (typeof Worker === "undefined") {
    return loadOpeningLookup().then((lookup) =>
      buildCollectionIndexAsync(games, { lookup, onProgress, signal }).then((index) => index.rows),
    );
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../../lib/collectionIndex.worker.ts", import.meta.url), {
      type: "module",
    });
    const finish = () => {
      worker.terminate();
      signal?.removeEventListener("abort", cancel);
    };
    const cancel = () => {
      finish();
      reject(new DOMException("Indexing cancelled", "AbortError"));
    };
    if (signal?.aborted) {
      cancel();
      return;
    }
    signal?.addEventListener("abort", cancel);
    worker.onmessage = (
      event: MessageEvent<
        | { type: "progress"; done: number; total: number }
        | { type: "done"; rows: IndexedRow[] }
        | { type: "error"; message: string }
      >,
    ) => {
      const message = event.data;
      if (message.type === "progress") onProgress(message.done, message.total);
      else if (message.type === "done") {
        finish();
        resolve(message.rows);
      } else {
        finish();
        reject(new Error(message.message));
      }
    };
    worker.onerror = (event) => {
      finish();
      reject(new Error(event.message || "The indexing worker failed"));
    };
    worker.postMessage({ games: [...games] });
  });
};
