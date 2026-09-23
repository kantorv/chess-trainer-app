---
paths:
  - "src/views/settings/**"
  - "src/lib/dataExport*"
  - "src/lib/pgnExport*"
---

# Settings — `/settings/<tab>`

The app's own settings (CTA-86): one screen, **one tab per concern**, each tab
a route segment. **Export** is the only tab today.

## 1. The section

| Piece | File | What it is |
| --- | --- | --- |
| Route | `App.tsx` — `/settings` and `/settings/:tab` | Both render `SettingsMain.tsx`; `/settings` and an unknown tab redirect to the first tab. |
| Screen | `views/settings/SettingsScreen.tsx` | The title, a tab strip (each `Tab` a `RouterLink` to `/settings/<id>`), the active tab's content scrolling under it. |
| Nav | `navFolders()` — `settings` (`nav.folders.settings`, `pinToBottom`); `navItems()` — one entry per tab | A folder, **not** `singleEntry`, so a later tab is one more entry in it. Pinned to the sidebar's foot, under a divider, apart from the screens (`Sidebar.tsx`). |
| Locale | `settings.*` in `en.ts` / `he.ts` | `settings.title`, `settings.tabs.<id>`, `settings.export.*`. |

**Adding a tab**: an entry in `SETTINGS_TABS` (`SettingsScreen.tsx`), a
`navItems()` entry in the `settings` folder at `/settings/<id>`, and
`settings.tabs.<id>` plus its `nav.*` label in both catalogs.

## 2. Export — `/settings/export`

Four checkboxes, each **all or nothing**, each with its item count:
Collections, Games, Analyses, Repertoires. Collections has a second box,
**include shipped collections**: the reader's uploads always go when
Collections is ticked, the shipped ones only with this box too (it is disabled
until Collections is ticked, and the Collections count grows by the shipped
ones when it is ticked). Export is disabled with no category ticked. One click
downloads **one file**, `chessapp-export-YYYY-MM-DD.zip`. Import is out of
scope.

### 2.1 The three layers

| Layer | File | Knows |
| --- | --- | --- |
| Pure builder | `lib/dataExport.ts` — `buildExport`, `zipExport` (`fflate`'s `zipSync`), `exportFileName`, `hasExportSelection`, `exportedCollections` | records in, files + manifest out. No React, no store, no DOM. |
| Reads | `lib/dataExportSource.ts` — `exportZip` | each ticked store `load()`ed (a snapshot is `undefined` until its first read lands, so the export never trusts one) — Collections reads the Library's folders too — the collections' games (a shipped PGN is a lazy chunk, fetched only when shipped is ticked). Rejects with `ExportReadError` when a collection's games cannot be read. Writes nothing. |
| Platform | `lib/pgnExport.ts` — `downloadBinaryFile` | the blob URL and the `<a download>` click; `false` when the browser refuses. Shares `downloadBlob` with the text download. |

`ExportTab.tsx` counts from the stores' snapshots (`useSyncExternalStore`, which
starts each read) and reports a failure in an `Alert` — the export never
throws.

### 2.2 The zip

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

### 2.3 `manifest.json`

```jsonc
{
  "format": "chessapp-export",
  "formatVersion": 1,            // bump on any change an older reader would misread
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
  an analysis' `showArrows`; a repertoire's `previewFen` and `stats`) — enough
  for a future import to rebuild it. An analysis' folder is `folderPath`
  (names from the top; `[]` is Unfiled, as is a folder that is gone); a
  repertoire's is the file's `folder`; an uploaded collection's is its
  `folderPath` (names from the top; `[]` the top level, as is a folder that is
  gone). A shipped collection has no `folderPath` — it is always in Built-in.
  The directories are for a person reading the zip; `folderPath` and
  `folders.collections` are what an import should trust (two sibling folders
  can slugify alike and become `name` and `name-2`).

## 3. Testing

- `lib/dataExport.test.ts` — the builder: every category, empty categories,
  folder mapping (nested analyses, one-level repertoires, a dangling folder,
  the Library's folders as directories with `built-in` reserved),
  name collisions, the shipped toggle, a legacy multi-game repertoire, and a
  zip that unzips back to what was built.
- `views/settings/Settings.test.tsx` — the screen over the real stores
  (fake-indexeddb): counts, checkbox and button states, a download whose zip
  is unzipped and read (a collection two Library folders down lands in
  `collections/club/blitz/`), a refused download. `downloadBinaryFile` is the
  only stub. The Library's store is not reset by `src/test/setup.ts`, so the test
  calls `resetLibraryCollectionStore()` itself.
