# Vendored: react-chessboard documentation & Storybook examples

A verbatim copy of the upstream `docs/` tree (prose + runnable story source).
These files are **not** shipped in the npm package, so this is the only
in-repo copy. Vendored so an agent (or a human) can answer a board question
by reading a file here instead of digging through `node_modules` source or
doing a web search.

| | |
| --- | --- |
| Upstream | https://github.com/Clariity/react-chessboard — `docs/` folder |
| Docs site | https://react-chessboard.vercel.app |
| Matches installed | `react-chessboard@5.12.1`, paired with `chess.js@1.4.0` |
| Vendored on | 2026-09-02 |

## Two tiers

Not all of this is equal, so it isn't all treated equally:

| Tier | What | Where |
| --- | --- | --- |
| **Always loaded** | the options API and the types/helpers reference | generated into `.claude/rules/react-chessboard-*.md`, which Claude Code loads every session |
| **On demand** | everything else — 53 story files, the narrative docs, the v5 upgrade guide | stays here; routed by [`INDEX.md`](./INDEX.md) |

The split is by *granularity*: the options API is one indivisible unit that
gets consulted constantly, so paying ~8.7k tokens per session beats a lookup
detour. The 53 stories are 53 units of which you need one — loading all ~32k
to reach ~600 tokens would be a ~50× overpay.

## When this goes stale

Re-sync after any `react-chessboard` major/minor bump. Steps:

1. `cp <upstream>/docs/*.mdx docs/vendor/react-chessboard/`
2. `cp -r <upstream>/docs/stories docs/vendor/react-chessboard/`
3. Regenerate the two always-loaded rules files (strips the Storybook
   scaffolding and rewrites `<Canvas>` tags into links at the story sources):

   ```bash
   python3 docs/vendor/react-chessboard/mdx2rules.py \
     docs/vendor/react-chessboard/D_OptionsApi.mdx \
     .claude/rules/react-chessboard-options-api.md D_OptionsApi.mdx

   python3 docs/vendor/react-chessboard/mdx2rules.py \
     docs/vendor/react-chessboard/E_FunctionsAndTypes.mdx \
     .claude/rules/react-chessboard-types-and-helpers.md E_FunctionsAndTypes.mdx
   ```

   Those two files are **generated — never hand-edit them**; the edit would be
   lost on the next bump and there'd be no record it was ever made.
4. Update the version + date rows above, and the version stamp the script
   writes into each generated header (`HDR` in `mdx2rules.py`).
5. Re-check [`INDEX.md`](./INDEX.md) and
   [`../../../.claude/rules/chessboard.md`](../../../.claude/rules/chessboard.md)
   for anything the upgrade changed — in particular whether §6's v4→v5 summary
   or §3's project patterns now contradict upstream.

Assets (`assets/`), the doc-site React components (`components/`) and the
upstream `stockfish/` folder are intentionally **not** vendored — the app
already carries its Stockfish worker in `public/stockfish/` and its wrapper
in `src/lib/engine.ts`. Because of that, `stories/advanced-examples/
AnalysisBoard.stories.tsx` has one dangling `import … from '../../stockfish/
engine.js'`; read it for the eval-per-position pattern, and use
`src/lib/engine.ts` (documented in `.claude/rules/chessboard.md` §4) as the
real wrapper.

## What is authoritative

For **this project's** conventions (ref-owned `chess.js`, `ForceLTR`, the
lazy-engine-ref rules, the demo-only `promotion: 'q'` shortcut, …) the
authoritative file is [`.claude/rules/chessboard.md`](../../../.claude/rules/chessboard.md).
These vendored files are upstream reference: correct about the library,
silent about how we wire it in. On any conflict, the rules file wins.
