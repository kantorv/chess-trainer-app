import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { DEFAULT_ANALYSIS_SETTINGS } from "./analysisSettings";
import {
  buildExport,
  exportFileName,
  exportedCollections,
  hasExportSelection,
  zipExport,
  type ExportSelection,
  type ExportSource,
} from "./dataExport";
import { DEFAULT_ENGINE_SETTINGS } from "./engineSettings";
import type { CollectionSummary } from "./libraryCollections";
import { splitPgnGames } from "./pgn";
import type { PlayedGame } from "./playedGames";
import { DEFAULT_REPERTOIRE_SETTINGS } from "./repertoireSettings";
import type { SavedAnalysis } from "./savedAnalyses";
import type { AnalysisFolder } from "./savedAnalysisFolders";
import type { RepertoireFolder } from "./savedRepertoireFolders";
import type { SavedRepertoire } from "./savedRepertoires";

const NOW = new Date(2026, 8, 22, 12, 0, 0);
const AT = "2026-09-01T00:00:00.000Z";

const pgn = (event: string, moves = "1. e4 e5 *") =>
  `[Event "${event}"]\n[White "W"]\n[Black "B"]\n[Result "*"]\n\n${moves}`;

const played = (id: string, extra: Partial<PlayedGame> = {}): PlayedGame => ({
  id,
  pgn: pgn(`Played ${id}`),
  settings: DEFAULT_ENGINE_SETTINGS,
  path: ["e4"],
  savedAt: AT,
  updatedAt: AT,
  ...extra,
});

const analysis = (id: string, folderId: string | null, extra: Partial<SavedAnalysis> = {}): SavedAnalysis => ({
  id,
  pgn: pgn(`Analysis ${id}`, "1. d4 (1. c4) d5 *"),
  settings: DEFAULT_ANALYSIS_SETTINGS,
  path: ["d4", "d5"],
  orientation: "black",
  description: `notes on ${id}`,
  showArrows: true,
  name: `Analysis ${id}`,
  folderId,
  savedAt: AT,
  updatedAt: AT,
  ...extra,
});

const folder = (id: string, name: string, parentId: string | null = null): AnalysisFolder => ({
  id,
  name,
  parentId,
  savedAt: AT,
  updatedAt: AT,
});

const repertoire = (id: string, folderId: string | null, text = pgn(`Rep ${id}`)): SavedRepertoire => ({
  id,
  name: `Rep ${id}`,
  pgn: text,
  previewFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  stats: { moves: 1, variations: 0 },
  settings: { ...DEFAULT_REPERTOIRE_SETTINGS, color: "black" },
  folderId,
  savedAt: AT,
  updatedAt: AT,
});

const repFolder = (id: string, name: string): RepertoireFolder => ({ id, name, savedAt: AT, updatedAt: AT });

const summary = (id: string, name: string, source: "shipped" | "uploaded", count: number): CollectionSummary => ({
  id,
  name,
  source,
  count,
});

const EMPTY: ExportSource = {
  playedGames: [],
  analyses: [],
  analysisFolders: [],
  repertoires: [],
  repertoireFolders: [],
  collections: [],
};

const ALL: ExportSelection = {
  collections: true,
  games: true,
  analyses: true,
  repertoires: true,
  shippedCollections: true,
};
const NONE: ExportSelection = {
  collections: false,
  games: false,
  analyses: false,
  repertoires: false,
  shippedCollections: false,
};

const build = (source: Partial<ExportSource>, selection: Partial<ExportSelection> = ALL) =>
  buildExport({ ...EMPTY, ...source }, { ...NONE, ...selection }, { appVersion: "9.9.9", now: NOW });

const fileText = (bundle: ReturnType<typeof build>, path: string) =>
  bundle.files.find((file) => file.path === path)?.text;

describe("buildExport", () => {
  it("stamps the manifest with the format, the app version, the date and the ticked categories", () => {
    const { manifest } = build({}, { games: true, repertoires: true });
    expect(manifest).toMatchObject({
      format: "chessapp-export",
      formatVersion: 1,
      appVersion: "9.9.9",
      exportedAt: NOW.toISOString(),
      categories: ["games", "repertoires"],
      includeShippedCollections: false,
    });
  });

  it("writes every category, and nothing for a category not ticked", () => {
    const source: Partial<ExportSource> = {
      playedGames: [played("g1")],
      analyses: [analysis("a1", null)],
      repertoires: [repertoire("r1", null)],
      collections: [{ summary: summary("u1", "Mine", "uploaded", 1), games: [pgn("C1")] }],
    };
    expect(build(source).files.map((file) => file.path)).toEqual([
      "games.pgn",
      "analyses.pgn",
      "collections/mine.pgn",
      "repertoires/unfiled.pgn",
    ]);
    expect(build(source, { analyses: true }).files.map((file) => file.path)).toEqual(["analyses.pgn"]);
    expect(build(source, {}).files).toEqual([]);
  });

  it("lists an empty ticked category but writes no file for it", () => {
    const bundle = build({}, ALL);
    expect(bundle.manifest.categories).toEqual(["collections", "games", "analyses", "repertoires"]);
    expect(bundle.files).toEqual([]);
    expect(bundle.manifest.files).toEqual([]);
    expect(bundle.manifest.folders).toEqual({ analyses: [], repertoires: [] });
  });

  it("joins the played games byte for byte, in store order, with their records", () => {
    const games = [played("g1", { resigned: "white" }), played("g2")];
    const bundle = build({ playedGames: games }, { games: true });
    expect(fileText(bundle, "games.pgn")).toBe(`${games[0].pgn}\n\n${games[1].pgn}\n`);
    const entry = bundle.manifest.files[0];
    expect(entry.kind).toBe("games");
    if (entry.kind !== "games") return;
    expect(entry.records.map((record) => [record.id, record.index, record.games, record.resigned])).toEqual([
      ["g1", 0, 1, "white"],
      ["g2", 1, 1, undefined],
    ]);
    expect(entry.records[0].settings).toEqual(DEFAULT_ENGINE_SETTINGS);
  });

  it("records each analysis' name, description, orientation, path and folder path", () => {
    const folders = [folder("f1", "Openings"), folder("f2", "Sicilian", "f1")];
    const bundle = build(
      {
        analyses: [analysis("a1", "f2"), analysis("a2", null), analysis("a3", "gone")],
        analysisFolders: folders,
      },
      { analyses: true },
    );
    const entry = bundle.manifest.files[0];
    if (entry.kind !== "analyses") throw new Error("not the analyses file");
    expect(entry.records[0]).toMatchObject({
      id: "a1",
      index: 0,
      name: "Analysis a1",
      description: "notes on a1",
      orientation: "black",
      path: ["d4", "d5"],
      folderPath: ["Openings", "Sicilian"],
    });
    // Unfiled, and a folder that is gone, both read as the top level.
    expect(entry.records[1].folderPath).toEqual([]);
    expect(entry.records[2].folderPath).toEqual([]);
    // The whole tree rides along, so an empty folder survives.
    expect(bundle.manifest.folders.analyses).toEqual([["Openings"], ["Openings", "Sicilian"]]);
    // Side lines survive: the stored text is joined, not re-written.
    expect(fileText(bundle, "analyses.pgn")).toContain("(1. c4)");
  });

  it("writes one repertoire file per folder, plus Unfiled, mapping each game back", () => {
    const bundle = build(
      {
        repertoires: [repertoire("r1", "b"), repertoire("r2", "a"), repertoire("r3", null), repertoire("r4", "a")],
        repertoireFolders: [repFolder("a", "Black repertoire"), repFolder("b", "Alpha"), repFolder("c", "Empty")],
      },
      { repertoires: true },
    );
    expect(bundle.files.map((file) => file.path)).toEqual([
      "repertoires/alpha.pgn",
      "repertoires/black-repertoire.pgn",
      "repertoires/unfiled.pgn",
    ]);
    const entries = bundle.manifest.files.filter((file) => file.kind === "repertoires");
    expect(entries.map((entry) => [entry.folder?.name ?? null, entry.records.map((r) => [r.id, r.index])])).toEqual([
      ["Alpha", [["r1", 0]]],
      ["Black repertoire", [["r2", 0], ["r4", 1]]],
      [null, [["r3", 0]]],
    ]);
    expect(entries[0].records[0]).toMatchObject({ name: "Rep r1", settings: { color: "black" } });
    // Folders are listed whole, the empty one too.
    expect(bundle.manifest.folders.repertoires).toEqual(["Alpha", "Black repertoire", "Empty"]);
  });

  it("counts a legacy multi-game repertoire's games, so later indices stay right", () => {
    const legacy = repertoire("old", null, `${pgn("One")}\n\n${pgn("Two")}`);
    const bundle = build({ repertoires: [legacy, repertoire("new", null)] }, { repertoires: true });
    const entry = bundle.manifest.files[0];
    if (entry.kind !== "repertoires") throw new Error("not a repertoire file");
    expect(entry.records.map((record) => [record.id, record.index, record.games])).toEqual([
      ["old", 0, 2],
      ["new", 2, 1],
    ]);
    expect(splitPgnGames(fileText(bundle, "repertoires/unfiled.pgn") ?? "")).toHaveLength(3);
  });

  it("makes colliding file names unique, and names a non-ASCII one by its id", () => {
    const bundle = build(
      {
        collections: [
          { summary: summary("u1", "My games", "uploaded", 1), games: [pgn("A")] },
          { summary: summary("u2", "My  games!", "uploaded", 1), games: [pgn("B")] },
          { summary: summary("u3", "משחקים", "uploaded", 1), games: [pgn("C")] },
        ],
        repertoires: [repertoire("r1", "x"), repertoire("r2", null)],
        repertoireFolders: [repFolder("x", "Unfiled")],
      },
      { collections: true, repertoires: true },
    );
    expect(bundle.files.map((file) => file.path)).toEqual([
      "collections/my-games.pgn",
      "collections/my-games-2.pgn",
      "collections/u3.pgn",
      // A folder the reader called "Unfiled" does not take Unfiled's file.
      "repertoires/unfiled-2.pgn",
      "repertoires/unfiled.pgn",
    ]);
  });

  it("exports uploaded collections always, and shipped ones only when asked", () => {
    const collections = [
      { summary: summary("world-cup", "World Cup", "shipped", 2), games: [pgn("S1"), pgn("S2")] },
      { summary: summary("u1", "Mine", "uploaded", 1), games: [pgn("U1")] },
    ];
    const without = build({ collections }, { collections: true, shippedCollections: false });
    expect(without.files.map((file) => file.path)).toEqual(["collections/mine.pgn"]);
    expect(without.manifest.includeShippedCollections).toBe(false);

    const withShipped = build({ collections }, { collections: true, shippedCollections: true });
    expect(withShipped.manifest.includeShippedCollections).toBe(true);
    expect(withShipped.manifest.files).toEqual([
      {
        path: "collections/world-cup.pgn",
        kind: "collection",
        collection: { id: "world-cup", name: "World Cup", source: "shipped", games: 2 },
      },
      {
        path: "collections/mine.pgn",
        kind: "collection",
        collection: { id: "u1", name: "Mine", source: "uploaded", games: 1 },
      },
    ]);
    expect(fileText(withShipped, "collections/world-cup.pgn")).toBe(`${pgn("S1")}\n\n${pgn("S2")}\n`);
  });

  it("does not export shipped collections when Collections is not ticked", () => {
    const collections = [{ summary: summary("s", "S", "shipped", 1), games: [pgn("S")] }];
    const bundle = build({ collections }, { shippedCollections: true });
    expect(bundle.files).toEqual([]);
    expect(bundle.manifest.includeShippedCollections).toBe(false);
  });
});

describe("the helpers", () => {
  it("names the download by the date", () => {
    expect(exportFileName(NOW)).toBe("chessapp-export-2026-09-22.zip");
  });

  it("enables Export only with a category ticked — the shipped box alone is not one", () => {
    expect(hasExportSelection(NONE)).toBe(false);
    expect(hasExportSelection({ ...NONE, shippedCollections: true })).toBe(false);
    expect(hasExportSelection({ ...NONE, repertoires: true })).toBe(true);
  });

  it("filters collections by the shipped toggle", () => {
    const list = [summary("s", "S", "shipped", 1), summary("u", "U", "uploaded", 1)];
    expect(exportedCollections(list, { shippedCollections: false }).map((c) => c.id)).toEqual(["u"]);
    expect(exportedCollections(list, { shippedCollections: true }).map((c) => c.id)).toEqual(["s", "u"]);
  });
});

describe("zipExport", () => {
  it("packs the manifest and every file, which unzip back as written", () => {
    const bundle = build(
      { playedGames: [played("g1")], repertoires: [repertoire("r1", null)] },
      { games: true, repertoires: true },
    );
    const unzipped = unzipSync(zipExport(bundle));
    expect(Object.keys(unzipped)).toEqual(["manifest.json", "games.pgn", "repertoires/unfiled.pgn"]);
    expect(JSON.parse(strFromU8(unzipped["manifest.json"]))).toEqual(bundle.manifest);
    expect(strFromU8(unzipped["games.pgn"])).toBe(fileText(bundle, "games.pgn"));
  });
});
