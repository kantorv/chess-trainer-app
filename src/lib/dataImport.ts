import { strFromU8, unzipSync } from "fflate";

import {
  EXPORT_CATEGORIES,
  EXPORT_FORMAT,
  EXPORT_FORMAT_VERSION,
  MANIFEST_PATH,
  type ExportCategory,
} from "./dataExport";
import type { CollectionSummary } from "./libraryCollections";
import { splitPgnGames } from "./pgn";
import { playedGameFrom, type PlayedGame } from "./playedGames";
import { newRecordId } from "./recordId";
import { savedAnalysisFrom, type SavedAnalysis } from "./savedAnalyses";
import { gameFolderPath, type GameFolder } from "./savedGameFolders";
import type { RepertoireFolder } from "./savedRepertoireFolders";
import { savedRepertoireFrom, type SavedRepertoire } from "./savedRepertoires";

/**
 * **Putting an Export back** (CTA-89) — Settings' Import: a zip written by
 * `lib/dataExport.ts` read, checked and turned into what each store should
 * write.
 *
 * Pure, in two steps, so the screen can show the reader what will happen
 * before anything does:
 *
 * 1. {@link readImport} — the zip's bytes in, a validated and migrated
 *    {@link ImportDump} out (every record run through its store's normaliser),
 *    or the reason the zip cannot be imported and the `.pgn` files it holds.
 *    {@link importPlanOf} lays that dump beside the app's current contents:
 *    each category's count and its **clashing folders**.
 * 2. {@link importWritesOf} — the dump, the current contents and the reader's
 *    choices in, each ticked category's writes out: the folders to create, the
 *    records to add and to remove, what that adds up to, and whether it would
 *    pass a store's cap.
 *
 * Reading the stores and writing the result are `lib/dataImportTarget.ts`'s.
 * The whole format and every rule here: `.claude/rules/import-export.md`.
 *
 * ## Conflicts are folders, not records
 *
 * A folder — known by its **path of names**, never by a directory (two
 * sibling folders can slugify alike) — that is in both the dump and the app
 * clashes, and the reader chooses **Merge** (the dump's records go into it,
 * but a record whose id the app already holds is kept as the app has it — so
 * importing a zip twice changes nothing), **Override** (the folder's records
 * are replaced by the dump's) or **Skip** (nothing of the dump's goes into
 * it), per category with a per-folder override. The top level (Unfiled) is a
 * folder that always exists; the played games, which have no folders, clash
 * as a whole. A folder of the dump's that the app does not have is created,
 * empty or not, and its records go in — a record whose id is already
 * elsewhere in the app is kept as the app has it, as under Merge.
 */

/* ------------------------------------------------------------------ *
 * The dump
 * ------------------------------------------------------------------ */

/** A folder's place: its names from the top down, `[]` the top level (Unfiled). */
type FolderPath = readonly string[];

/** One record of the dump and the folder it goes in. */
type Filed<R> = { record: R; folder: FolderPath };

/** An uploaded collection of the dump: what `addCollection` takes, but its index rows. */
type ImportCollection = { id: string; name: string; games: readonly string[] };

/** A zip, read and checked: every record normalised, every folder by its path. */
export type ImportDump = {
  appVersion: string;
  /** ISO 8601, as the manifest says; `""` when it does not. */
  exportedAt: string;
  /** The categories the zip holds — the ones the reader may tick. */
  categories: readonly ExportCategory[];
  games: readonly PlayedGame[];
  analyses: readonly Filed<SavedAnalysis>[];
  /** Every analysis folder, parents before children, empty ones included. */
  analysisFolders: readonly FolderPath[];
  repertoires: readonly Filed<SavedRepertoire>[];
  /** Every repertoire folder, as a one-name path. */
  repertoireFolders: readonly FolderPath[];
  /** The uploaded collections — never the shipped ones. */
  collections: readonly Filed<ImportCollection>[];
  /** Every Library folder, parents before children, empty ones included. */
  collectionFolders: readonly FolderPath[];
  /** How many shipped collections the zip holds: never imported, they ship with the app. */
  shippedCollections: number;
};

/** Why a zip cannot be imported. */
export type ImportProblem =
  /** Not a zip at all. */
  | { kind: "not-zip" }
  /** No `manifest.json`. */
  | { kind: "no-manifest" }
  /** A manifest that is not JSON, or not shaped as one. */
  | { kind: "malformed" }
  /** Someone else's JSON — `format` is not `chessapp-export`. */
  | { kind: "foreign" }
  /** Written by a newer build than this one. */
  | { kind: "newer"; version: number }
  /** A file the manifest names is not in the zip. */
  | { kind: "missing-file"; path: string }
  /** A file whose games do not match the manifest, or holding a record that will not read. */
  | { kind: "unreadable"; path: string };

export type ImportReading =
  | { ok: true; dump: ImportDump }
  /** `pgnFiles`: the zip's `.pgn` files, for uploading by hand. */
  | { ok: false; problem: ImportProblem; pgnFiles: readonly string[] };

/* ------------------------------------------------------------------ *
 * Migrations
 * ------------------------------------------------------------------ */

type RawManifest = Record<string, unknown>;

/** One version's upgrade: a manifest of version `n` in, the same data as version `n + 1` out. */
type ManifestMigration = (manifest: RawManifest) => RawManifest;

/**
 * **The migrations**, keyed by the version each upgrades *from*. Version 1 is
 * the only one there has been, so the table is empty and a version-1 manifest
 * passes through unchanged. Bumping `EXPORT_FORMAT_VERSION` to `n + 1` adds
 * the entry `n` here — how is `.claude/rules/import-export.md` §6.
 */
const MANIFEST_MIGRATIONS: Readonly<Record<number, ManifestMigration>> = {};

type MigrationOptions = {
  /** The table to run — the tests pass their own. */
  migrations?: Readonly<Record<number, ManifestMigration>>;
  /** The version this build reads — the tests pass their own. */
  version?: number;
};

/**
 * A manifest brought up to the version this build reads, one migration at a
 * time: the same manifest when it is that version already, `"newer"` when it
 * is past it, and `undefined` when there is no way up (no version, or a gap
 * in the table, or a migration that did not land on the next version).
 */
export const migrateManifest = (
  manifest: RawManifest,
  { migrations = MANIFEST_MIGRATIONS, version = EXPORT_FORMAT_VERSION }: MigrationOptions = {},
): RawManifest | "newer" | undefined => {
  let current = manifest;
  let at = current.formatVersion;
  if (typeof at !== "number" || !Number.isInteger(at) || at < 1) return undefined;
  if (at > version) return "newer";
  while (at < version) {
    const migrate: ManifestMigration | undefined = migrations[at];
    if (migrate === undefined) return undefined;
    current = migrate(current);
    if (current.formatVersion !== at + 1) return undefined;
    at += 1;
  }
  return current;
};

/* ------------------------------------------------------------------ *
 * Reading a zip
 * ------------------------------------------------------------------ */

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A path of folder names — each a string that is more than whitespace. */
const isFolderPath = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((name) => typeof name === "string" && name.trim() !== "");

const isCount = (value: unknown, least: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= least;

/** `items` onto the end of `list` — a loop, not a spread: a file can hold tens of thousands of records. */
const append = <T>(list: T[], items: readonly T[]) => {
  for (const item of items) list.push(item);
};

/** Thrown inside the reader, caught at its top: the first thing wrong ends it. */
class Refused extends Error {
  readonly problem: ImportProblem;
  constructor(problem: ImportProblem) {
    super(problem.kind);
    this.problem = problem;
  }
}

const refuse = (problem: ImportProblem): never => {
  throw new Refused(problem);
};

/** A key's value without the placement and folder fields the manifest adds beside a record. */
const recordFields = (entry: Record<string, unknown>): Record<string, unknown> => {
  const fields = { ...entry };
  delete fields.index;
  delete fields.games;
  delete fields.folderPath;
  return fields;
};

/** A movetext's last token is a game termination marker. */
const TERMINATED = /(?:^|\s)(?:1-0|0-1|1\/2-1\/2|\*)$/;

/** A paragraph opening with the `Event` tag. */
const EVENT_FIRST = /^[ \t]*\[Event\b/;

/**
 * A text cut where each game **ends**: a blank line after a paragraph whose
 * last token is a termination marker (`1-0`, `0-1`, `1/2-1/2`, `*`), or
 * before an `[Event …]` tag. `splitPgnGames` cuts only before `[Event`, so a
 * game whose tags do not open with `Event` — every game `treeToPgn` writes
 * from a set-up position leads with `[SetUp`/`[FEN` — or that has no tags at
 * all (a repertoire pasted as bare moves) is glued onto the one before it.
 */
const gamesByTermination = (text: string): string[] => {
  const games: string[] = [];
  let game: string[] = [];
  const close = () => {
    if (game.length > 0) games.push(game.join("\n\n").trim());
    game = [];
  };
  for (const paragraph of text.replace(/\r\n?/g, "\n").split(/\n[ \t]*\n/)) {
    if (paragraph.trim() === "") continue;
    if (EVENT_FIRST.test(paragraph)) close();
    game.push(paragraph);
    if (TERMINATED.test(paragraph.trim())) close();
  }
  close();
  return games;
};

/**
 * A file's games, `expected` of them: cut as the export counted them
 * (`splitPgnGames`) when that adds up, else where each game ends
 * ({@link gamesByTermination}) when that does — how a zip holding a game from
 * a set-up position still reads. When neither adds up, the first, which the
 * caller refuses.
 */
const gamesOf = (text: string, expected: number): string[] => {
  const games = splitPgnGames(text);
  if (games.length === expected) return games;
  const ended = gamesByTermination(text);
  return ended.length === expected ? ended : games;
};

/**
 * A records file cut back into its records: its games ({@link gamesOf}),
 * each record's `games` of them from its `index`, in order and covering the
 * file, each record built by `recordOf`. Anything that does not add up makes
 * the file unreadable.
 */
const recordsOf = <R>(
  path: string,
  text: string,
  entries: unknown,
  recordOf: (entry: Record<string, unknown>, pgn: string) => R | undefined,
): R[] => {
  if (!Array.isArray(entries)) return refuse({ kind: "malformed" });
  let expected = 0;
  for (const entry of entries) {
    if (!isObject(entry) || !isCount(entry.index, 0) || !isCount(entry.games, 1) || entry.index !== expected) {
      return refuse({ kind: "unreadable", path });
    }
    expected += entry.games;
  }
  const games = gamesOf(text, expected);
  const records: R[] = [];
  let at = 0;
  for (const entry of entries as { index: number; games: number }[]) {
    if (at + entry.games > games.length) return refuse({ kind: "unreadable", path });
    const record = recordOf(entry as Record<string, unknown>, games.slice(at, at + entry.games).join("\n\n"));
    if (record === undefined) return refuse({ kind: "unreadable", path });
    records.push(record);
    at += entry.games;
  }
  if (at !== games.length) return refuse({ kind: "unreadable", path });
  return records;
};

/** The manifest's `folders.<key>`: absent is none, anything else must be a list of paths. */
const folderPathsOf = (folders: Record<string, unknown>, key: string): FolderPath[] => {
  const value = folders[key];
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every(isFolderPath)) return refuse({ kind: "malformed" });
  return value;
};

/** The dump, read out of an unzipped manifest and its files. Throws {@link Refused}. */
const dumpOf = (manifest: RawManifest, files: Readonly<Record<string, Uint8Array>>): ImportDump => {
  if (!Array.isArray(manifest.categories) || !Array.isArray(manifest.files)) return refuse({ kind: "malformed" });
  const folders = manifest.folders === undefined ? {} : manifest.folders;
  if (!isObject(folders)) return refuse({ kind: "malformed" });
  const repertoireNames = folders.repertoires ?? [];
  if (!Array.isArray(repertoireNames) || !repertoireNames.every((name) => isFolderPath([name]))) {
    return refuse({ kind: "malformed" });
  }

  const dump = {
    appVersion: typeof manifest.appVersion === "string" ? manifest.appVersion : "",
    exportedAt: typeof manifest.exportedAt === "string" ? manifest.exportedAt : "",
    categories: EXPORT_CATEGORIES.filter((category) => (manifest.categories as unknown[]).includes(category)),
    games: [] as PlayedGame[],
    analyses: [] as Filed<SavedAnalysis>[],
    analysisFolders: folderPathsOf(folders, "analyses"),
    repertoires: [] as Filed<SavedRepertoire>[],
    repertoireFolders: (repertoireNames as string[]).map((name) => [name]),
    collections: [] as Filed<ImportCollection>[],
    collectionFolders: folderPathsOf(folders, "collections"),
    shippedCollections: 0,
  };

  for (const file of manifest.files as unknown[]) {
    if (!isObject(file) || typeof file.path !== "string") return refuse({ kind: "malformed" });
    const { path } = file;
    const bytes = files[path];
    if (bytes === undefined) return refuse({ kind: "missing-file", path });
    const text = strFromU8(bytes);

    switch (file.kind) {
      case "games":
        append(
          dump.games,
          recordsOf(path, text, file.records, (entry, pgn) => playedGameFrom({ ...recordFields(entry), pgn })),
        );
        break;
      case "analyses":
        append(
          dump.analyses,
          recordsOf(path, text, file.records, (entry, pgn) => {
            const folder = entry.folderPath ?? [];
            const record = savedAnalysisFrom({ ...recordFields(entry), pgn, folderId: null });
            return record === undefined || !isFolderPath(folder) ? undefined : { record, folder };
          }),
        );
        break;
      case "repertoires": {
        const folder = file.folder;
        if (folder !== null && !(isObject(folder) && isFolderPath([folder.name]))) {
          return refuse({ kind: "unreadable", path });
        }
        const place: FolderPath = folder === null ? [] : [folder.name as string];
        append(
          dump.repertoires,
          recordsOf(path, text, file.records, (entry, pgn) => {
            const record = savedRepertoireFrom({ ...recordFields(entry), pgn, folderId: null });
            return record === undefined ? undefined : { record, folder: place };
          }),
        );
        break;
      }
      case "collection": {
        const collection = file.collection;
        if (
          !isObject(collection) ||
          typeof collection.id !== "string" ||
          collection.id === "" ||
          typeof collection.name !== "string" ||
          (collection.source !== "shipped" && collection.source !== "uploaded") ||
          !isCount(collection.games, 1)
        ) {
          return refuse({ kind: "unreadable", path });
        }
        if (collection.source === "shipped") {
          dump.shippedCollections += 1;
          break;
        }
        const folder = collection.folderPath ?? [];
        const games = gamesOf(text, collection.games);
        if (!isFolderPath(folder) || games.length !== collection.games) return refuse({ kind: "unreadable", path });
        dump.collections.push({ record: { id: collection.id, name: collection.name, games }, folder });
        break;
      }
      default:
        return refuse({ kind: "malformed" });
    }
  }
  return dump;
};

/**
 * **Read a zip** — the manifest checked first (there, JSON, this app's
 * format, a version this build knows or can migrate from), then every file it
 * names, cut into the records it lists, each through its store's normaliser.
 * Nothing about the app is consulted: a dump is what the zip says.
 */
export const readImport = (bytes: Uint8Array, options: MigrationOptions = {}): ImportReading => {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    return { ok: false, problem: { kind: "not-zip" }, pgnFiles: [] };
  }
  const pgnFiles = Object.keys(files)
    .filter((path) => path.toLowerCase().endsWith(".pgn"))
    .sort();
  const failed = (problem: ImportProblem): ImportReading => ({ ok: false, problem, pgnFiles });

  const manifestBytes = files[MANIFEST_PATH];
  if (manifestBytes === undefined) return failed({ kind: "no-manifest" });
  let manifest: unknown;
  try {
    manifest = JSON.parse(strFromU8(manifestBytes));
  } catch {
    return failed({ kind: "malformed" });
  }
  if (!isObject(manifest)) return failed({ kind: "malformed" });
  if (manifest.format !== EXPORT_FORMAT) return failed({ kind: "foreign" });

  const migrated = migrateManifest(manifest, options);
  if (migrated === "newer") return failed({ kind: "newer", version: manifest.formatVersion as number });
  if (migrated === undefined) return failed({ kind: "malformed" });

  try {
    return { ok: true, dump: dumpOf(migrated, files) };
  } catch (error) {
    if (error instanceof Refused) return failed(error.problem);
    throw error;
  }
};

/* ------------------------------------------------------------------ *
 * The app beside the dump
 * ------------------------------------------------------------------ */

/** What the app holds now — every store the import writes, read whole. */
export type ImportCurrent = {
  playedGames: readonly PlayedGame[];
  analyses: readonly SavedAnalysis[];
  analysisFolders: readonly GameFolder[];
  repertoires: readonly SavedRepertoire[];
  repertoireFolders: readonly RepertoireFolder[];
  /** The uploaded collections — the shipped ones are never written. */
  collections: readonly CollectionSummary[];
  collectionFolders: readonly GameFolder[];
};

/** The stores' caps (`lib/dataImportTarget.ts`'s `IMPORT_CAPS`), passed in so this file reads no store. */
export type ImportCaps = {
  playedGames: number;
  analyses: number;
  repertoires: number;
  /** Per store: the analyses', the repertoires' and the Library's folders each. */
  folders: number;
};

/** A folder path as a map key. `[]` — the top level — is `"[]"`. */
export const folderKey = (path: FolderPath): string => JSON.stringify(path);

/** The top level's key. */
const TOP = folderKey([]);

/** Every folder of a nested tree by its path of names — the first of two alike wins, oldest first. */
const nestedFolderIds = (folders: readonly GameFolder[]): Map<string, string> => {
  const ids = new Map<string, string>();
  for (const folder of folders) {
    const key = folderKey(gameFolderPath(folders, folder.id).map((step) => step.name));
    if (!ids.has(key)) ids.set(key, folder.id);
  }
  return ids;
};

/** Every repertoire folder by its one-name path — the first of two alike wins. */
const flatFolderIds = (folders: readonly RepertoireFolder[]): Map<string, string> => {
  const ids = new Map<string, string>();
  for (const folder of folders) {
    const key = folderKey([folder.name]);
    if (!ids.has(key)) ids.set(key, folder.id);
  }
  return ids;
};

/** One category laid out the same way whichever it is: the dump's records `I`, the app's `E`. */
type Category<I extends { id: string }, E extends { id: string } = I> = {
  incoming: readonly Filed<I>[];
  /** The dump's folders, explicit ones and every one a record names, parents first. */
  dumpFolders: readonly FolderPath[];
  existing: readonly E[];
  /** The app's folders by key. */
  appFolders: ReadonlyMap<string, string>;
  /** An app record's folder key — a folder that is not there is the top level. */
  existingFolderOf(record: E): string;
};

/** Every folder of the dump: the manifest's list, and each record's folder with its ancestors. */
const dumpFoldersOf = (listed: readonly FolderPath[], incoming: readonly Filed<unknown>[]): FolderPath[] => {
  const byKey = new Map<string, FolderPath>();
  const add = (path: FolderPath) => {
    for (let depth = 1; depth <= path.length; depth += 1) {
      const prefix = path.slice(0, depth);
      byKey.set(folderKey(prefix), prefix);
    }
  };
  for (const path of listed) add(path);
  for (const { folder } of incoming) add(folder);
  // Parents before children: a stable sort by depth keeps the manifest's order among equals.
  return [...byKey.values()].sort((a, b) => a.length - b.length);
};

/** An app record's folder key, from its `folderId`: none, or one that is not there, is the top level. */
const filedIn = (ids: ReadonlyMap<string, string>) => {
  const keyOf = new Map([...ids].map(([key, id]) => [id, key]));
  return (record: { id: string; folderId?: string | null }): string =>
    record.folderId == null ? TOP : (keyOf.get(record.folderId) ?? TOP);
};

const categoriesOf = (dump: ImportDump, current: ImportCurrent) => {
  const analysisIds = nestedFolderIds(current.analysisFolders);
  const repertoireIds = flatFolderIds(current.repertoireFolders);
  const collectionIds = nestedFolderIds(current.collectionFolders);
  return {
    games: {
      incoming: dump.games.map((record) => ({ record, folder: [] })),
      dumpFolders: [],
      existing: current.playedGames,
      appFolders: new Map(),
      existingFolderOf: () => TOP,
    } satisfies Category<PlayedGame>,
    analyses: {
      incoming: dump.analyses,
      dumpFolders: dumpFoldersOf(dump.analysisFolders, dump.analyses),
      existing: current.analyses,
      appFolders: analysisIds,
      existingFolderOf: filedIn(analysisIds),
    } satisfies Category<SavedAnalysis>,
    repertoires: {
      incoming: dump.repertoires,
      dumpFolders: dumpFoldersOf(dump.repertoireFolders, dump.repertoires),
      existing: current.repertoires,
      appFolders: repertoireIds,
      existingFolderOf: filedIn(repertoireIds),
    } satisfies Category<SavedRepertoire>,
    collections: {
      incoming: dump.collections,
      dumpFolders: dumpFoldersOf(dump.collectionFolders, dump.collections),
      existing: current.collections,
      appFolders: collectionIds,
      existingFolderOf: filedIn(collectionIds),
    } satisfies Category<ImportCollection, CollectionSummary>,
  };
};

/** One folder that is in both the dump and the app. */
export type FolderConflict = {
  /** {@link folderKey} of `path` — what a per-folder choice is keyed by. */
  key: string;
  /** Its names from the top down; `[]` is the top level (Unfiled, or the played games as a whole). */
  path: FolderPath;
  /** How many of the dump's records go in it. */
  incoming: number;
  /** How many records the app has in it. */
  existing: number;
};

/**
 * A category's clashing folders: every folder of the dump that the app has,
 * and the top level when the dump puts a record there (it always exists). A
 * folder of the dump's that holds nothing still clashes — Override empties
 * the app's.
 */
const conflictsOf = <I extends { id: string }, E extends { id: string }>(
  laid: Category<I, E>,
): FolderConflict[] => {
  const { incoming, dumpFolders, existing, appFolders } = laid;
  const incomingIn = new Map<string, number>();
  for (const { folder } of incoming) {
    const key = folderKey(folder);
    incomingIn.set(key, (incomingIn.get(key) ?? 0) + 1);
  }
  const existingIn = new Map<string, number>();
  for (const record of existing) {
    const key = laid.existingFolderOf(record);
    existingIn.set(key, (existingIn.get(key) ?? 0) + 1);
  }

  const clashing: FolderPath[] = [
    ...(incomingIn.has(TOP) ? [[]] : []),
    ...dumpFolders.filter((path) => appFolders.has(folderKey(path))),
  ];
  return clashing.map((path) => {
    const key = folderKey(path);
    return { key, path, incoming: incomingIn.get(key) ?? 0, existing: existingIn.get(key) ?? 0 };
  });
};

/** What the dialog shows of one category the dump holds. */
type CategoryPlan = {
  /** How many records (collections, games, analyses, repertoires) the dump would bring. */
  count: number;
  conflicts: readonly FolderConflict[];
};

export type ImportPlan = {
  /** Only the categories the dump holds. */
  categories: Partial<Record<ExportCategory, CategoryPlan>>;
  shippedCollections: number;
};

/** **The dump beside the app**: each category's count and clashing folders. */
export const importPlanOf = (dump: ImportDump, current: ImportCurrent): ImportPlan => {
  const categories = categoriesOf(dump, current);
  const plan: ImportPlan["categories"] = {};
  for (const category of dump.categories) {
    const laid: Category<{ id: string }, { id: string }> = categories[category];
    plan[category] = { count: laid.incoming.length, conflicts: conflictsOf(laid) };
  }
  return { categories: plan, shippedCollections: dump.shippedCollections };
};

/* ------------------------------------------------------------------ *
 * The reader's choices, and the writes they make
 * ------------------------------------------------------------------ */

export type ConflictChoice = "merge" | "override" | "skip";

export const CONFLICT_CHOICES: readonly ConflictChoice[] = ["merge", "override", "skip"];

/** One category's choices. */
export type CategoryChoices = {
  /** Ticked: written at all. */
  ticked: boolean;
  /** What a clashing folder gets. */
  choice: ConflictChoice;
  /** A clashing folder's own choice, by {@link folderKey}, over `choice`. */
  folders: Readonly<Record<string, ConflictChoice>>;
};

export type ImportChoices = Readonly<Record<ExportCategory, CategoryChoices>>;

/** Every category the dump holds ticked, each clash merged. */
export const defaultImportChoices = (plan: ImportPlan): ImportChoices =>
  Object.fromEntries(
    EXPORT_CATEGORIES.map((category) => [
      category,
      { ticked: plan.categories[category] !== undefined, choice: "merge", folders: {} },
    ]),
  ) as Record<ExportCategory, CategoryChoices>;

/** What an import does to one category. */
export type ImportReport = {
  /** The dump's records written. */
  added: number;
  /** The app's records an Override took away — emptied from a folder, or overwritten by id. */
  replaced: number;
  /** The dump's records not written: skipped, or an id the app kept. */
  skipped: number;
  /** Folders created. */
  folders: number;
};

/** A cap an import would pass. */
export type CapProblem = { kind: "records" | "folders"; max: number; total: number };

/** One category's writes, and what they come to. */
type CategoryImport<W> = {
  writes: W;
  report: ImportReport;
  /** Past a cap: the category is refused — nothing of it is written. */
  refused?: CapProblem;
  /** The played games only: how many of the oldest the store drops to keep its cap. */
  dropsOldest?: number;
};

/** Records to add, with their folders set, and ids to remove first. */
type RecordWrites<R, F> = { folders: F[]; add: R[]; remove: string[] };

type ImportCollectionWrite = ImportCollection & { folderId: string | null };

export type ImportWrites = {
  games?: CategoryImport<{ add: PlayedGame[]; remove: string[] }>;
  analyses?: CategoryImport<RecordWrites<SavedAnalysis, GameFolder>>;
  repertoires?: CategoryImport<RecordWrites<SavedRepertoire, RepertoireFolder>>;
  collections?: CategoryImport<RecordWrites<ImportCollectionWrite, GameFolder>>;
};

type Resolved<R> = {
  add: { record: R; folderId: string | null }[];
  remove: string[];
  /** The folders to create, parents first. */
  created: { path: FolderPath; id: string; parentId: string | null }[];
  report: ImportReport;
  /** How many records the store holds afterwards. */
  total: number;
};

/** One category's choices applied — the rules of the file's header. */
const resolve = <I extends { id: string }, E extends { id: string }>(
  laid: Category<I, E>,
  choices: CategoryChoices,
  newId: () => string,
): Resolved<I> => {
  const clashing = new Set(conflictsOf(laid).map((conflict) => conflict.key));
  const choiceIn = (key: string): ConflictChoice =>
    clashing.has(key) ? (choices.folders[key] ?? choices.choice) : "merge";

  // The folders of the dump the app does not have, created whatever is chosen.
  const ids = new Map(laid.appFolders);
  const created: Resolved<I>["created"] = [];
  for (const path of laid.dumpFolders) {
    const key = folderKey(path);
    if (ids.has(key)) continue;
    const id = newId();
    ids.set(key, id);
    created.push({ path, id, parentId: path.length > 1 ? (ids.get(folderKey(path.slice(0, -1))) ?? null) : null });
  }

  const existingIds = new Set(laid.existing.map((record) => record.id));
  const removed = new Set<string>();
  for (const record of laid.existing) {
    const key = laid.existingFolderOf(record);
    if (clashing.has(key) && choiceIn(key) === "override") removed.add(record.id);
  }

  const add: Resolved<I>["add"] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const { record, folder } of laid.incoming) {
    const key = folderKey(folder);
    const choice = choiceIn(key);
    // A second record under one id in a hand-edited dump: the first is the one.
    if (seen.has(record.id) || choice === "skip") {
      skipped += 1;
      continue;
    }
    seen.add(record.id);
    if (existingIds.has(record.id)) {
      if (choice !== "override") {
        skipped += 1;
        continue;
      }
      removed.add(record.id);
    }
    add.push({ record, folderId: key === TOP ? null : (ids.get(key) ?? null) });
  }

  return {
    add,
    remove: [...removed],
    created,
    report: { added: add.length, replaced: removed.size, skipped, folders: created.length },
    total: laid.existing.length - removed.size + add.length,
  };
};

/** A nested folder record for a created path. */
const nestedFolder = (
  { path, id, parentId }: Resolved<unknown>["created"][number],
  at: string,
): GameFolder => ({ id, name: path[path.length - 1], parentId, savedAt: at, updatedAt: at });

/** The folder cap, checked for a category that creates folders. */
const folderCapOf = (existing: number, created: number, max: number): CapProblem | undefined =>
  existing + created > max ? { kind: "folders", max, total: existing + created } : undefined;

/**
 * **The writes the reader's choices make** — for every ticked category the
 * dump holds: the folders to create (ids minted by `newId`), the records to
 * remove and to add (each filed in its folder), the report, and a cap it
 * would pass. A category over a cap is `refused`; the played games are the
 * exception, where the store drops its oldest and `dropsOldest` says how many.
 */
export const importWritesOf = (
  dump: ImportDump,
  current: ImportCurrent,
  choices: ImportChoices,
  {
    caps,
    now = new Date(),
    newId = () => newRecordId(now),
  }: { caps: ImportCaps; now?: Date; newId?: () => string },
): ImportWrites => {
  const categories = categoriesOf(dump, current);
  const at = now.toISOString();
  const wanted = (category: ExportCategory) => dump.categories.includes(category) && choices[category].ticked;
  const writes: ImportWrites = {};

  if (wanted("games")) {
    const { add, remove, report, total } = resolve(categories.games, choices.games, newId);
    writes.games = {
      writes: { add: add.map(({ record }) => record), remove },
      report,
      ...(total > caps.playedGames ? { dropsOldest: total - caps.playedGames } : {}),
    };
  }

  if (wanted("analyses")) {
    const { add, remove, created, report, total } = resolve(categories.analyses, choices.analyses, newId);
    const refused =
      folderCapOf(current.analysisFolders.length, created.length, caps.folders) ??
      (total > caps.analyses ? { kind: "records" as const, max: caps.analyses, total } : undefined);
    writes.analyses = {
      writes: {
        folders: created.map((folder) => nestedFolder(folder, at)),
        add: add.map(({ record, folderId }) => ({ ...record, folderId })),
        remove,
      },
      report,
      ...(refused === undefined ? {} : { refused }),
    };
  }

  if (wanted("repertoires")) {
    const { add, remove, created, report, total } = resolve(categories.repertoires, choices.repertoires, newId);
    const refused =
      folderCapOf(current.repertoireFolders.length, created.length, caps.folders) ??
      (total > caps.repertoires ? { kind: "records" as const, max: caps.repertoires, total } : undefined);
    writes.repertoires = {
      writes: {
        folders: created.map(({ path, id }) => ({ id, name: path[0], savedAt: at, updatedAt: at })),
        add: add.map(({ record, folderId }) => ({ ...record, folderId })),
        remove,
      },
      report,
      ...(refused === undefined ? {} : { refused }),
    };
  }

  if (wanted("collections")) {
    const { add, remove, created, report } = resolve(categories.collections, choices.collections, newId);
    const refused = folderCapOf(current.collectionFolders.length, created.length, caps.folders);
    writes.collections = {
      writes: {
        folders: created.map((folder) => nestedFolder(folder, at)),
        add: add.map(({ record, folderId }) => ({ ...record, folderId })),
        remove,
      },
      report,
      ...(refused === undefined ? {} : { refused }),
    };
  }

  return writes;
};
