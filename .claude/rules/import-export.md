---
paths:
  - "src/lib/dataExport*"
  - "src/lib/dataImport*"
  - "src/lib/pgnExport*"
  - "src/views/settings/ExportTab*"
  - "src/views/settings/ImportTab*"
  - "src/views/settings/ImportDialog*"
  - "src/views/settings/IncompatibleImportDialog*"
---

# Import and Export — the reader's data as one zip

Settings' **Export** (`/settings/export`, CTA-86) takes the reader's data out
as one zip of PGN files and a `manifest.json`; **Import** (`/settings/import`,
CTA-89) puts such a zip back — into the same app or another browser — with the
reader choosing what to take and what happens where a folder is already there.
This file is the whole reference: the zip and its manifest, the layers on each
side, the conflict rules, the caps, the migrations, the incompatible zip, and
testing. The Settings section itself (its routes, tabs and nav) is
[`settings.md`](./settings.md); the stores written and read are
[`database.md`](./database.md).

---

## 0. Where to look

| Path | What lives there |
| --- | --- |
| `src/lib/dataExport.ts` | **The export's builder**, pure: `buildExport` (records in, files + manifest out), `zipExport` (`fflate`'s `zipSync`), `exportFileName`, `hasExportSelection`, `exportedCollections`, and the format's constants — `EXPORT_FORMAT`, `EXPORT_FORMAT_VERSION`, `MANIFEST_PATH`, `EXPORT_CATEGORIES`. |
| `src/lib/dataExportSource.ts` | **The export's reads**: `exportZip` — each ticked store `load()`ed, the collections' games (a shipped PGN a lazy chunk, fetched only when asked), `ExportReadError` when one cannot be read. Writes nothing. |
| `src/lib/pgnExport.ts` | `pgnFileOf` (records joined as they stand) and `downloadBinaryFile` (the blob and the `<a download>`; `false` when the browser refuses). |
| `src/lib/dataImport.ts` | **The import's planner**, pure: `readImport` (zip → a checked, migrated `ImportDump`, or an `ImportProblem` and the zip's `.pgn` files), `migrateManifest` and `MANIFEST_MIGRATIONS`, `importPlanOf` (counts and clashing folders), `defaultImportChoices`, `importWritesOf` (choices → per-store writes, a report, cap problems). No React, no store, no DOM. |
| `src/lib/dataImportTarget.ts` | **The import's reads and writes**: `loadImportCurrent` (every store, read whole), `IMPORT_CAPS`, `applyImport` (the writes through each store's own operations; an uploaded collection indexed first). |
| `src/views/settings/ExportTab.tsx` | The Export tab: four checkboxes and the shipped one, counts from the stores' snapshots, the download, an `Alert` on failure. |
| `src/views/settings/ImportTab.tsx` | The Import tab: the file picker, the progress, the report `Alert`. |
| `src/views/settings/ImportDialog.tsx` | The choice dialog: categories, counts, Merge / Override / Skip, the clashing folders and their own choices, the preview and the cap warnings. |
| `src/views/settings/IncompatibleImportDialog.tsx` | The dialog for a zip that cannot be imported. |
| Store operations added for the import | `importPlayedGames`, `importAnalyses`, `importRepertoires` (remove + add in one write, merged by date — `mergedNewestFirst` in `lib/idbRecordStore.ts`); `addAnalysisFolders`, `addRepertoireFolders`, `addLibraryFolders` (all or nothing under the cap). The collections use `addCollection` (with its id and folder) and `removeCollection`. |
| Tests | `src/lib/dataExport.test.ts`, `src/lib/dataImport.test.ts`, `src/views/settings/Settings.test.tsx` (the section and Export), `src/views/settings/ImportTab.test.tsx` (Import over the real stores). |

Locale keys: `settings.export.*` and `settings.import.*` (`settings.import.dialog.*`,
`.choices.*`, `.choiceHelp.*`, `.top.*`, `.result.*`, `.incompatible.*`), in
both catalogs. Test ids: `settings-export-*`, `settings-import-*`.

---

## 1. The zip

| Category | File(s) | One PGN game per |
| --- | --- | --- |
| Games | `games.pgn` | played game (`lib/playedGameStore.ts`, Play with Engine and Masked Pieces) |
| Analyses | `analyses.pgn` | saved analysis (`lib/savedAnalysisStore.ts`) |
| Collections | `collections/<folder>/…/<name>.pgn`, one per collection, in directories mirroring the Library's folders; shipped ones in `collections/built-in/` | game of the collection |
| Repertoires | `repertoires/<folder>.pgn` per folder (name order), then `repertoires/unfiled.pgn` | repertoire |

- **The stored PGN is joined as it stands** (`pgnFileOf`) — never re-parsed or
  re-serialised, so a record this build cannot read still exports byte for
  byte, and a file loads back into the Library and the Analysis Board.
- **A file with no games is not written**; a ticked, empty category is still
  listed in the manifest's `categories`.
- **File names** are `slugify`d, fall back to the record's id (collections) or
  `folder` (repertoire folders) when a name has no ASCII (a Hebrew title), and
  are made unique per directory with `-2`, `-3`, …. `unfiled` is reserved, so
  a folder named "Unfiled" becomes `unfiled-2.pgn`.
- **The Library's folder tree is the `collections/` directory tree** (CTA-88):
  an upload goes in its folder's directory, each folder a directory named the
  same way (`folder` for a name with no ASCII, unique among its siblings), an
  upload at the top level — or naming a folder that is gone — straight in
  `collections/`. The shipped collections go in `collections/built-in/`, their
  Built-in folder; `built-in` is reserved at the top, so a reader's folder
  called "Built-in" becomes `built-in-2/`. A folder with nothing exported in it
  has no directory (a zip holds files), but it is in the manifest.
- **The download** is one file, `chessapp-export-YYYY-MM-DD.zip`.

## 2. `manifest.json`

```jsonc
{
  "format": "chessapp-export",
  "formatVersion": 1,            // EXPORT_FORMAT_VERSION — bump on any change an older reader would misread (§6)
  "appVersion": "0.4.0",         // __APP_VERSION__
  "exportedAt": "…ISO 8601…",
  "categories": ["collections", "games", "analyses", "repertoires"],
  "includeShippedCollections": false,
  "folders": {                   // whole trees, so an empty folder survives
    "analyses": [["Openings"], ["Openings", "Sicilian"]],
    "repertoires": ["Black", "White"],
    "collections": [["Club"], ["Club", "Blitz"]]   // the Library's folders; Built-in is not one
  },
  "files": [
    { "path": "games.pgn", "kind": "games", "records": [{ "index": 0, "games": 1, "id": "…", "settings": {…}, "path": [], … }] },
    { "path": "analyses.pgn", "kind": "analyses", "records": [{ "index": 0, "games": 1, "name": "…", "description": "…", "orientation": "white", "path": […], "folderPath": ["Openings"], … }] },
    { "path": "collections/built-in/world-cup.pgn", "kind": "collection", "collection": { "id": "…", "name": "…", "source": "shipped", "games": 674 } },
    { "path": "collections/club/blitz/friday.pgn", "kind": "collection", "collection": { "id": "u…", "name": "Friday", "source": "uploaded", "games": 12, "folderPath": ["Club", "Blitz"] } },
    { "path": "repertoires/unfiled.pgn", "kind": "repertoires", "folder": null, "records": [{ "index": 0, "games": 1, "name": "…", "settings": {…}, … }] }
  ]
}
```

- `records` are in file order. `index` is the record's first game in the file
  (0-based, as `splitPgnGames` cuts it) and `games` how many it spans — one,
  except a legacy multi-game repertoire (`isMultiGameRepertoire`), whose later
  neighbours' indices account for it.
- Each record carries everything its store keeps beside the PGN (ids, settings,
  the path the reader stood on, dates; a played game's `resigned` and `mask`;
  an analysis' `showArrows`, `arrowWidthSource` and `arrowPalette`; a
  repertoire's `previewFen` and `stats`) — not a
  played game's engine evals, and not a collection's `addedAt`, which an
  import sets to the moment it writes. An analysis' folder is `folderPath`
  (names from the top; `[]` is Unfiled, as is a folder that is gone); a
  repertoire's is the file's `folder`; an uploaded collection's is its
  `folderPath` (names from the top; `[]` the top level, as is a folder that is
  gone). A shipped collection has no `folderPath` — it is always in Built-in.
- **The directories are for a person reading the zip**; `folderPath` and
  `folders.*` are what the import trusts (two sibling folders can slugify alike
  and become `name` and `name-2`).

---

## 3. Export — the layers

| Layer | File | Knows |
| --- | --- | --- |
| Pure builder | `lib/dataExport.ts` | records in, files + manifest out. |
| Reads | `lib/dataExportSource.ts` — `exportZip` | each ticked store `load()`ed (a snapshot is `undefined` until its first read lands, so the export never trusts one) — Collections reads the Library's folders too — and the collections' games. Rejects with `ExportReadError` when a collection's games cannot be read. |
| Platform | `lib/pgnExport.ts` — `downloadBinaryFile` | the blob URL and the `<a download>` click. |

`ExportTab.tsx`: four checkboxes, each **all or nothing**, each with its count
(the stores' snapshots through `useSyncExternalStore`, which starts each read).
Collections has a second box, **include shipped collections** — the uploads
always go with Collections, the shipped ones only with this box too (disabled
until Collections is ticked; the count grows by the shipped ones). Export is
off with nothing ticked; a failure is an `Alert`, never a throw.

---

## 4. Import — the layers and the flow

```
 file ──▶ readImport(bytes) ──ok──▶ ImportDump ──┐           loadImportCurrent() ──▶ ImportCurrent
             │                                   ▼                                        │
             └─not ok─▶ IncompatibleImportDialog   importPlanOf(dump, current) ◀──────────┤
                        (problem · .pgn files)      │ counts · clashing folders           │
                                                    ▼                                     │
                                          ImportDialog ── choices ──▶ importWritesOf(dump, current, choices, IMPORT_CAPS)
                                          (re-plans on every change:         │   (again at Import, against the stores as they are then)
                                           preview · refused · drops)        ▼
                                                                    applyImport(writes, { index })
                                                                             │ folders, then records, per category
                                                                             ▼
                                                                    ImportResults ──▶ the report Alert
```

1. **Reading writes nothing.** `readImport` unzips (`unzipSync`), checks the
   manifest (§6, §7), then every file it names: cut into games (`gamesOf` —
   `splitPgnGames`, the rule the export counted with, or where each game ends
   when that does not add up, §7), each record's `games` from its `index`, in
   order and covering the file exactly, the record rebuilt from its manifest
   entry and its PGN and run through **its store's normaliser**
   (`playedGameFrom`, `savedAnalysisFrom`, `savedRepertoireFrom`). An uploaded
   collection's games must number its `games`. A shipped collection is only
   counted.
2. **The plan** lays the dump beside the app: each category's count and its
   clashing folders (§5), with how many records each side has in them.
3. **The dialog** offers the categories the zip holds (the others off), each
   ticked, with its count; under a ticked one that clashes, Merge / Override /
   Skip (Merge first) and the clashing folders, each opening to a choice of its
   own. It re-plans on every change, so it shows what the import will add,
   replace, skip and create, and a cap it would pass (§8), before anything is
   written.
4. **Import re-reads the stores and plans again** — what the stores hold then,
   not what the dialog opened on — and `applyImport` writes: per category the
   folders first, then the records (removals and additions in **one** write).
   An uploaded collection's games are indexed first with the Library's worker
   (`views/library/indexCollection.ts`, progress on the tab), then written
   through `addCollection` under its own id and folder.
   **Indexing is the slow part**: about 8–12 ms a game, so a zip carrying
   100,000 games of uploads the app does not have takes a quarter of an hour
   or more (the progress names each collection). A collection the app already
   has (Merge, same id) is skipped without indexing.
5. **The report** is one `Alert`, a line per category: added, replaced,
   skipped, folders created — or refused (a cap), or failed (the storage, a cap
   reached meanwhile, the indexing). Nothing throws.

---

## 5. Conflicts — folders, not records

Records are never compared one by one. A **clash is a folder**, known by its
**path of names**, that is both in the dump and in the app.

- **The top level (Unfiled) always exists**, so it clashes whenever the dump
  puts a record there. **The played games** have no folders: the category
  clashes as a whole (its "folder" is the top level).
- **A folder of the dump's clashes even when it holds nothing** — Override
  would empty the app's.
- **In the app, a folder is its path of names** (`gameFolderPath` for the
  nested trees; a repertoire folder's one name). Two folders with one path —
  names are not unique — resolve to the first (the folder stores are oldest
  first). A record filed in a folder that is gone is at the top level.

The choices, per category, with any clashing folder's own choice over it:

| Choice | The clashing folder |
| --- | --- |
| **Merge** (default) | The dump's records go into the existing folder. **A record whose id the app already has is kept as the app has it** — so importing the same zip twice changes nothing (no write at all). |
| **Override** | The app's records in that folder go, and the dump's come in. A dump record whose id is elsewhere in the app replaces that record too. |
| **Skip** | Nothing of the dump's goes into it. Its sub-folders decide for themselves. |

**A folder of the dump's that the app does not have is created** — empty ones
included (`folders.*`), under its parent (existing or created) — and its
records go in; a record whose id the app already has elsewhere is kept as the
app has it, as under Merge. **Shipped collections are never imported**: they
ship with the app, and the dialog says how many the zip holds. An unticked
category is not written at all.

The report's words: **added** — the dump's records written; **replaced** — the
app's records an Override took away (from the folder, or by id); **skipped** —
the dump's records not written (Skip, or an id the app kept); **folders** —
created.

---

## 6. Migrations — changing the format

`readImport` checks `format === "chessapp-export"`, then brings the manifest
to `EXPORT_FORMAT_VERSION` through **`MANIFEST_MIGRATIONS`** (`lib/dataImport.ts`),
a table keyed by the version each entry upgrades *from*: version `n` in, the
same data as version `n + 1` out. Version 1 is the only one there has been, so
the table is empty and a version-1 manifest passes through unchanged. A
version past this build's is **newer** (§7); a version with no way up (not a
positive integer, a gap in the table, a migration that does not land on the
next version) is **malformed**.

**Bumping the format** (any change an older reader would misread — a renamed
key, a new required field, a changed layout):

1. Change `buildExport` and bump `EXPORT_FORMAT_VERSION` to `n + 1`.
2. Add `MANIFEST_MIGRATIONS[n]`: a manifest of version `n` → the same data as
   `n + 1` (defaults for what the old one lacked), setting `formatVersion`.
   Migrations touch the manifest only; if a file's *contents* must change,
   change what the dump builder reads from the migrated manifest instead.
3. Teach `dumpOf` (in `readImport`) the new shape.
4. Tests in `dataImport.test.ts`: a version-`n` zip (build one, then rewrite
   its manifest back to the old shape, as the migration test does) reads
   through the table; the round trip still holds.

An added *optional* field that an older reader can ignore needs no bump: the
normalisers read what a record lacks as its default ([`database.md`](./database.md) §1.2).

---

## 7. A zip that cannot be imported

`readImport` answers an `ImportProblem` — **not a zip**, **no manifest**, a
**malformed** one (not JSON, not shaped as one, no way up to this version), a
**foreign** one (another `format`), a **newer** `formatVersion`, a **missing
file** the manifest names, or an **unreadable** one (its games do not match the
manifest's records or count, or a record its normaliser refuses) — and the
zip's `.pgn` files. `IncompatibleImportDialog` says which, and that the files
can still come in by hand: collections through the Library's upload
(`/library/new`), analyses and played games through the Analysis Board's Load
tab (`/tools/analysis`), repertoires through Add repertoire
(`/repertoires/new`), listing the `.pgn` files. **Nothing is written.**

**Cutting a file back into games.** The export counted each record's games
with `splitPgnGames`, which cuts only where a blank line is followed by
`[Event …]`. Not every stored PGN opens with `Event`: `treeToPgn` writes a game
from a set-up position with `[SetUp "1"]` / `[FEN …]` first (a played game
begun from a FEN, an analysis of a position), and a repertoire pasted as bare
moves has no tags at all — cut that way, each is glued onto the record before
it. So `gamesOf` tries `splitPgnGames` and, when it does not add up to the
manifest's count, cuts where each game **ends** (a blank line after a
termination marker — `1-0`, `0-1`, `1/2-1/2`, `*` — or before `[Event`). Only
a file that neither way adds up is unreadable: in practice a record with no
termination marker whose next record does not open with `Event`. If that ever
matters, the fix is an optional per-record character offset in the manifest
that the import prefers when present — an added field, so no bump (§6).

---

## 8. Caps

| Store | Cap | Past it |
| --- | --- | --- |
| Played games | 500 (`MAX_PLAYED_GAMES`, CTA-100) | **Imported anyway**: the store drops its oldest, and the dialog warns how many. |
| Analyses | 20,000 | The category is **refused**. |
| Repertoires | 500 | The category is **refused**. |
| Folders (analyses', repertoires', the Library's) | 100 each | The category is **refused**. |

The totals are counted after the choices (an Override's removals, the skipped
records), shown in the dialog before anything is written, and a refused
category writes **nothing** — neither its folders nor its records. The store
operations check again inside their write (`"too-many"`), so a store that grew
in the meantime still never takes a partial category.

---

## 9. Invariants

1. **Export only reads; the import writes nothing until the reader confirms.**
2. **The PGN travels as it is stored** — joined on the way out, cut back into
   games on the way in (§7), never re-serialised.
3. **Every incoming record goes through its store's normaliser.**
4. **Folders are matched by their path of names**, never by a directory or an
   id; an id is kept from the zip, so a re-import finds its own records.
5. **Merge never changes a record the app has.** Re-importing a zip changes
   nothing.
6. **A category is written whole or refused** (played games excepted, with a
   warning); the store operations are the second check.
7. **Shipped collections never enter a store.**
8. **Pure layers stay pure**: `dataExport.ts` and `dataImport.ts` read no store
   (the caps come in as `ImportCaps`); the `…Source` / `…Target` files are the
   only ones that touch IndexedDB.
9. **Nothing throws**: problems are `Alert`s and dialogs.

---

## 10. Testing

- `lib/dataExport.test.ts` — the builder: every category, empty categories,
  folder mapping (nested analyses, one-level repertoires, a dangling folder,
  the Library's folders as directories with `built-in` reserved), name
  collisions, the shipped toggle, a legacy multi-game repertoire, and a zip
  that unzips back to what was built.
- `lib/dataImport.test.ts` — over the export's own zips: reading back every
  category and folder, a legacy multi-game repertoire, each `ImportProblem`,
  the migration seam (identity at the current version, a chain, a gap, newer,
  an older zip read through a test table), the round trip into an empty app,
  the clashes, each choice and a folder's own, the played games as a whole,
  a re-import that plans no write, and each cap.
- `views/settings/Settings.test.tsx` — the section and the Export tab over the
  real stores: counts, the checkboxes and button, a download unzipped and read,
  a refused download. `downloadBinaryFile` is the only stub.
- `views/settings/ImportTab.test.tsx` — the Import tab over the real stores
  (fake-indexeddb): a seeded app exported (`exportZip`), wiped (the stores
  settled, reset and their databases deleted) and imported back — every record,
  folder (empty ones too) and filing; the same zip again changing nothing (the
  snapshots the same arrays); an unticked category; the clash list and a
  folder's own choice; the shipped note; a refused category and the played
  games' warning; the incompatible dialog. A file is picked with
  `userEvent.upload`. The Library's stores are reset in its `beforeEach`.
