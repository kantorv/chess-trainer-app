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

## A file holding several studies

Lichess can export **all** of an author's studies as one file, and that file is
not one study with a lot of chapters — it is many studies whose chapters happen
to share a file. Dropped in as it is, its chapter names would collide
("Chapter 1", fourteen times over) and the thing a reader actually looks for —
the study — would not be addressable at all.

So a file carrying more than one `StudyName` **splits**, and the drop is still
the whole of the work:

```
methurst-public-studies.pgn        ← one file, 28 StudyNames, 169 chapters
  └── /pgn/methurst-public-studies                    the file's folder
        ├── …/queen-vs-rook-adjacent-rosettes         one study
        │     └── …/chapter-1                         one chapter
        └── …/queen-vs-rook-lightning                 the next study, …
```

- **A sub-folder per `StudyName`**, named from that tag and ordered as the file
  first mentions each — a study's own chapters keep their order inside it.
- **The file's folder is named from the manifest, or from the file name.** There
  is no single `StudyName` it could take, and naming the group after one of the
  studies inside it would be worse than a plain file name.
- **A chapter with no `StudyName` stays in the file's own folder**, beside the
  study sub-folders rather than in one invented to hold it.
- **A file with one `StudyName`, or none, is untouched** — the split is the
  multi-study case and nothing else.
- **The list screen shows the studies as cards** (`LibraryFolderCard.tsx`), each
  counting everything behind it, and the search box filters folders as well as
  chapters. Nothing else changed: `/pgn/*` is one splat route at any depth, the
  sidebar generator already recursed, and a chapter still hands itself on with
  `?game=`.

`methurst-public-studies.pgn` is the shipped example. Note that it *contains*
the standalone `lichess_study_queen-vs-rook-rosettes…` study as one of its 28,
so the sidebar names that study twice — the data says so, and nothing in the
section requires a name to be unique across files.

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
| a **study sub-folder** | its `StudyName` tag | — (a file only splits on that tag) |
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
- A **multi-study file** is a folder too: its studies are the rows inside it.
  Its own row has no list screen unless some chapter in it carried no
  `StudyName` — a folder that only groups gets the folder and no second row
  named the same. Its list screen is still reachable by URL, and shows the
  studies as cards.

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
