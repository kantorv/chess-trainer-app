import { useState } from "react";
import Box from "@mui/material/Box";
import Collapse from "@mui/material/Collapse";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import ExpandLessRounded from "@mui/icons-material/ExpandLessRounded";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import { Link as RouterLink, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { asAppLanguage } from "../../i18n";
import {
  folderChain,
  folderPath,
  navLabel,
  navTree,
  type NavTreeNode,
} from "./navTree";

/** The shipped tree, built once — a stable identity for the default prop. */
const shippedTree = navTree();

/** Nesting step, in theme spacing units, plus the row's own base padding. */
const indentOf = (depth: number) => 2 + depth * 2;

type RowProps = {
  node: NavTreeNode;
  depth: number;
  /** Is this folder open? Only the one open chain is. */
  expanded: (id: string) => boolean;
  pathname: string;
  onToggle: (id: string) => void;
};

/** One row, plus — for a folder — its collapsible body, recursively. */
function TreeRow({ node, depth, expanded, pathname, onToggle }: RowProps) {
  const { t, i18n } = useTranslation();
  const Icon = node.icon;
  /*
    Chrome comes out of the catalogs; a folder generated from a library's data
    carries its own `{ en, he }` instead, because a category added to
    `src/data/positions.json` must not need a locale edit. `navLabel` is the one
    place that is decided — see `navTree.ts`.
  */
  const label = navLabel(node, (key) => t(key), asAppLanguage(i18n.language));
  /*
    A logical inset, so depth reads as "further from the start of the line" in
    both directions: under RTL the sidebar sits on the right and the tree has to
    indent leftwards, which `paddingLeft` would not do.
  */
  const paddingInlineStart = indentOf(depth);

  if (node.kind === "screen") {
    // Exact match rather than a prefix test: a `startsWith` check would light up
    // a screen on every route nested under its path (and "/" on all of them).
    const isActive = pathname === node.to;

    return (
      <ListItem disablePadding sx={{ mb: 0.5 }}>
        <ListItemButton
          component={RouterLink}
          to={node.to ?? ""}
          selected={isActive}
          aria-current={isActive ? "page" : undefined}
          sx={{ gap: 1, paddingInlineStart }}
        >
          <ListItemIcon
            sx={{
              minWidth: 0,
              color: isActive ? "primary.main" : "text.secondary",
            }}
          >
            <Icon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary={label}
            slotProps={{
              primary: {
                sx: {
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? "text.primary" : "text.secondary",
                },
              },
            }}
          />
        </ListItemButton>
      </ListItem>
    );
  }

  const open = expanded(node.id);

  return (
    <ListItem disablePadding sx={{ mb: 0.5, display: "block" }}>
      {/*
        A folder is a toggle, not a destination: it carries `aria-expanded` and
        deliberately stays out of the accessible link count, which belongs to
        the screens.
      */}
      <ListItemButton
        onClick={() => onToggle(node.id)}
        aria-expanded={open}
        sx={{ gap: 1, paddingInlineStart }}
      >
        <ListItemIcon sx={{ minWidth: 0, color: "text.secondary" }}>
          <Icon fontSize="small" />
        </ListItemIcon>
        <ListItemText
          primary={label}
          slotProps={{
            primary: { sx: { fontWeight: 700, color: "text.primary" } },
          }}
        />
        {open ? (
          <ExpandLessRounded fontSize="small" sx={{ color: "text.secondary" }} />
        ) : (
          <ExpandMoreRounded fontSize="small" sx={{ color: "text.secondary" }} />
        )}
      </ListItemButton>

      <Collapse in={open} unmountOnExit>
        <List component="div" disablePadding dense>
          {(node.children ?? []).map((child) => (
            <TreeRow
              key={`${child.kind}:${child.id}`}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              pathname={pathname}
              onToggle={onToggle}
            />
          ))}
        </List>
      </Collapse>
    </ListItem>
  );
}

/**
 * The navigation as a folder tree: folder rows that expand to their sub-folders
 * and screens, screen rows that link to their route and mark themselves the
 * current page. **One chain is open at a time** — the ancestors of the active
 * screen — so the tree stays as short as the reader's place in it, and opening
 * a folder under a different parent shuts the one that was open. Nothing is
 * persisted: the open chain follows the route, and is re-derived on every
 * mount. `tree` is injectable so tests can exercise deeper nesting than the
 * shipped tree.
 */
function SidebarLinks({ tree = shippedTree }: { tree?: NavTreeNode[] }) {
  const { pathname } = useLocation();
  const { t } = useTranslation();

  /*
    The single open chain, top down — the ancestors of one folder, never two
    branches at once. A chain rather than a set because a sub-folder cannot be
    open inside a shut parent, and a chain rather than a lone id because
    "collapse the others" has to spare the folders this one lives in.
  */
  const [openPath, setOpenPath] = useState<string[]>(() =>
    folderPath(pathname, tree),
  );
  const [seenPathname, setSeenPathname] = useState(pathname);

  /*
    Follow the route: the screen navigated to is what decides which chain is
    open, so arriving under a different parent shuts the previous one. Adjusted
    during render against the previous pathname — React's own answer to "reset
    state when a value changes", and unlike an effect it renders once rather
    than painting the old chain and then correcting it.

    A path that is no screen in the tree (the landing page, a mate's detail
    page) has no chain of its own and leaves the open one alone, rather than
    shutting the sidebar under a reader who is still inside that section.
  */
  if (seenPathname !== pathname) {
    setSeenPathname(pathname);
    const ancestors = folderPath(pathname, tree);
    if (ancestors.length > 0 && ancestors.join("\n") !== openPath.join("\n")) {
      setOpenPath(ancestors);
    }
  }

  const expanded = (id: string) => openPath.includes(id);

  /*
    Opening a folder opens the chain down to it and nothing else; clicking the
    open one shuts it and its descendants by truncating the chain above it.
  */
  const toggle = (id: string) =>
    setOpenPath((prev) =>
      prev.includes(id) ? prev.slice(0, prev.indexOf(id)) : folderChain(id, tree),
    );

  return (
    <List dense component="nav" aria-label={t("nav.ariaLabel")} sx={{ p: 0 }}>
      {tree.map((node) => (
        <TreeRow
          key={`${node.kind}:${node.id}`}
          node={node}
          depth={0}
          expanded={expanded}
          pathname={pathname}
          onToggle={toggle}
        />
      ))}
    </List>
  );
}

const SideBar = ({ tree }: { tree?: NavTreeNode[] }) => (
  <Box
    component="aside"
    data-testid="layout-sidebar"
    sx={{
      p: 1,
      display: "flex",
      flexDirection: "column",
      flexGrow: 1,
      overflow: "auto",
      bgcolor: "background.sunken",
      // A logical border, so it sits between the rail and the body in both
      // directions — under RTL the sidebar is on the right and this flips with
      // it, which `borderRight` would not.
      borderInlineEnd: "1px solid",
      borderColor: "divider",
    }}
  >
    <SidebarLinks tree={tree} />
  </Box>
);

export default SideBar;
