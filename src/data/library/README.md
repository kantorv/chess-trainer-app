# The Library's shipped collections

Every `.pgn` file in this folder is one **collection** of the Library
(`/library`, CTA-75) — a top-level folder whose games are listed as a
sortable, filterable table, each game opening on a full analysis board.

## Drop a file in

Copy a `.pgn` file here. That is the whole of it — **no TypeScript, no
manifest, no locale key, no route.** A lazy build-time glob
(`src/lib/shippedCollections.ts`) makes each file its own chunk, fetched the
first time its collection is opened.

- **Its name comes from the file name.** `WorldCup2023.pgn` is "World Cup
  2023" (`collectionNameOfStem` in `src/lib/libraryCollections.ts`: word breaks
  at a case change, at a letter–digit boundary and at `_` / `-`).
- **Its address is the file name, slugified.** `WorldCup2023.pgn` is
  `/library/worldcup2023`, and its games `/library/worldcup2023/<1-based number>`.
- **A game is a chunk** — the file is cut where an `[Event …]` tag follows a
  blank line (`splitPgnGames`), which is how every PGN export separates games.
- **The table reads tags, not moves.** Its columns are `#`, White, Elo, Black,
  Elo, Result, Date, Round, Event, ECO, Opening (with `Variation` after a
  comma) and Moves (counted off the movetext). A tag a file does not carry
  leaves its cell empty; nothing is required.
- **Shipped games are read-only.** Changes made on one are kept only as a copy
  in Saved analyses.

## What ships

| File | Games | What it is |
| --- | --- | --- |
| `WorldCup2023.pgn` | 674 | FIDE World Cup 2023, Baku |
| `Bucharest2023.pgn` | 45 | Superbet Classic 2023, Bucharest |
| `Morphy.pgn` | 211 | Paul Morphy's games |

`src/lib/shippedCollections.test.ts` asserts the three names and counts;
adding a file means adding a row there too.

## The reader's own collections

Collections the reader adds at `/library/new` (a `.pgn` file or a paste) are
not files here: they are kept in `localStorage`
(`src/lib/libraryCollectionStore.ts`) and listed after the shipped ones.
