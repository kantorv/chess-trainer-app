import Box from "@mui/material/Box";
import type { ComponentType } from "react";

/**
 * A folder's authored notes, rendered in the shell's right-hand panel.
 *
 * The notes are an MDX module (`folderNotes.ts` is what finds them), so what
 * arrives here is a **component**, not a string — which is the whole reason the
 * feature is MDX rather than Markdown: a note can import and render a real
 * component later without this file changing. All that is left is the two things
 * a narrow panel needs of arbitrary authored prose.
 *
 * ### It scrolls itself
 *
 * `Layout.tsx`'s aside is a flex column that deliberately does **not** scroll —
 * a panel with a section pinned to its foot needs the height to divide up. So a
 * panel scrolls its own regions, and `RightPanel` portals into a host with
 * `display: contents`, which makes this box a direct flex child of the aside.
 * `flex: 1` + `minHeight: 0` + `overflowY: auto` is therefore the whole
 * contract: notes longer than the panel scroll here, and the board square next
 * to them never learns that they were long.
 *
 * ### It styles elements it never wrote
 *
 * MDX compiles to bare `h2` / `p` / `ul` / `table` / `a`, which carry no MUI
 * styling and would otherwise render at browser defaults — Times New Roman at
 * 2em, blue underlined links, a table wider than the panel. The `sx` below is a
 * small typographic reset in theme tokens, so it follows light and dark with no
 * second palette: sizes in `rem`, colours from `text.*` / `primary.main` /
 * `divider`, and every horizontal overrun (a table, a code block, a long URL)
 * kept inside the box rather than widening it.
 *
 * Nothing here pins direction. The aside mirrors under Hebrew by design — the
 * board is the one subtree that must not — so the margins are logical
 * properties and a Hebrew note reads right-to-left on its own.
 */

type Props = {
  /** The MDX module's default export. */
  notes: ComponentType;
  /** `data-testid` for the region, derived from the section's list id. */
  testId: string;
  /**
   * Render inside a scroller that is already there, rather than as one.
   *
   * The panel is the usual home for notes and owns its own scrolling. A
   * collection's index screen puts the same authored prose in the **body**,
   * above the study list and inside that screen's one scroll region — where a
   * second `overflowY` would trap the notes in a box of their own. Only the
   * three layout declarations differ; the typographic reset below is the point
   * of the component and is shared either way.
   */
  inline?: boolean;
};

function LibraryNotes({ notes: Notes, testId, inline = false }: Props) {
  return (
    <Box
      data-testid={testId}
      sx={{
        // The aside hands out its height and scrolls nothing itself.
        ...(inline
          ? {}
          : { flex: 1, minHeight: 0, overflowY: "auto" }),
        overflowX: "hidden",

        color: "text.secondary",
        fontSize: "0.875rem",
        lineHeight: 1.6,

        // Authored prose sets its own vertical rhythm; the panel supplies none.
        "& > :first-of-type": { mt: 0 },
        "& > :last-child": { mb: 0 },

        "& h1, & h2, & h3, & h4, & h5, & h6": {
          color: "text.primary",
          fontWeight: 700,
          lineHeight: 1.3,
          mt: 2,
          mb: 1,
        },
        "& h1": { fontSize: "1.05rem" },
        "& h2": { fontSize: "0.95rem" },
        "& h3, & h4, & h5, & h6": { fontSize: "0.875rem" },

        "& p": { my: 1 },
        "& strong": { color: "text.primary", fontWeight: 700 },

        "& ul, & ol": { my: 1, paddingInlineStart: "1.25rem" },
        "& li": { mb: 0.5 },

        "& a": {
          color: "primary.main",
          textDecoration: "underline",
          // A pasted URL is one unbreakable word, and one is enough to push the
          // panel wider than the aside allows.
          overflowWrap: "anywhere",
        },

        "& blockquote": {
          my: 1,
          marginInline: 0,
          paddingInlineStart: 1.5,
          borderInlineStart: "3px solid",
          borderColor: "divider",
          fontStyle: "italic",
        },

        "& code": {
          fontFamily: "monospace",
          fontSize: "0.8125rem",
          bgcolor: "action.hover",
          borderRadius: 0.5,
          px: 0.5,
        },
        "& pre": {
          my: 1,
          p: 1,
          bgcolor: "action.hover",
          borderRadius: 1,
          overflowX: "auto",
        },
        "& pre code": { bgcolor: "transparent", p: 0 },

        /*
          `display: block` is what lets a table scroll: a `table` box sizes to
          its columns and ignores `overflow`, so at panel width it would widen
          the aside instead. As a block it is a scroller like any other.
        */
        "& table": {
          display: "block",
          overflowX: "auto",
          borderCollapse: "collapse",
          my: 1,
          width: "100%",
        },
        "& th, & td": {
          border: "1px solid",
          borderColor: "divider",
          px: 1,
          py: 0.5,
          textAlign: "start",
        },
        "& th": { color: "text.primary", fontWeight: 700 },

        "& hr": {
          my: 2,
          border: 0,
          borderTop: "1px solid",
          borderColor: "divider",
        },

        "& img": { maxWidth: "100%", height: "auto" },
      }}
    >
      <Notes />
    </Box>
  );
}

export default LibraryNotes;
