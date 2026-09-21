# The Library's shipped collections

Every collection here is one **collection** of the Library (`/library`,
CTA-75) — a top-level folder whose games are listed as a sortable, filterable
table, each game opening on a full analysis board. A collection is three
things, all written by one command:

| File | What it is | Fetched |
| --- | --- | --- |
| `<Stem>.pgn` | the games, as PGN (line endings normalised) | when a game is opened, or the collection downloaded |
| `<Stem>.index.json` | its **index** — a row per game for the table | when its table is opened |
| `manifest.json` | every collection's id, name, files, game count and PGN hash | never — it is in the bundle, so `/library` fetches nothing |

## Wire a file

```sh
node scripts/wirepgn.js path/to/Candidates2024.pgn            # or: yarn wirepgn …
node scripts/wirepgn.js path/to/games.pgn --name "Tata Steel 2025" --id tatasteel2025
```

That copies the file here, indexes it and registers it — **no TypeScript, no
locale key, no route.** Wiring a file whose id or file name is taken replaces
that collection, so re-running it after editing a PGN is how the index is
brought up to date.

- **Its name** defaults to the file name's words: `Candidates2024.pgn` is
  "Candidates 2024" (`collectionNameOfStem` in `src/lib/libraryCollections.ts`:
  word breaks at a case change, at a letter–digit boundary and at `_` / `-`).
- **Its address** defaults to the file name, slugified: `/library/candidates2024`,
  and its games `/library/candidates2024/<1-based number>`.
- **A game is a chunk** — the file is cut where an `[Event …]` tag follows a
  blank line (`collectionGamesOf`), which is how every PGN export separates
  games; a chunk with no tag and no move is left out.
- **The index is the table.** Each row is the game's tags — White, Elo, Black,
  Elo, Result, Date, Round, Event, ECO, Opening (with `Variation` after a comma)
  — plus what a real parse adds (`src/lib/collectionIndex.ts`): the length in
  moves, a flag on a game whose moves will not parse (marked in the table),
  and the ECO and opening from the opening book when the tags leave them out.
  The parse is ~10 ms a game, so wiring 10,000 games takes about two minutes;
  it is paid here, once, and never when the table opens.
- **Shipped games are read-only.** Changes made on one are kept only as a copy
  in Saved analyses.

The other commands:

```sh
node scripts/wirepgn.js --list            # what is wired
node scripts/wirepgn.js --check           # exit 1 if a PGN changed since it was indexed, or a .pgn is unwired
node scripts/wirepgn.js --rebuild         # re-index everything (after the index format changes)
node scripts/wirepgn.js --remove <id>     # unwire one, deleting its two files
```

**Do not drop a `.pgn` in by hand or edit one in place** without re-wiring:
`src/lib/shippedCollections.test.ts` fails on a `.pgn` the manifest does not
list, and on one whose text no longer matches the hash its index was built
from.

## What ships

| File | Games | What it is |
| --- | --- | --- |
| `WorldCup2023.pgn` | 674 | FIDE World Cup 2023, Baku |
| `Bucharest2023.pgn` | 45 | Superbet Classic 2023, Bucharest |
| `Morphy.pgn` | 211 | Paul Morphy's games |

`src/lib/shippedCollections.test.ts` asserts the three names and counts;
wiring another means adding a row there too.

## How big

Collections of 5,000–10,000 games are what this is sized for. A 10,000-game
file is ~9.5 MB of PGN (~2.8 MB gzipped, fetched only when a game is opened)
and ~1.4 MB of index (~200 KB gzipped). Each file is its own lazy chunk, so a
large collection costs nothing to a reader who never opens it.

## The reader's own collections

Collections the reader adds at `/library/new` (a `.pgn` file or a paste) are
not files here: every game is checked by the same index pass (in a Web
Worker, under a progress bar), and the collection is kept in the browser's
IndexedDB (`src/lib/libraryCollectionStore.ts`), listed after the shipped
ones.
