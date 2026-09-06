#!/usr/bin/env node
/**
 * Vendors the eco.json opening database into src/data/openings/.
 *
 * eco.json (https://github.com/JeffML/eco.json, MIT) ships its data as five
 * files split by ECO category (A-E) plus an `eco_interpolated.json` that fills
 * in the FENs *along* each named line, not just its final position. Its own
 * npm package (`@chess-openings/eco.json`) excludes all of that from the
 * published tarball and fetches it from GitHub at runtime instead (see its
 * methods/getLatestEcoJson.ts) — CTA-30 explicitly rules that out (no runtime
 * network fetch, so the Openings screen works offline and on GitHub Pages), so
 * the data is vendored into this repo instead.
 *
 * This script re-splits eco_interpolated.json by each entry's own `eco` field
 * (not by which canonical file the loader would have paired it with) and
 * merges it into the matching category, so every category file already
 * contains both the canonical roots and the intermediate positions along the
 * way there. Each entry is trimmed to the three fields the app actually reads
 * — `eco`, `name`, `moves` — dropping aliases/scid/src/isEcoRoot/rootSrc, which
 * are roughly half the source files' weight.
 *
 * Run manually against a checkout of https://github.com/JeffML/eco.json — not
 * part of the build — and commit the resulting files:
 *
 *   node scripts/vendorOpenings.mjs /path/to/eco.json/checkout
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const srcDir = process.argv[2];
if (!srcDir) {
  console.error("usage: node scripts/vendorOpenings.mjs <path-to-eco.json-checkout>");
  process.exit(1);
}

const CATEGORIES = ["A", "B", "C", "D", "E"];
const outDir = join(import.meta.dirname, "..", "src", "data", "openings");

const readJson = (name) => JSON.parse(readFileSync(join(srcDir, name), "utf8"));

const trim = (entry) => ({
  eco: entry.eco,
  name: entry.name,
  moves: entry.moves,
});

const shards = Object.fromEntries(CATEGORIES.map((letter) => [letter, {}]));

const fold = (collection) => {
  for (const [fen, entry] of Object.entries(collection)) {
    const letter = typeof entry.eco === "string" ? entry.eco[0] : undefined;
    const shard = letter && shards[letter];
    if (!shard) continue; // an eco code outside A-E is not one this app files anywhere
    // Canonical roots load first (below) and win a collision; interpolated
    // entries are keyed by a different, non-root FEN in practice, so this
    // guard is a safety net rather than the expected path.
    shard[fen] ??= trim(entry);
  }
};

for (const letter of CATEGORIES) fold(readJson(`eco${letter}.json`));
fold(readJson("eco_interpolated.json"));

for (const letter of CATEGORIES) {
  const path = join(outDir, `eco${letter}.json`);
  writeFileSync(path, JSON.stringify(shards[letter]));
  console.log(`${path}: ${Object.keys(shards[letter]).length} entries`);
}
