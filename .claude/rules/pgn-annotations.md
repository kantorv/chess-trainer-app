---
paths:
  - "src/lib/pgn*.ts"
  - "src/lib/gameTree*.ts"
  - "src/lib/moveAnnotations*"
  - "src/lib/playChance*"
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
is written back — and the place to specify a new one before it is built (§6).

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
Analysis Board's load and the Repertoires' import). Where games meet on a
move, **comments are joined** (a shared one kept once) and **NAGs unioned**.
Nothing is counted — which is what §6's `games` tag is for. Note what joining
does to a tag: two games' `prc:` on the same move become two marks on it, and
**the first one wins** (§3).

---

## 2. Commands inside a comment — `[%key value]`

The PGN-spec embedded command form, as lichess, ChessBase and the chess.com
exports write them. `readComment` takes every one out of the prose and shows
it as a **chip** in the comment block (`AnnotationsBar`): the key's label,
then the value, pinned LTR. The value is **shown as written, never
interpreted** — nothing draws `[%cal]` arrows on the board or feeds `[%eval]`
into the eval bar today.

| Command | Example | Chip label (`annotations.keys.*`) | Does anything else read it? |
| --- | --- | --- | --- |
| `%eval` | `[%eval 6.91]`, `[%eval #-3]` | Eval | no |
| `%clk` | `[%clk 0:22:33]` | Clock | no |
| `%emt` | `[%emt 0:00:12]` | Time spent | no |
| `%cal` | `[%cal Ge2e4,Rd7d5]` | Arrows | no — not drawn |
| `%csl` | `[%csl Gd4,Re5]` | Squares | no — not drawn |
| `%prc` | `[%prc 40]` | Play chance | **yes** — the trainer and the arrows (§3) |
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
`=` `∞`.

---

## 3. Our tags — `prc` (and `games`, planned: §6)

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

### The arrows these weigh — one overlay, two sources today

`ChanceArrows` (`views/explorer/`) takes **one number per continuation** and
knows nothing of where it came from:

| Board | The number | Where it comes from |
| --- | --- | --- |
| Repertoire player | the move's play chance | `prc` marks → `playChances` (`useVariationsExplorer`, `arrows.chances`) |
| Library collection lobby's opening board | the share of the position's games that played the move | `child.count / node.count`, counted from the collection's rows (`lib/openingTree.ts`, `OpeningFilterBoard.tsx`, CTA-92) — **not** from any PGN annotation |

That seam — a weight per move, the overlay drawing it — is where a second
tag plugs in (§6).

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
| `src/lib/gameTree.ts` | The node fields; `setComments` / `commentsAt`, `setNags`; `mergeTrees`' joining; `treeToPgn` and `PgnExportOptions`. |
| `src/lib/moveAnnotations.ts` | `readComment` (commands, the eval shapes, `prc` → chips), `annotationsAt`; the NAG table and its rules. |
| `src/lib/playChance.ts` | `prc`: reading, writing, the chance rules. |
| `src/lib/pgnComments.ts` | `reflowComment` — hard-wrapped comment text back into paragraphs. |
| `src/views/explorer/AnnotationsBar.tsx` | The comment block: prose, chips, glyphs. |
| `src/views/explorer/CommentDialog.tsx`, `NagDialog.tsx`, `PlayChanceDialog.tsx` | The three editors, opened from the move menu. |
| `src/views/explorer/ChanceArrows.tsx` + `chanceArrows.ts` | The weight-per-move arrow overlay. |
| `src/views/shared/NagGlyphs.tsx`, `nagToneSx.ts` | Glyphs after a SAN, and the move marks' colours. |

Tests: `lib/pgnAnnotations.test.ts` (parse, write, merge, edits),
`lib/moveAnnotations.test.ts`, `lib/playChance.test.ts`,
`views/explorer/NagDialog.test.tsx`.

---

## 6. Planned — the `games` tag (not built)

**The need.** A merged tree (§1, *Merging*) forgets how many of its games went
through each move. The Library's opening board knows those counts — but from
the collection's rows, not from anything a PGN can carry — so a merged file
opened on the Analysis Board or as a repertoire cannot draw the same
"how often was this played" arrows. A `games` tag written at merge time makes
the count part of the file, and the arrow overlay (§3) gains a second weight
source beside `prc`.

**The shape, following `prc`:**

| | |
| --- | --- |
| **Written** | `games:N` in the move's comment, `[%games N]` read too; `N` a whole number ≥ 1 — the games of the merge that played this move from this position. |
| **Written by** | `mergeTrees`, on every node, as it folds the games. |
| **Read** | A `lib/` helper beside `playChanceOf` (`gamesOf(node)`), shown as a *Games* chip (`annotations.keys.games`), never as prose. |
| **Arrows** | At a branch, `games` weights → shares (`N / Σ N` of the siblings) → `ChanceArrows`, exactly as the Library's opening board does with its row counts. Which weight a board draws becomes a parameter of the explorer's arrows (today `arrows.chances: boolean`, prc only) — e.g. `arrows.weights: "prc" \| "games"` — so the repertoire player keeps `prc` and a merged analysis draws `games`. |

**To decide before building:**

1. **Re-merging** a tree that already carries `games:` — sum the counts (the
   honest total) rather than join two marks, which the §1 comment join would
   do today (first-wins would then under-count).
2. **An unmerged move** added later by the reader has no `games` — shown with
   no arrow width, or counted as 1?
3. **Both tags on one branch** — which the board draws when it was not told.
4. **Export** — `games:` is comment text, so *comments off* strips it; whether
   it needs an option of its own.
5. **The Library** — whether its opening board keeps counting rows (always
   exact, filter-aware) or can also read `games` from a shipped merged PGN.

When built, move this section into §3 as a second tag and add its tests to
`lib/pgnAnnotations.test.ts`.
