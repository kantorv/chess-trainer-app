# User PGNs — adding a study

This folder **is** the User PGNs library. Everything the section shows —
the sidebar folders, the card grids, the replay screens at `/pgn/*` — is built
from the `.pgn` files sitting here, their optional `.mdx` folder notes, and the
optional manifest one level up (`src/data/pgn.json`).

## Drop a file in

Copy a `.pgn` file into `src/data/pgn/`. That is the whole of it — **no
TypeScript, no locale key, no route, no component edit.** A build-time glob
(`src/lib/pgnCatalog.ts`) inlines the text, `loadPgnLibrary`
(`src/lib/pgnLibrary.ts`) turns it into catalog entries, and the sidebar and
routes are generated from the result.

- **One file is one folder.** It gets one entry in the User PGNs sidebar.
- **One game — or one study chapter — is one card.** A lichess study export
  with 18 chapters becomes a folder of 18 cards; a chess.com export with 9
  games becomes a folder of 9.
- Every card links to `/pgn/<folder>/<game-id>`, where the game replays over
  the shared move list and board controls.

## Notes for a folder — a sibling `.mdx`

A folder can carry **authored notes**: what the study is, who wrote it, what to
look for. They fill the right-hand panel of that folder's list screen, in place
of the one-line hint it shows otherwise.

Writing them is the same one-file drop the `.pgn` was. Give the note **the file
name of its PGN with an `.mdx` extension**, sitting right next to it:

```
lichess_study_queen-vs-rook-rosettes_by_methurst_2021.07.08.pgn   ← the games
lichess_study_queen-vs-rook-rosettes_by_methurst_2021.07.08.mdx   ← the notes
```

No manifest field and no locale key — the manifest says nothing about notes, and
a note is content, so it is written in the language its study is in. A folder
with no `.mdx` keeps the hint, unchanged.

- **It is MDX, not Markdown.** Headings, lists, **bold**, links, quotes, code
  and GitHub-flavoured tables all work, and a note can `import` and render a
  real React component when prose stops being enough.
- **The panel is narrow and it scrolls.** Write as long a note as the study
  deserves; `LibraryNotes.tsx` styles the elements and scrolls the overflow, and
  the board square next to it is not affected.
- **A note is matched to its folder by path**, so a file the manifest nests
  under a group finds its notes there too. An `.mdx` whose `.pgn` is missing
  names no folder and is simply never shown — `src/views/library/folderNotes.ts`
  is the lookup, and `folderNotes.test.ts` asserts every shipped note addresses
  a folder that exists.

## Where the names come from

Never from `src/locales` — a listed study is *content*, not app chrome.

| Thing | Named from | Falling back to |
| --- | --- | --- |
| a **folder** | `src/data/pgn.json` → `files."<name>.pgn".label` | the file's `StudyName` tag, else the file name humanised (`my_study.pgn` → `My study`) |
| a **game** | its `ChapterName` tag (a study chapter) | `White – Black (Result)` (a played game; the `(Result)` is dropped when absent), else the `Event` tag, else `Game <n>` |

`chess.js` fills a game's seven-tag roster with placeholders (`"?"`,
`"????.??.??"`, a `"*"` result); those count as absent, so a game with no real
players and no `Event` falls all the way to its number.

A game's **id** is a URL slug of its name. Two games that slug to the same
string (two chess.com games between the same players), or a name with no ASCII
in it (a Hebrew chapter title), get the game's number appended so the id stays
unique and bookmarkable.

## The manifest (`src/data/pgn.json`) — optional, and additive

Every field is an **override**. A file the manifest says nothing about still
appears; the manifest can rename, translate, group and order, but it can never
hide a file.

```jsonc
{
  "folders": {
    // Names for the grouping folders that `under` paths create, keyed by path.
    "lessons": { "en": "Endgame lessons", "he": "שיעורי סופי משחק" }
  },
  "files": {
    "my_study.pgn": {
      "label": { "en": "Rook Rosettes", "he": "רוזטות צריח" }, // rename / translate the folder
      "order": 10                                              // sort key among siblings
    },
    "lucena.pgn":   { "under": "lessons", "order": 10 },
    "philidor.pgn": { "under": "lessons", "order": 20 }
  }
}
```

- **`label` `{ en, he }`** — rename and/or translate a file's folder. Omit a
  language and it falls back to `en`.
- **`order`** — sort among siblings. A file with no `order` sorts last, then by
  file name. The sidebar and the list screens both read this, so they agree.
- **`under: "<path>"` + `folders."<path>": { en, he }`** — nest several files
  under one named folder. Two or more files sharing an `under` path produce a
  folder in the sidebar that lists each file's games. A grouping folder with no
  `folders` entry for its path is named from that path segment, humanised.

### How a folder renders in the sidebar

- A **single** file's folder holds exactly one list screen, so the sidebar
  renders it as **one clickable item** — no redundant folder-with-one-child.
  (The same fold applies to the Mates and Positions sections.)
- A **manifest group** of two or more files stays a **folder** you expand to
  reach each file's list.

## Nothing throws — problems are reported

`loadPgnLibrary` never throws (it runs at module scope; a `throw` there would
take the whole app down). Each of these is a line in the catalog's `problems`
array, and the rest of the library still loads:

- a game that will not parse — that one game is dropped, the other games in the
  file are kept;
- a file with no games at all, or one whose every game is broken — no folder is
  created for it;
- a manifest entry naming a file that is not in this directory;
- two files resolving to the same folder path.

The exact rules live in [`src/lib/pgnLibrary.ts`](../../lib/pgnLibrary.ts);
`src/lib/pgnLibrary.test.ts` and `src/lib/pgnCatalog.test.ts` pin them down.
