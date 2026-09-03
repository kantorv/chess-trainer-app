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
import { folderPath, navTree, type NavTreeNode } from "./navTree";

/** The shipped tree, built once — a stable identity for the default prop. */
const shippedTree = navTree();

/** Nesting step, in theme spacing units, plus the row's own base padding. */
const indentOf = (depth: number) => 2 + depth * 2;

type RowProps = {
  node: NavTreeNode;
  depth: number;
  /** Is this folder open? Absent from the reader's collapsed set means yes. */
  expanded: (id: string) => boolean;
  pathname: string;
  onToggle: (id: string) => void;
};

/** One row, plus — for a folder — its collapsible body, recursively. */
function TreeRow({ node, depth, expanded, pathname, onToggle }: RowProps) {
  const { t } = useTranslation();
  const Icon = node.icon;
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
            primary={t(node.labelKey)}
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
          primary={t(node.labelKey)}
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
 * current page. Every folder starts open, so the screens are all visible on
 * first paint; collapsing one lasts for the session only and is deliberately
 * not persisted. Navigating re-opens the ancestor chain of the active screen,
 * so it can never sit hidden inside a folder the reader shut. `tree` is
 * injectable so tests can exercise deeper nesting than the shipped tree.
 */
function SidebarLinks({ tree = shippedTree }: { tree?: NavTreeNode[] }) {
  const { pathname } = useLocation();
  const { t } = useTranslation();

  /*
    What the reader has shut, rather than what is open: absent means open, so
    every folder starts expanded without seeding a map, whatever tree it is
    handed. Nothing is persisted — collapsing lasts for the session only.
  */
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [seenPathname, setSeenPathname] = useState(pathname);

  /*
    Re-open the ancestor chain of the screen just navigated to, so the active
    screen is never hidden inside a folder the reader shut. Adjusted during
    render against the previous pathname — React's own answer to "reset state
    when a value changes", and unlike an effect it renders once rather than
    painting the collapsed tree and then correcting it.
  */
  if (seenPathname !== pathname) {
    setSeenPathname(pathname);
    const ancestors = folderPath(pathname, tree);
    if (ancestors.some((id) => collapsed[id])) {
      setCollapsed(
        Object.fromEntries(
          Object.entries(collapsed).filter(([id]) => !ancestors.includes(id)),
        ),
      );
    }
  }

  const expanded = (id: string) => !collapsed[id];

  const toggle = (id: string) =>
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));

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
