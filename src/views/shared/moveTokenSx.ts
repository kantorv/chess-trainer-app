/**
 * The sx of a move token: the typography, the box model and the selected
 * highlight the variation line draws its tokens with, and the tree's
 * start-position row too.
 *
 * Pure data in a file of its own, beside the components that render it
 * (`VariationLine.tsx`), because a component file must export only components
 * for Vite's fast refresh to work (`react-refresh/only-export-components`) —
 * the same split `savedList.ts` makes beside the saved-list components.
 */

/** The shape of a SAN token — the move list's cells and numbers carry the same. */
export const sanTokenSx = {
  unicodeBidi: "isolate",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "0.8125rem",
} as const;

/** The box model of a flowing token: content-width, so it sits inline in a run. */
export const moveSx = {
  paddingInline: 0.5,
  paddingBlock: 0.125,
  borderRadius: 0.5,
  minWidth: 0,
} as const;

/** The highlight of the token the selection is on. */
export const selectedTokenSx = {
  bgcolor: "primary.main",
  color: "primary.contrastText",
  fontWeight: 700,
} as const;
