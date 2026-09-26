---
paths:
  - "src/lib/pgn*.ts"
  - "src/lib/gameTree*.ts"
  - "src/lib/moveAnnotations*"
  - "src/lib/playChance*"
  - "src/lib/gamesTag*"
  - "src/lib/nextMoveWeights*"
  - "src/views/explorer/AnnotationsBar.tsx"
  - "src/views/explorer/CommentDialog.tsx"
  - "src/views/explorer/NagDialog*"
  - "src/views/explorer/PlayChanceDialog.tsx"
  - "src/views/explorer/chanceArrows*"
  - "src/views/explorer/ChanceArrows*"
  - "src/views/shared/NagGlyphs.tsx"
  - "src/views/shared/nagToneSx.ts"
---

# PGN annotations — what a move can carry, and what the app does with it

Everything a PGN says about a move beyond the move itself: **comments**, the
**commands** written inside them (`[%eval 6.91]`, `[%clk 0:22:33]`), our own
**tags** (`prc:40`), and **NAG glyphs** (`$1`, `!?`). This file is the
reference for all of it — what is read, where it is kept, what is shown, what
is written back — and the place to specify a new one before it is built.

How a board *shows* the tree these ride on is [`tree-views.md`](./tree-views.md);
the tree itself is `lib/gameTree.ts` (the root `CLAUDE.md`, *One game model*).

---

## 1. The principle: the comment text is the storage

An annotation is kept **as the PGN wrote it**, on the tree node, and only
*read* for display. Nothing the app understands is lifted into a field of its
own, except NAGs (which PGN itself gives a token of their own):

| PGN | Kept on the node as | Read by |
| --- | --- | --- |
| `{ text }` after a move (and `; text` to the end of the line) | `comments: string[]`, each trimmed, in file order | `readComment` (`lib/moveAnnotations.ts`) |
| `{ text }` before a variation's first move — `( {Or:} 2... Nc6 )` | `preComments: string[]` | the same |
| `{ text }` before the game's first move | `GameTree.comments` | the same |
| `$N`, and the suffixes `!` `?` `!!` `??` `!?` `?!` | `nags: number[]`, each code once, suffixes as `$1`–`$6` | `nagGlyph` and friends (§4) |

Every field is **absent, not empty**, on a move without one, so a tree built
without annotations is exactly the value it always was.

Why the text is the storage: a file round-trips untouched (`treeToPgn` writes
back what came in — a command we do not understand survives, and a lichess
study or ChessBase keeps working with the same file), and every edit is one
pure tree edit (`setComments`, `setNags`) that the Save strip keeps and
Discard drops.

### Only `parsePgnTree(s)` keeps them

`chess.js`' `loadPgn` — behind `parsePgnGames` — drops side lines *and*
annotations. Every board reads through `parsePgnTree` / `parsePgnTrees`
(`lib/pgn.ts`); only they keep annotations, and only they round-trip.

### Parsing rules (`lib/pgn.ts`)

- A comment, NAG or suffix **belongs to the move before it**. A comment
  before a variation's first move is that move's `preComments`; before the
  game's first move, the tree's `comments`. A variation holding only a
  comment is kept on the move it answers.
- The same comment twice on one move, whitespace aside, is kept once
  (`holdsComment` — PGN hard-wraps at ~80 columns, so one sentence arrives
  wrapped differently).
- `< … >` reserved sections are skipped.

### Writing rules (`treeToPgn`, `lib/gameTree.ts`)

- `{ before } N. SAN $n $n { after }` — NAGs **always as `$N`**; a `!` read in
  comes back out as `$1`. Every PGN reader takes both.
- A `; line comment` is written as `{ … }`; a `}` inside one is dropped (it
  would close the brace).
- Export options (`PgnExportOptions`, the Analysis Board's Export tab, CTA-73)
  strip **all comments** (and with them every command and tag of §2–§3), **all
  NAGs**, or **all side lines**.

### Merging (`mergeTrees`)

Several games folded into one tree (a many-game upload's *Merge*, in the
Analysis module's popup, the Repertoires' import and the Openings explorer's
Load tab). Where games meet on a move, **comments are joined** (a shared one
kept once) and **NAGs unioned**. Note what joining does to a tag: two games'
`prc:` on the same move become two marks on it, and **the first one wins**
(§3).

**Counting** (`mergeTrees`' `{ countGames: true }`, CTA-101) — passed by the
Analysis merge (the Board's Load tab and the analyses Lobby) and the
Repertoires' import merge; **not** by the Openings explorer, whose merge
writes no tags. It writes the `games` tag (§3):

- **Only on branch candidates**: at a position the merged games leave by two
  or more different moves, each of those moves gets `[%games N]`. A position
  every game leaves the same way writes nothing, so the shared trunk stays
  clean.
- **N** is how many of the merged games played that move from that position.
  A game counts **once per node**, its own side lines included. A move that
  already carries a `games` tag counts as **that many** games (summed); an
  untagged one counts 1 — so a re-merge adds up rather than under-counting.
- The inputs' own `games` tags are **taken out** of everything joined
  (`withoutGames`, on the trunk too), and the one summed tag is written
  **first in the move's first comment** (`{ [%games 3] Prose. }`).
- Without the option nothing is counted and the merge is what it always was.

---

## 2. Commands inside a comment — `[%key value]`

The PGN-spec embedded command form, as lichess, ChessBase and the chess.com
exports write them. `readComment` takes every one out of the prose and shows
it as a **chip** in the comment block (`AnnotationsBar`): the key's label,
then the value, pinned LTR. The value is **shown as written, never
interpreted** — nothing draws `[%cal]` arrows on the board or feeds `[%eval]`
into the eval bar today. The one reading beyond the chip is the Analysis
Board's arrows, which can be sized by `[%eval]` (CTA-98, §3).

| Command | Example | Chip label (`annotations.keys.*`) | Does anything else read it? |
| --- | --- | --- | --- |
| `%eval` | `[%eval 6.91]`, `[%eval #-3]` | Eval | **yes** — the Analysis Board's *Evaluation* arrow widths (§3) |
| `%clk` | `[%clk 0:22:33]` | Clock | no |
| `%emt` | `[%emt 0:00:12]` | Time spent | no |
| `%cal` | `[%cal Ge2e4,Rd7d5]` | Arrows | no — not drawn |
| `%csl` | `[%csl Gd4,Re5]` | Squares | no — not drawn |
| `%prc` | `[%prc 40]` | Play chance | **yes** — the trainer and the arrows (§3) |
| `%games` | `[%games 12]` | Games | **yes** — the Analysis Board's *Games* arrow widths (§3) |
| any other `%key` | `[%foo bar]` | the key itself | no — kept and written back |

A key must start with a letter (`[A-Za-z][\w-]*`). Commands are part of the
comment text, so the comment dialog shows and edits them verbatim.

### The engine-evaluation shapes analysis exports write

Two plain-text shapes are also read out of the prose, into chips:

| Text | Chips |
| --- | --- |
| `+/= +1.31 (21 ply)` — ending a comment | Assessment `+/=`, Eval `+1.31`, Depth `21` |
| `-+ mate-in-12` — anywhere | Assessment `-+`, Mate in `12` |

The assessment is optional; it is one of `+-` `-+` `+/-` `-/+` `+/=` `=/+`
`=` `∞`. The trailing shape's eval counts as the move's evaluation for the
Analysis Board's arrows, as `[%eval]` does (`evalOf`, `lib/nextMoveWeights.ts`).

---

## 3. Our tags — `prc` and `games`

A **tag** is a `name:value` token in plain comment text — the form the
lichess-tools browser extension writes, which a lichess study carries without
complaint. Each also accepts the command form (`[%name value]`), so a file
from either convention reads the same.

### `prc` — play chance (CTA-69), `lib/playChance.ts`

| | |
| --- | --- |
| **Written** | `prc:40` (whole token, case-insensitive, `prc: 40` too) or `[%prc 40]`. A 0–100 percentage; decimals read; above 100 reads as 100. Ours writes `prc:N`, appended to the move's **last** comment (or a comment of its own). |
| **On which move** | The **candidate move at the branch** — the first move of its variation — never the move before the branch (lichess-tools' classic user mistake; it ignores it there, and so do we). |
| **Read** | `playChanceOf(node)`: its `comments`, then `preComments`; **the first mark wins**. |
| **Means** | How often the repertoire trainer plays that move there. The four rules — no marks: by lines within 8 plies; all marked: scaled to 100%; some marked: the rest share the remainder by lines; `prc:0`: never (unless all are 0) — are in the module note of `lib/playChance.ts`. |
| **Set by** | The move menu's *Play chances…* (`PlayChanceDialog`, per branch, `setPlayChances`) — or typed into a comment. |
| **Shown** | A *Play chance* chip, never as prose (`withoutPlayChance`). With `arrows.chances`, and **only where the branch carries a mark**, the board's arrows become the **chance overlay** (`ChanceArrows`: white, magenta border, width by chance) and the next-moves bar prints each move's percentage — the repertoire player. |
| **Offered on** | Boards where a trainer plays by it; the Analysis Board turns the menu item off (`playChances: false`, CTA-73). |
| **Also written by** | The Library opening board's *Save tree as PGN* (CTA-99), as `[%prc P]` — each move's share of its position's games, `round(child / parent × 100)`, in one comment after `[%games N]` when both are asked for. |

### `games` — how many games went through a move (CTA-98), `lib/gamesTag.ts`

| | |
| --- | --- |
| **Written** | `games:12` (whole token, case-insensitive, `games: 12` too) or `[%games 12]`. A whole number. Ours writes `[%games N]`. |
| **Written by** | `mergeTrees` with `countGames` (CTA-101, §1 *Merging*) — the Analysis merge and the Repertoires' import merge, on branch candidates only, summing tags already there; and the Library opening board's *Save tree as PGN* (CTA-99, below), on every move below the board's position. |
| **On which move** | The move it counts — the candidate at a branch — as `prc`. |
| **Read** | `gamesOf(node)`: its `comments`, then `preComments`; **the first one wins**. |
| **Shown** | A *Games* chip (`annotations.keys.games`), never as prose (`withoutGames`). |
| **Means** | With the Analysis Board's width source on *Games*, each tagged move's arrow is its share of the tagged moves' games at the branch. The repertoire player still sizes by `prc` only (`arrows.chances`). |
| **Export** | Comment text: the Export tab's *comments off* strips it with every other comment. |

### The arrows these weigh — one overlay, three kinds of source

`ChanceArrows` (`views/explorer/`) takes **one number per continuation** and
knows nothing of where it came from:

| Board | The number | Where it comes from |
| --- | --- | --- |
| Repertoire player | the move's play chance | `prc` marks → `playChances` (`useVariationsExplorer`, `arrows.chances`) |
| Library collection lobby's opening board | the share of the position's games that played the move | `child.count / node.count`, counted from the collection's rows (`lib/openingTree.ts`, `OpeningFilterBoard.tsx`, CTA-92) — **not** from any PGN annotation |
| Analysis Board (CTA-98) | the chosen width source's weight | `nextMoveWeights` (`lib/nextMoveWeights.ts`, `arrows.widthSource`): `[%eval]` as loss vs the best tagged move, `games` as a share, `prc` scaled among the tagged moves, or the lines within 8 plies; the arrows in the Arrows tab's palette, an untagged move gray ([`analysis-board.md`](./analysis-board.md) §1.1) |

### Written today: the Library's `[%games N]` (CTA-99)

The Library opening board's *Save tree as PGN*
([`game-collections.md`](./game-collections.md) §6.4.1, `lib/openingTreePgn.ts`)
already **writes** `[%games N]` — the games of the (filtered) collection that
played the move from that position — on every move below the board's position,
in the command form, first in the move's one comment
(`{ [%games 12] [%prc 40] }` when `prc` is asked for too). It is **read** by
`gamesOf` (CTA-98): a *Games* chip in the comment block, and — opened on the
Analysis Board with its width source on *Games* — each move's arrow sized by
its share. `mergeTrees` writes it too (§1 *Merging*, CTA-101).

---

## 4. NAG glyphs (CTA-97), `lib/moveAnnotations.ts`

`NAG_SECTIONS` is the table: three sections, in the order the *Add annotation…*
dialog's tabs show them and the order glyphs print after the SAN. A choice
standing for two codes is **one choice**: it writes the first code and shows
either as active.

| Section | Code | Glyph | Meaning (`nagDialog.meaning.*`) | Colour |
| --- | --- | --- | --- | --- |
| Move Assessment | `$1` | `!` | Good move | good (green) |
| | `$2` | `?` | Poor move or mistake | mistake (orange) |
| | `$3` | `!!` | Very good or brilliant move | brilliant (deep green) |
| | `$4` | `??` | Very poor move or blunder | blunder (red) |
| | `$5` | `!?` | Interesting or speculative move | interesting (magenta) |
| | `$6` | `?!` | Questionable or dubious move | dubious (blue) |
| | `$7`, `$8` | `□` | Only move / forced move | plain |
| | `$9` | `⊗` | Worst move | plain |
| Position Evaluation | `$10`, `$11` | `=` | Equal position | plain |
| | `$13` | `∞` | Unclear or volatile position | plain |
| | `$14` / `$15` | `⩲` / `⩱` | White / Black has a slight advantage | plain |
| | `$16` / `$17` | `±` / `∓` | White / Black has a moderate advantage | plain |
| | `$18` / `$19` | `+−` / `−+` | White / Black has a decisive advantage | plain |
| Positional Features & Commentary | `$22` / `$23` | `⨀` | Zugzwang (White / Black) | plain |
| | `$36` / `$37` | `↑` | Initiative (White / Black) | plain |
| | `$40` / `$41` | `→` | Attack (White / Black) | plain |
| | `$44` | `…` | Compensation | plain |
| | `$132` | `⇆` | Counterplay | plain |
| | `$138` | `⊕` | Zeitnot (severe time pressure) | plain |
| | `$140` | `Δ` | With the idea of… | plain |
| | `$146` | `N` | Opening novelty | plain |

**Outside the table** — kept, written back, never offered in the dialog, never
touched by it:

| Code | Glyph |
| --- | --- |
| `$32`, `$33` (development advantage) | `⟳` |
| `$133` (counterplay, Black) | `⇆` |
| `$139` (zeitnot, Black) | `⊕` |
| anything else | `$N`, as written |

### The rules

- **Selection** (`toggleNag`, lichess's): Move Assessment and Position
  Evaluation are **single-choice** — picking a glyph replaces the section's,
  picking the active one removes it; Positional Features are **multi-select**.
- **Print order** (`nagsInPrintOrder`): the move mark right after the SAN,
  then the evaluation, the features, and anything outside the table — each
  group in the order the move carries it. `isMoveMark` is the Move Assessment
  section (`$1`–`$9`).
- **Colour** (`nagTone` → `views/shared/nagToneSx.ts`): only `$1`–`$6`, the
  lichess families, one shade per colour scheme. On the current move the
  glyph takes the highlight's text colour.
- **Where shown**: the mainline cells (`GameMove.nags`, carried by
  `mainlineGame`), the side-line tokens and the map's labels — every board,
  read-only ones included — inside the SAN's `dir="ltr"` token; the comment
  block prints the marks after the move and the rest beside it.
- **Set by** the move menu's *Add annotation…* (`NagDialog`); every toggle is
  one `setNags` edit.

---

## 5. Where the code is

| Path | What lives there |
| --- | --- |
| `src/lib/pgn.ts` | The tokenizer and `parsePgnTree(s)`: comments, `;` comments, `$N`, suffixes onto the node. |
| `src/lib/gameTree.ts` | The node fields; `setComments` / `commentsAt`, `setNags`; `mergeTrees`' joining and its `games` counting; `treeToPgn` and `PgnExportOptions`; `moveTreeToPgn` — the same writer over moves with no board (`PgnMove`: SAN, ply, annotations). |
| `src/lib/openingTreePgn.ts` | The Library's *Save tree as PGN*: an opening tree's counts written as `[%games N]` / `[%prc P]` (§3). |
| `src/lib/moveAnnotations.ts` | `readComment` (commands, the eval shapes, `prc` and `games` → chips), `annotationsAt`; the NAG table and its rules. |
| `src/lib/playChance.ts` | `prc`: reading, writing, the chance rules. |
| `src/lib/gamesTag.ts` | `games`: `gamesInText`, `withoutGames`, `gamesOf`. |
| `src/lib/nextMoveWeights.ts` | The Analysis Board's arrow widths from `[%eval]`, `games`, `prc` or the lines ahead; which of them a tree carries. |
| `src/lib/pgnComments.ts` | `reflowComment` — hard-wrapped comment text back into paragraphs. |
| `src/views/explorer/AnnotationsBar.tsx` | The comment block: prose, chips, glyphs. |
| `src/views/explorer/CommentDialog.tsx`, `NagDialog.tsx`, `PlayChanceDialog.tsx` | The three editors, opened from the move menu. |
| `src/views/explorer/ChanceArrows.tsx` + `chanceArrows.ts` | The weight-per-move arrow overlay. |
| `src/views/shared/NagGlyphs.tsx`, `nagToneSx.ts` | Glyphs after a SAN, and the move marks' colours. |

Tests: `lib/pgnAnnotations.test.ts` (parse, write, merge, the merge's
`games` counting, edits), `lib/gameTree.test.ts` (the counting's placement),
`lib/moveAnnotations.test.ts`, `lib/playChance.test.ts`,
`lib/nextMoveWeights.test.ts` (the `games` and `[%eval]` readers, the widths),
`views/explorer/NagDialog.test.tsx`.
