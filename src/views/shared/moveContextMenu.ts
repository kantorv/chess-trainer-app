import type { MouseEvent } from "react";

/**
 * The move list's right-click (CTA-64): what a token reports when the reader
 * opens its context menu. The menu itself is the consumer's —
 * `views/dev/core/MoveContextMenu.tsx` for the variations explorer.
 */

/** Where a move's context menu opens — viewport coordinates, MUI's `anchorPosition`. */
export type MenuAnchor = { top: number; left: number };

/** A token's right-click, reported with the move it names. */
export type ContextMenuNodeHandler = (id: string, anchor: MenuAnchor) => void;

/**
 * Where to open a menu for a `contextmenu` event. A keyboard's menu key (or
 * Shift+F10) reports the pointer at 0,0, so the menu opens on the token itself.
 * Any element — the repertoire map's moves are SVG (CTA-67).
 */
export const menuAnchorOf = (event: MouseEvent<Element>): MenuAnchor => {
  if (event.clientX !== 0 || event.clientY !== 0) {
    return { top: event.clientY, left: event.clientX };
  }
  const rect = event.currentTarget.getBoundingClientRect();
  return { top: rect.bottom, left: rect.left };
};
