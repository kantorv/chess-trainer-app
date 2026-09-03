**Chess training technique specification**

# **Piece Masking / Hidden Pieces**

*A precise definition of the visualization and working-memory exercise*

| Core idea: The player sees where the pieces are, but the visual identity of some or all pieces is deliberately removed or disguised. The player must maintain the true piece identity internally while continuing to play normal chess. |
| :---- |

# **1\. Definition**

Piece Masking is a chess-training technique in which the board geometry and piece locations remain visible, but the visual information that identifies a piece type is suppressed or replaced. For example, queens, rooks, bishops, and knights may all be displayed using the same pawn graphic. The game itself remains an ordinary legal chess game: the underlying piece types, legal moves, captures, checks, promotions, and material values have not changed.

The defining requirement is that the player must remember the hidden identity of each masked piece and use that internal representation to reason about the position and choose legal moves.

# **2\. What the technique is \- and is not**

| Technique | Description | Included? |
| :---- | :---- | :---- |
| Piece masking | Piece graphics are made identical or otherwise non-informative while piece identity remains part of the hidden state. | YES |
| Blindfold chess | The board and pieces are not visually available at all; the player maintains the whole position mentally. | RELATED, BUT DIFFERENT |
| Memory puzzle repetition | The player repeatedly studies and recalls fixed positions or tactical problems. | NO |
| Woodpecker Method | Repeated solving of a set of chess puzzles to reinforce patterns. | NO |
| Normal chess | All piece identities are visible and no information is deliberately removed. | BASELINE |

# **3\. Exact training model**

## **3.1 Visible information**

The training interface should normally preserve:

* Board coordinates and square geometry.  
* The location of every piece.  
* Side to move and game progression.  
* Visual information needed to see that a square is occupied.  
* Optional legal move highlighting, clocks, and other ordinary game UI elements, depending on the training mode.

## **3.2 Hidden information**

The following information is deliberately removed from the visual representation for masked pieces:

* Piece type (king, queen, rook, bishop, knight, or pawn), except where intentionally left unmasked.  
* Any visual cue that makes the hidden type trivially recognizable, such as piece silhouette, notation glyph, or distinctive color/shape.  
* Optional derived information such as the piece symbol in move history, when the goal is strict identity masking.

## **3.3 Preserved internal state**

The software must retain the real chess state even when the user interface does not reveal it. For every piece, the hidden state includes at least:

* Color / side (White or Black).  
* True piece type.  
* Current square.  
* Whether the piece is still present in the game.  
* All ordinary chess state required for legal move generation (castling rights, en-passant state, promotion state, and move sequence where applicable).

# **4\. Canonical exercise**

A canonical implementation of the technique can be defined as follows:

1. Start from a legal chess position, normally the initial position or a selected game position.  
2. Choose a masking policy. In the strongest basic form, every non-pawn piece is rendered as a pawn; a more general implementation may mask selected piece types or selected pieces.  
3. Show the player the resulting board. The player can see occupied squares but cannot identify masked pieces by appearance.  
4. The player plays a normal game. Moves are made according to the true hidden piece identities, not according to the displayed pawn graphics.  
5. The player is expected to maintain the identities of masked pieces in working memory throughout the game.  
6. The exercise continues until the game ends, the training session is stopped, or the chosen reveal condition is triggered.  
7. At the end, the software may reveal the true position and optionally provide mistakes or identity-recall feedback.

# **5\. The central cognitive task**

The exercise is not primarily about memorizing a static picture. It requires maintaining an evolving internal mapping:

**visible square  →  remembered piece identity  →  legal moves / consequences**

After every move, the player must update that mapping. When a masked piece moves, is captured, promotes, or participates in castling, the internal representation must remain synchronized with the board.

# **6\. Example**

Suppose the actual position contains:

| Square | Displayed object | Actual piece |
| :---- | :---- | :---- |
| g5 | pawn | White bishop |
| e7 | pawn | Black knight |
| a1 | rook | White rook |
| d8 | pawn | Black queen |

To the player, g5, e7, and d8 visually appear to contain pawns. The player nevertheless must know that the pieces on those squares have bishop, knight, and queen movement, respectively. A move that would be legal for a pawn but illegal for the actual piece must not become legal merely because the piece is displayed as a pawn.

# **7\. Important implementation rule: rendering must not change chess semantics**

Masking is a presentation-layer transformation, not a rules transformation. Internally, the chess engine must continue to operate on the true piece types.

* A masked queen still moves as a queen.  
* A masked bishop still moves diagonally.  
* A masked knight still moves in an L-shape.  
* A masked rook still moves along ranks/files.  
* A masked king remains subject to check and king-safety rules.  
* A masked piece can be captured according to its real identity and square occupancy.  
* Notation, PGN, engine analysis, and game legality should use the true underlying position.

# **8\. Variants**

| Variant | Mechanism | Difficulty |
| :---- | :---- | :---- |
| Selected pieces | Mask only a small number of pieces while leaving the rest visible. | Easy |
| Selected types | For example, hide all bishops and knights but show rooks and queens. | Easy–Medium |
| Non-pawns only | Render every queen, rook, bishop, and knight as a pawn. | Medium |
| All pieces identical | Render all pieces, potentially including kings, with the same neutral symbol. | Hard |
| Progressive masking | Begin with one masked piece and add more as the player succeeds. | Adaptive |
| Temporary masking | Mask pieces for a period, then reveal them for verification. | Adaptive |
| Random masking | Randomly choose which pieces are masked at the start of a game or phase. | Adaptive |

# **9\. Reveal and feedback modes**

A software implementation can vary when the real identities become visible. These are different training modes, not different definitions of the technique:

* Continuous: identities remain hidden for the whole game.  
* On move: identity is revealed briefly after each move, then masked again.  
* On request: the player can reveal a piece but receives a training penalty.  
* On mistake: the software reveals an identity when the player attempts an impossible move or makes a configured mistake.  
* End of game: the entire true position is revealed only after the session.  
* Timed reveal: pieces become visible for a short verification interval.

# **10\. Difficulty progression**

| Level | Masking | Typical goal | Main demand |
| :---- | :---- | :---- | :---- |
| 1 | 1–2 selected pieces | Learn the concept | Identity retention |
| 2 | Several pieces | Play short games | Identity \+ square tracking |
| 3 | All minor/major pieces except kings | Play complete games | Continuous position update |
| 4 | All pieces except pawns or complete identity masking | Longer games | Strong working-memory load |
| 5 | Full masking with little/no external assistance | Sustained play | Near-blindfold-style internal representation |

# **11\. Recommended product terminology**

There does not appear to be a universally standardized historical name for this exact exercise. For software, the following terminology is clear and avoids incorrectly presenting it as a formally named historical method.

| Term | Recommended use | Comment |
| :---- | :---- | :---- |
| Piece Masking | Preferred technical feature name | Precise description of the mechanism. |
| Hidden Pieces | Preferred user-facing training name | Short, intuitive, easy to understand. |
| Masked Pieces | Alternative UI label | Compact and descriptive. |
| Piece Identity Training | Pedagogical description | Emphasizes the skill being trained. |
| Blindfold Chess | Avoid as the primary name | Related concept, but technically broader and different. |
| Woodpecker Method | Do not use | Refers to puzzle repetition, not this exercise. |

# **12\. Suggested software specification**

A concise product requirement for the feature could read:

| “Piece Masking is a visualization and working-memory training mode in which the application renders selected chess pieces with a neutral or identical appearance while preserving their true identities internally. The user plays legal chess against a human or engine using the hidden piece identities. The UI must not expose the masked piece type except through the configured reveal mechanism. All chess rules, move generation, notation, game state, and analysis remain based on the underlying true position.” |
| :---- |

# **13\. Design principles**

* Do not turn the exercise into a different chess variant; the rules remain standard chess.  
* Do not provide accidental identity cues through piece silhouette, color, animation, notation, move hints, or engine overlays unless the mode explicitly permits them.  
* Keep the true game state authoritative and separate from the rendering layer.  
* Let difficulty be controlled by the amount and duration of masking rather than by changing chess rules.  
* Treat revealing a piece as a training aid or event, not as a change to the underlying position.

# **14\. Terminology note**

**Historical terminology:** Older Soviet/Russian chess literature discusses chess memory, operational memory, spatial imagination, and exercises that deliberately reduce reliance on visual recognition. However, the exact practice of replacing the visual representations of pieces with pawns does not appear to have a single universally established name in the sources reviewed for this specification. “Piece Masking” is therefore used here as a precise descriptive product term, not as a claim about an official historical method name.
---

# **15\. Implementation in this app (CTA-15)**

This section is not part of the specification above. It records how the
technique is built in `chessapp-analyze-v1`, and the four design decisions
settled with the requester on 2026-09-03 before the work started.

## **15.1 Where it lives**

| Piece | File |
| :---- | :---- |
| The mask, and everything pure about it | [`src/lib/pieceMask.ts`](../src/lib/pieceMask.ts) |
| The screen | [`src/views/masked/play/`](../src/views/masked/play/) — `MaskedPlay.tsx`, `MaskedPanel.tsx`, `MaskEditor.tsx` |
| The board square both engine screens share | [`src/views/shared/EngineBoardSquare.tsx`](../src/views/shared/EngineBoardSquare.tsx) |
| Route and sidebar entry | `/masked/play`, in the **Masked Pieces** folder |

Nothing in `chess.js`, `lib/engine.ts`, `lib/gameModel.ts` or the PGN path knows
the feature exists — §7 and §13 turned into an arrangement of files. The mask is
read at render time in exactly two places: the board's `options.pieces`, and the
notation.

## **15.2 Decision 1 — mask by piece type, not by individual piece**

A `PieceMask` is a twelve-entry map from a true type (`wK` … `bP`) to the type
drawn in its place, so each colour is masked independently and "mask only
Black's pieces" is an ordinary mask rather than a feature.

The doc's **Selected pieces** variant (§8) was considered and rejected for now.
`chess.js` gives a piece no stable identity, so per-piece masking would need a
square → identity map maintained across every move, capture, castle, en passant
and promotion — a second source of truth able to drift out of step with the real
position, which is what §13 exists to prevent. A type-level mask is a lookup with
no state at all, and a promoted pawn is automatically drawn as whatever a queen
is drawn as, because nothing ever recorded that it had been a pawn.

A mask entry is expected to point at a piece of the **same colour**: colour is
visible information (§3.1) and only the type is hidden (§3.2). The editor offers
nothing else.

## **15.3 Decision 2 — notation masking, a setting, on by default**

SAN names the piece that moved, and the move list sits directly beside the
board, so `Nf3` hands back the identity the board is busy hiding (§3.2's
"optional derived information such as the piece symbol in move history"). With
the setting on, a move whose piece is hidden is printed as plain coordinates —
`g1f3`, `e7e8q` — in **both** the move list and the Variations tab. The check
and mate marks are kept: every piece can give check, so `+` and `#` identify
nothing.

"Hidden" there is deliberately wider than "in disguise", and this is the part
worth remembering:

> A type's identity is unreadable when it is drawn as something else, **or when
> something else is drawn as it**.

Under *All pieces identical* the pawn is still drawn as a pawn and is
nonetheless the most thoroughly hidden man on the board — everything is a pawn
to look at, so `e4` in the move list is the one thing that would say which of
them really was one. Under *Non-pawns only* the king is the opposite case:
nothing else is drawn as a king, so `Kf1` gives nothing away and stays SAN.

## **15.4 Decision 3 — share the hook, extract the layout**

`usePlayWithEngine` is reused **verbatim, with zero edits** — it is all of the
behaviour, and the masked game is an ordinary game. The eval bar + board +
promotion-picker square was lifted out of `PlayWithEngine.tsx` into
`views/shared/EngineBoardSquare.tsx`, which both screens render, so the
board-square width discipline (`.claude/rules/chessboard.md` §5) exists in one
place. Rejected: forking the screen (that sizing rule and the panel layout would
exist twice and drift), and a mode flag on the shipped screen (the pattern the
repo already rejected for `useAnalysisBoard` vs `usePlayWithEngine`).

The promotion picker is deliberately **not** masked. It is the player's own
choice of what to promote to, so four identical pawns there would hide a
decision they are in the middle of making rather than one they are meant to
remember. The piece it produces is drawn masked from the next render on.

## **15.5 Decision 4 — the tab is called "Masking"**

`/tools/editor` is already the Board Editor and it edits *positions*; this tab
edits *appearance*.

## **15.6 The presets that ship**

Three rows of the variants table (§8), weakest first:

| Preset | Mechanism | §8 row |
| :---- | :---- | :---- |
| Show real pieces | The identity mask — the baseline, and the way to switch masking off without leaving the screen. | Normal chess |
| Non-pawns as pawns | Every queen, rook, bishop and knight drawn as a pawn; the kings left standing as landmarks. | Non-pawns only (Medium) |
| All pieces identical | The kings included — every man on the board the same shape. | All pieces identical (Hard) |

The twelve per-type controls sit under them, so any *Selected types* mask is one
edit away.

## **15.7 Deliberately not built yet**

The reveal and feedback modes (§9), and progressive / temporary / random masking
and the difficulty ladder (§8, §10). All of them build on this same `PieceMask`
rather than replacing it. Masking on the Analysis Board, Load PGN and the Board
Editor is also out of scope: those screens study a game rather than play one.
