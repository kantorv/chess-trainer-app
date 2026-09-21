#!/usr/bin/env node
/**
 * **Wire a PGN collection into the Library** (CTA-75) — the one way a shipped
 * collection is added, re-indexed or removed.
 *
 *   node scripts/wirepgn.js path/to/Candidates2024.pgn [--name "…"] [--id …]
 *   node scripts/wirepgn.js --list
 *   node scripts/wirepgn.js --check          # exit 1 when anything is stale (CI)
 *   node scripts/wirepgn.js --rebuild        # every index again (a new index format)
 *   node scripts/wirepgn.js --remove <id>
 *
 * Wiring a file:
 *
 * 1. copies it into `src/data/library/<Stem>.pgn`, line endings normalised
 *    (a file already there is rewritten in place);
 * 2. cuts it into games with the app's own rule (`collectionGamesOf`) and
 *    indexes them (`buildCollectionIndex`: the tags, and a `chess.js` pass —
 *    the length, unreadable games, the opening from eco.json where the tags
 *    lack one) into `<Stem>.index.json`;
 * 3. registers it in `src/data/library/manifest.json` — id, name, the two
 *    file names, the game count and the PGN's hash — which is what the
 *    Library lists, with no fetch, and what `shippedCollections.test.ts`
 *    checks every file and index against.
 *
 * The name defaults to the file name's words (`Candidates2024` →
 * "Candidates 2024"), the id to its slug (`candidates2024` —
 * `/library/candidates2024`). Wiring a file whose id or file name is taken
 * replaces that collection.
 *
 * The indexing is **the app's code, not a copy of it**: `src/lib/` is loaded
 * through Vite's module runner (`runnerImport`), so an upload and a wired file
 * are indexed by the same functions. About 8 ms a game — ~80 s for 10,000.
 *
 * `--dir <path>` points it at another folder (the tests' temporary one).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runnerImport } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MANIFEST = "manifest.json";
const MANIFEST_FORMAT = "chessapp.libraryManifest";
const MANIFEST_VERSION = 1;

const USAGE = `Usage:
  node scripts/wirepgn.js <file.pgn> [--name "Name"] [--id slug]   wire (or re-wire) a collection
  node scripts/wirepgn.js --list                                   the wired collections
  node scripts/wirepgn.js --check                                  exit 1 if a file or index is stale
  node scripts/wirepgn.js --rebuild                                re-index every collection
  node scripts/wirepgn.js --remove <id>                            unwire one, deleting its files
Options:
  --dir <path>   the collections folder (default: src/data/library)`;

const fail = (message) => {
  console.error(`wirepgn: ${message}`);
  process.exit(1);
};

/* --- arguments ---------------------------------------------------- */

const parseArgs = (argv) => {
  const args = { files: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = () => {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("--")) fail(`${arg} needs a value`);
      index += 1;
      return next;
    };
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--list") args.list = true;
    else if (arg === "--check") args.check = true;
    else if (arg === "--rebuild") args.rebuild = true;
    else if (arg === "--remove") args.remove = value();
    else if (arg === "--name") args.name = value();
    else if (arg === "--id") args.id = value();
    else if (arg === "--dir") args.dir = value();
    else if (arg.startsWith("--")) fail(`unknown option ${arg}\n\n${USAGE}`);
    else args.files.push(arg);
  }
  return args;
};

/* --- the app's code, through Vite's module runner ----------------- */

const load = async (path) =>
  (await runnerImport(join(ROOT, path), { configFile: false, root: ROOT, logLevel: "silent" })).module;

const loadLib = async () => {
  const [index, collections] = await Promise.all([
    load("src/lib/collectionIndex.ts"),
    load("src/lib/libraryCollections.ts"),
  ]);
  return { ...index, ...collections };
};

/**
 * The opening book, read off the disk. `loadOpeningBook`'s dynamic imports do
 * not resolve under the module runner (it answers an empty book), so the
 * shards are read here and handed to `openingLookupOf`.
 */
const loadLookup = (lib) => {
  const book = {};
  for (const shard of ["A", "B", "C", "D", "E"]) {
    Object.assign(book, JSON.parse(readFileSync(join(ROOT, `src/data/openings/eco${shard}.json`), "utf8")));
  }
  return lib.openingLookupOf(book);
};

/* --- the manifest -------------------------------------------------- */

const readManifest = (dir) => {
  const path = join(dir, MANIFEST);
  if (!existsSync(path)) return { format: MANIFEST_FORMAT, version: MANIFEST_VERSION, collections: [] };
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  if (manifest.format !== MANIFEST_FORMAT || manifest.version !== MANIFEST_VERSION) {
    fail(`${path} is not a version ${MANIFEST_VERSION} library manifest`);
  }
  return manifest;
};

const writeManifest = (dir, manifest) => {
  manifest.collections.sort((a, b) => a.name.localeCompare(b.name));
  writeFileSync(join(dir, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
};

/* --- wiring -------------------------------------------------------- */

const kb = (chars) => `${Math.round(chars / 1024).toLocaleString("en")} KB`;

/** Index `text` and write `<stem>.index.json`; the manifest entry's numbers back. */
const indexFile = (lib, lookup, dir, stem, text, label) => {
  const games = lib.collectionGamesOf(text);
  if (games.length === 0) fail(`no game could be read in ${label}`);
  const started = Date.now();
  const tty = process.stderr.isTTY;
  let shown = 0;
  const index = lib.buildCollectionIndex(games, {
    lookup,
    hash: lib.textHash(text),
    onProgress: (done, total) => {
      if (tty && (done === total || Date.now() - shown > 200)) {
        shown = Date.now();
        process.stderr.write(`\r  indexing ${label}: ${done.toLocaleString("en")} / ${total.toLocaleString("en")} games`);
      }
    },
  });
  if (tty) process.stderr.write("\n");
  const indexName = `${stem}.index.json`;
  const encoded = lib.encodeCollectionIndex(index);
  writeFileSync(join(dir, indexName), encoded);
  const unreadable = index.rows.filter((row) => row.unreadable).length;
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `  ${games.length.toLocaleString("en")} games (${unreadable} unreadable) in ${seconds}s — ` +
      `PGN ${kb(text.length)}, index ${kb(encoded.length)}`,
  );
  return { index: indexName, games: games.length, hash: index.hash };
};

const wire = async (dir, source, options) => {
  const sourcePath = resolve(source);
  if (!existsSync(sourcePath)) fail(`no such file: ${source}`);
  const rawStem = basename(sourcePath).replace(/\.pgn$/i, "");
  const stem = rawStem.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  if (stem === "") fail(`cannot make a file name out of ${basename(sourcePath)}`);

  const lib = await loadLib();
  const text = readFileSync(sourcePath, "utf8").replace(/\r\n?/g, "\n");
  const id = options.id ?? lib.collectionIdOfStem(stem);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) fail(`--id must be lower-case letters, digits and dashes: ${id}`);
  const name = (options.name ?? lib.collectionNameOfStem(stem)).trim();
  if (name === "") fail("--name is empty");

  mkdirSync(dir, { recursive: true });
  const manifest = readManifest(dir);
  const pgn = `${stem}.pgn`;
  const replaced = manifest.collections.filter((entry) => entry.id === id || entry.pgn === pgn);
  for (const entry of replaced) {
    for (const file of [entry.pgn, entry.index]) {
      if (file !== pgn && file !== `${stem}.index.json`) rmSync(join(dir, file), { force: true });
    }
  }

  console.log(`Wiring "${name}" (${id}) from ${source}`);
  writeFileSync(join(dir, pgn), text);
  const numbers = indexFile(lib, loadLookup(lib), dir, stem, text, pgn);
  manifest.collections = [
    ...manifest.collections.filter((entry) => !replaced.includes(entry)),
    { id, name, pgn, ...numbers },
  ];
  writeManifest(dir, manifest);
  console.log(
    `  ${replaced.length > 0 ? "re-wired" : "wired"}: ${join(dir, pgn)}, ${join(dir, numbers.index)}; ` +
      `registered in ${MANIFEST} — /library/${id}`,
  );
};

const rebuild = async (dir) => {
  const lib = await loadLib();
  const lookup = loadLookup(lib);
  const manifest = readManifest(dir);
  for (const entry of manifest.collections) {
    console.log(`Re-indexing "${entry.name}" (${entry.id})`);
    const path = join(dir, entry.pgn);
    if (!existsSync(path)) fail(`${entry.pgn} is missing — run --remove ${entry.id}`);
    const stem = entry.pgn.replace(/\.pgn$/, "");
    Object.assign(entry, indexFile(lib, lookup, dir, stem, readFileSync(path, "utf8"), entry.pgn));
  }
  writeManifest(dir, manifest);
};

const remove = (dir, id) => {
  const manifest = readManifest(dir);
  const entry = manifest.collections.find((candidate) => candidate.id === id);
  if (entry === undefined) fail(`no collection "${id}" is wired`);
  rmSync(join(dir, entry.pgn), { force: true });
  rmSync(join(dir, entry.index), { force: true });
  manifest.collections = manifest.collections.filter((candidate) => candidate !== entry);
  writeManifest(dir, manifest);
  console.log(`Removed "${entry.name}" (${id}) and its two files.`);
};

const list = (dir) => {
  const { collections } = readManifest(dir);
  if (collections.length === 0) console.log("No collections are wired.");
  for (const entry of collections) {
    console.log(`${entry.id.padEnd(24)} ${String(entry.games).padStart(7)} games  ${entry.name}  (${entry.pgn})`);
  }
};

/** Every file against its manifest entry and index; the problems found. */
const check = async (dir) => {
  const lib = await loadLib();
  const manifest = readManifest(dir);
  const problems = [];
  for (const entry of manifest.collections) {
    const path = join(dir, entry.pgn);
    if (!existsSync(path)) {
      problems.push(`${entry.id}: ${entry.pgn} is missing`);
      continue;
    }
    const text = readFileSync(path, "utf8");
    if (lib.textHash(text) !== entry.hash) problems.push(`${entry.id}: ${entry.pgn} changed since it was wired`);
    const indexPath = join(dir, entry.index);
    const index = existsSync(indexPath)
      ? lib.decodeCollectionIndex(JSON.parse(readFileSync(indexPath, "utf8")))
      : undefined;
    if (index === undefined) problems.push(`${entry.id}: ${entry.index} is missing or unreadable`);
    else if (index.hash !== entry.hash || index.rows.length !== entry.games) {
      problems.push(`${entry.id}: ${entry.index} does not match the manifest`);
    }
  }
  const wired = new Set(manifest.collections.map((entry) => entry.pgn));
  for (const file of existsSync(dir) ? readdirSync(dir) : []) {
    if (file.endsWith(".pgn") && !wired.has(file)) problems.push(`${file} is not wired`);
  }
  return problems;
};

/* --- main ---------------------------------------------------------- */

const args = parseArgs(process.argv.slice(2));
const dir = resolve(args.dir ?? join(ROOT, "src/data/library"));
const actions = [args.list, args.check, args.rebuild, args.remove !== undefined, args.files.length > 0].filter(Boolean);

if (args.help || actions.length !== 1 || args.files.length > 1) {
  console.log(USAGE);
  process.exit(args.help ? 0 : 1);
}
if (args.list) list(dir);
else if (args.remove !== undefined) remove(dir, args.remove);
else if (args.rebuild) await rebuild(dir);
else if (args.check) {
  const problems = await check(dir);
  for (const problem of problems) console.error(`wirepgn: ${problem}`);
  if (problems.length > 0) {
    console.error("Re-wire with: node scripts/wirepgn.js <file.pgn>  (or --rebuild)");
    process.exit(1);
  }
  console.log("Every collection is wired and indexed.");
} else await wire(dir, args.files[0], args);
