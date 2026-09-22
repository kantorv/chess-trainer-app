import { strToU8, zipSync } from "fflate";

import type { AnalysisSettings } from "./analysisSettings";
import type { EngineSettings } from "./engineSettings";
import type { CollectionSummary } from "./libraryCollections";
import { splitPgnGames } from "./pgn";
import { isoDate, pgnFileOf } from "./pgnExport";
import { slugify } from "./pgnText";
import type { PlayedGame, PlayedGameMask } from "./playedGames";
import type { RepertoireSettings } from "./repertoireSettings";
import type { SavedAnalysis } from "./savedAnalyses";
import { analysisFolderPath, type AnalysisFolder } from "./savedAnalysisFolders";
import {
  repertoiresInFolder,
  sortedRepertoireFolders,
  type RepertoireFolder,
} from "./savedRepertoireFolders";
import type { RepertoireStats, SavedRepertoire } from "./savedRepertoires";

/**
 * **Taking everything out at once** (CTA-86) — the Settings section's Export:
 * the reader's data as PGN files, plus a `manifest.json` that says how those
 * files map back to records and folders, all in one zip.
 *
 * Pure: the records come in, the files and the manifest come out, and
 * {@link zipExport} packs them. Reading the stores and saving the download are
 * the screen's (`views/settings/`, `lib/pgnExport.ts`'s `downloadBinaryFile`).
 *
 * ## The layout of the zip
 *
 * | Category | Files | One game per |
 * | --- | --- | --- |
 * | Games | `games.pgn` | played game (Play with Engine, Masked Pieces) |
 * | Analyses | `analyses.pgn` | saved analysis |
 * | Collections | `collections/<name>.pgn`, one per collection | game of the collection |
 * | Repertoires | `repertoires/<folder>.pgn` per folder, and `repertoires/unfiled.pgn` | repertoire |
 *
 * Every PGN is the stored text joined as it stands (`pgnFileOf`) — nothing is
 * re-serialised, so a record this build cannot read still exports byte for
 * byte. A file with no games in it is not written. File names are slugified
 * ({@link slugify}; a name with no ASCII falls back to the record's id, or
 * `folder`) and made unique inside their directory with `-2`, `-3`, ….
 *
 * ## The manifest
 *
 * What a future import needs to rebuild the records and their folders: one
 * entry per file, naming its `kind` and, in file order, the records it holds
 * with everything a record carries beside its PGN. `index` is the record's
 * first game in the file (0-based) and `games` how many it spans — always one,
 * except a legacy repertoire holding several (`isMultiGameRepertoire`). The
 * folder trees ride along whole under `folders`, so an empty folder survives.
 */

/** The manifest's shape. Bumped on any change a reader of an older one would misread. */
const EXPORT_FORMAT_VERSION = 1;

/** What the manifest calls itself — how an import tells it from any other JSON. */
const EXPORT_FORMAT = "chessapp-export";

type CollectionSource = CollectionSummary["source"];

/** The four things the reader ticks. */
export const EXPORT_CATEGORIES = ["collections", "games", "analyses", "repertoires"] as const;
export type ExportCategory = (typeof EXPORT_CATEGORIES)[number];

/** What the reader ticked. */
export type ExportSelection = Readonly<Record<ExportCategory, boolean>> & {
  /** Shipped collections too — uploaded ones always go when `collections` is ticked. */
  readonly shippedCollections: boolean;
};

/** One collection with its games, as the screen read it. */
export type ExportCollection = {
  summary: CollectionSummary;
  /** One PGN chunk per game, in file order. */
  games: readonly string[];
};

/** Every record the export may draw on. A category not ticked may be left empty. */
export type ExportSource = {
  playedGames: readonly PlayedGame[];
  analyses: readonly SavedAnalysis[];
  analysisFolders: readonly AnalysisFolder[];
  repertoires: readonly SavedRepertoire[];
  repertoireFolders: readonly RepertoireFolder[];
  collections: readonly ExportCollection[];
};

/** Where a record sits in its file. */
type Placed = { index: number; games: number };

type PlayedGameEntry = Placed & {
  id: string;
  settings: EngineSettings;
  path: readonly string[];
  resigned?: "white" | "black";
  mask?: PlayedGameMask;
  savedAt: string;
  updatedAt: string;
};

type AnalysisEntry = Placed & {
  id: string;
  name: string;
  description: string;
  orientation: "white" | "black";
  showArrows: boolean;
  settings: AnalysisSettings;
  path: readonly string[];
  /** Folder names from the top down; `[]` is Unfiled. */
  folderPath: readonly string[];
  savedAt: string;
  updatedAt: string;
};

type RepertoireEntry = Placed & {
  id: string;
  name: string;
  settings: RepertoireSettings;
  previewFen: string;
  stats?: RepertoireStats;
  savedAt: string;
  updatedAt: string;
};

type ExportFileEntry =
  | { path: string; kind: "games"; records: PlayedGameEntry[] }
  | { path: string; kind: "analyses"; records: AnalysisEntry[] }
  | {
      path: string;
      kind: "collection";
      collection: { id: string; name: string; source: CollectionSource; games: number };
    }
  | {
      path: string;
      kind: "repertoires";
      /** The folder the file stands for; `null` is Unfiled. */
      folder: { name: string } | null;
      records: RepertoireEntry[];
    };

export type ExportManifest = {
  format: typeof EXPORT_FORMAT;
  formatVersion: typeof EXPORT_FORMAT_VERSION;
  appVersion: string;
  /** ISO 8601. */
  exportedAt: string;
  categories: ExportCategory[];
  includeShippedCollections: boolean;
  /** The folder trees, whole — present for a category that was exported. */
  folders: {
    /** Every analysis folder as its path of names, parents before children. */
    analyses?: string[][];
    /** Every repertoire folder's name (one level), in name order. */
    repertoires?: string[];
  };
  files: ExportFileEntry[];
};

/** One file of the zip. */
type ExportFile = { path: string; text: string };

export type ExportBundle = { manifest: ExportManifest; files: ExportFile[] };

/** Where the manifest sits in the zip. */
const MANIFEST_PATH = "manifest.json";

/** What the download is called. */
export const exportFileName = (now: Date = new Date()): string =>
  `chessapp-export-${isoDate(now)}.zip`;

/** Whether anything is ticked — what enables the Export button. */
export const hasExportSelection = (selection: ExportSelection): boolean =>
  EXPORT_CATEGORIES.some((category) => selection[category]);

/** The collections a selection exports: uploaded always, shipped only when asked. */
export const exportedCollections = <T extends { source: CollectionSource }>(
  collections: readonly T[],
  selection: Pick<ExportSelection, "shippedCollections">,
): T[] =>
  collections.filter((collection) => collection.source === "uploaded" || selection.shippedCollections);

/** A name minter for one directory: slugified, and never the same twice. */
const uniqueNames = (reserved: readonly string[] = []) => {
  const taken = new Set(reserved);
  return (name: string, fallback: string): string => {
    const stem = slugify(name) || slugify(fallback) || "file";
    let candidate = stem;
    for (let n = 2; taken.has(candidate); n += 1) candidate = `${stem}-${n}`;
    taken.add(candidate);
    return candidate;
  };
};

/**
 * Lay records out in one file: each non-blank PGN, and where it lands. A
 * record's game count is what `splitPgnGames` reads in it, so the indices
 * agree with what a reader of the file cuts it into.
 */
const placed = <R extends { pgn: string }, E>(
  records: readonly R[],
  entryOf: (record: R, place: Placed) => E,
): { pgns: string[]; entries: E[] } => {
  const pgns: string[] = [];
  const entries: E[] = [];
  let index = 0;
  for (const record of records) {
    if (record.pgn.trim() === "") continue;
    const games = Math.max(1, splitPgnGames(record.pgn.trim()).length);
    pgns.push(record.pgn);
    entries.push(entryOf(record, { index, games }));
    index += games;
  }
  return { pgns, entries };
};

const playedGameEntry = (game: PlayedGame, place: Placed): PlayedGameEntry => ({
  ...place,
  id: game.id,
  settings: game.settings,
  path: game.path,
  ...(game.resigned === undefined ? {} : { resigned: game.resigned }),
  ...(game.mask === undefined ? {} : { mask: game.mask }),
  savedAt: game.savedAt,
  updatedAt: game.updatedAt,
});

const repertoireEntry = (saved: SavedRepertoire, place: Placed): RepertoireEntry => ({
  ...place,
  id: saved.id,
  name: saved.name,
  settings: saved.settings,
  previewFen: saved.previewFen,
  ...(saved.stats === undefined ? {} : { stats: saved.stats }),
  savedAt: saved.savedAt,
  updatedAt: saved.updatedAt,
});

/** Every analysis folder as its path of names, parents first, siblings by name. */
const analysisFolderPaths = (folders: readonly AnalysisFolder[]): string[][] =>
  folders
    .map((folder) => analysisFolderPath(folders, folder.id).map((step) => step.name))
    .sort((a, b) => {
      for (let at = 0; at < Math.min(a.length, b.length); at += 1) {
        const order = a[at].localeCompare(b[at]);
        if (order !== 0) return order;
      }
      return a.length - b.length;
    });

/**
 * **The export, built** — the files and the manifest for what the reader
 * ticked. Categories not ticked contribute nothing, however much the source
 * holds; a ticked category with no records is still listed in `categories`,
 * with no file.
 */
export const buildExport = (
  source: ExportSource,
  selection: ExportSelection,
  { appVersion, now = new Date() }: { appVersion: string; now?: Date },
): ExportBundle => {
  const files: ExportFile[] = [];
  const entries: ExportFileEntry[] = [];
  const folders: ExportManifest["folders"] = {};
  const add = (text: string, entry: ExportFileEntry) => {
    files.push({ path: entry.path, text });
    entries.push(entry);
  };

  if (selection.games) {
    const { pgns, entries: records } = placed(source.playedGames, playedGameEntry);
    if (records.length > 0) add(pgnFileOf(pgns), { path: "games.pgn", kind: "games", records });
  }

  if (selection.analyses) {
    const known = new Map(source.analysisFolders.map((folder) => [folder.id, folder]));
    const { pgns, entries: records } = placed(source.analyses, (analysis, place): AnalysisEntry => ({
      ...place,
      id: analysis.id,
      name: analysis.name,
      description: analysis.description,
      orientation: analysis.orientation,
      showArrows: analysis.showArrows,
      settings: analysis.settings,
      path: analysis.path,
      folderPath:
        analysis.folderId !== null && known.has(analysis.folderId)
          ? analysisFolderPath(source.analysisFolders, analysis.folderId).map((step) => step.name)
          : [],
      savedAt: analysis.savedAt,
      updatedAt: analysis.updatedAt,
    }));
    folders.analyses = analysisFolderPaths(source.analysisFolders);
    if (records.length > 0) {
      add(pgnFileOf(pgns), { path: "analyses.pgn", kind: "analyses", records });
    }
  }

  if (selection.collections) {
    const name = uniqueNames();
    const wanted = new Set(exportedCollections(source.collections.map((c) => c.summary), selection));
    for (const { summary, games } of source.collections.filter((c) => wanted.has(c.summary))) {
      const kept = games.filter((game) => game.trim() !== "");
      if (kept.length === 0) continue;
      add(pgnFileOf(kept), {
        path: `collections/${name(summary.name, summary.id)}.pgn`,
        kind: "collection",
        collection: { id: summary.id, name: summary.name, source: summary.source, games: kept.length },
      });
    }
  }

  if (selection.repertoires) {
    const sorted = sortedRepertoireFolders(source.repertoireFolders);
    // Unfiled's name is reserved first, so a folder the reader called
    // "Unfiled" becomes `unfiled-2` rather than taking it.
    const name = uniqueNames(["unfiled"]);
    const groups: { path: string; folder: { name: string } | null; members: SavedRepertoire[] }[] = [
      ...sorted.map((folder) => ({
        path: `repertoires/${name(folder.name, "folder")}.pgn`,
        folder: { name: folder.name },
        members: repertoiresInFolder(source.repertoires, source.repertoireFolders, folder.id),
      })),
      {
        path: "repertoires/unfiled.pgn",
        folder: null,
        members: repertoiresInFolder(source.repertoires, source.repertoireFolders, null),
      },
    ];
    for (const group of groups) {
      const { pgns, entries: records } = placed(group.members, repertoireEntry);
      if (records.length === 0) continue;
      add(pgnFileOf(pgns), { path: group.path, kind: "repertoires", folder: group.folder, records });
    }
    folders.repertoires = sorted.map((folder) => folder.name);
  }

  return {
    manifest: {
      format: EXPORT_FORMAT,
      formatVersion: EXPORT_FORMAT_VERSION,
      appVersion,
      exportedAt: now.toISOString(),
      categories: EXPORT_CATEGORIES.filter((category) => selection[category]),
      includeShippedCollections: selection.collections && selection.shippedCollections,
      folders,
      files: entries,
    },
    files,
  };
};

/** The bundle as one zip: `manifest.json` first, then the PGN files in manifest order. */
export const zipExport = ({ manifest, files }: ExportBundle): Uint8Array<ArrayBuffer> =>
  zipSync(
    Object.fromEntries([
      [MANIFEST_PATH, strToU8(`${JSON.stringify(manifest, null, 2)}\n`)],
      ...files.map((file) => [file.path, strToU8(file.text)] as const),
    ]),
  );
