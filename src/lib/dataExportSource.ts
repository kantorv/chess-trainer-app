import {
  buildExport,
  exportedCollections,
  exportFileName,
  zipExport,
  type ExportCollection,
  type ExportSelection,
  type ExportSource,
} from "./dataExport";
import { loadUploadedCollections, loadUploadedGames } from "./libraryCollectionStore";
import { loadLibraryFolders } from "./libraryFolderStore";
import type { CollectionSummary } from "./libraryCollections";
import { loadPlayedGames } from "./playedGameStore";
import { loadAnalysisFolders } from "./savedAnalysisFolderStore";
import { loadSavedAnalyses } from "./savedAnalysisStore";
import { loadRepertoireFolders } from "./savedRepertoireFolderStore";
import { loadSavedRepertoires } from "./savedRepertoireStore";
import { findShippedCollection, shippedCollections } from "./shippedCollections";

/**
 * **The export's reads** (CTA-86) — the stores behind a selection, read now if
 * they have not been, into the {@link ExportSource} `lib/dataExport.ts` builds
 * from. Every store is an IndexedDB snapshot that is `undefined` until its
 * first read lands, so the export asks for each rather than trusting what a
 * screen happens to have subscribed to. Only what is ticked is read; a
 * shipped collection's PGN is a lazy chunk, fetched only with its box ticked.
 *
 * Reads only — nothing here writes.
 */

const NOTHING: readonly never[] = [];

/** Why an export stopped: a collection's games could not be read. */
export class ExportReadError extends Error {
  readonly collection: string;
  constructor(collection: string) {
    super(`The games of "${collection}" could not be read`);
    this.collection = collection;
  }
}

/** One collection's games, or `null` when they are not there. Never rejects. */
const gamesOf = async (summary: CollectionSummary): Promise<readonly string[] | null> => {
  if (summary.source === "shipped") {
    const entry = findShippedCollection(summary.id);
    return entry === undefined ? null : entry.loadGames().catch(() => null);
  }
  return loadUploadedGames(summary.id);
};

/**
 * Every collection a selection could export — the reader's uploads, newest
 * first, then the shipped ones in name order.
 */
const loadCollectionSummaries = async (): Promise<readonly CollectionSummary[]> => [
  ...(await loadUploadedCollections()),
  ...shippedCollections,
];

/**
 * Read what a selection needs. Rejects with an {@link ExportReadError} when a
 * collection's games cannot be read — an export missing a collection would
 * look complete and not be.
 */
const loadExportSource = async (selection: ExportSelection): Promise<ExportSource> => {
  const [playedGames, analyses, analysisFolders, repertoires, repertoireFolders, summaries, collectionFolders] =
    await Promise.all([
      selection.games ? loadPlayedGames() : NOTHING,
      selection.analyses ? loadSavedAnalyses() : NOTHING,
      selection.analyses ? loadAnalysisFolders() : NOTHING,
      selection.repertoires ? loadSavedRepertoires() : NOTHING,
      selection.repertoires ? loadRepertoireFolders() : NOTHING,
      selection.collections ? loadCollectionSummaries() : NOTHING,
      selection.collections ? loadLibraryFolders() : NOTHING,
    ]);

  const collections: ExportCollection[] = [];
  for (const summary of exportedCollections(summaries, selection)) {
    const games = await gamesOf(summary);
    if (games === null) throw new ExportReadError(summary.name);
    collections.push({ summary, games });
  }

  return { playedGames, analyses, analysisFolders, repertoires, repertoireFolders, collections, collectionFolders };
};

/** The zip for a selection: its bytes and what the download is called. */
export const exportZip = async (
  selection: ExportSelection,
  { appVersion, now = new Date() }: { appVersion: string; now?: Date },
): Promise<{ fileName: string; bytes: Uint8Array<ArrayBuffer> }> => {
  const source = await loadExportSource(selection);
  return {
    fileName: exportFileName(now),
    bytes: zipExport(buildExport(source, selection, { appVersion, now })),
  };
};
