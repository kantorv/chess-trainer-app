import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TableSortLabel from "@mui/material/TableSortLabel";
import { useTheme } from "@mui/material/styles";
import FolderRoundedIcon from "@mui/icons-material/FolderRounded";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import KeyboardArrowRightRoundedIcon from "@mui/icons-material/KeyboardArrowRightRounded";
import { Link as RouterLink } from "react-router";

import type { FolderTreeRow } from "../../../lib/folderTreeRows";
import type { GameFolder } from "../../../lib/savedGameFolders";

/** One column after the Name column. */
export type FolderTreeColumn<T> = {
  id: string;
  label: string;
  /** Whether a click on its header sorts by it. */
  sortable?: boolean;
  align?: "left" | "right";
  width?: number;
  render: (row: FolderTreeRow<T>) => ReactNode;
};

/** How deep each level indents, in theme spacing units. */
const INDENT = 2.5;

/**
 * **A folder tree as a file manager's details view** (CTA-88) — a table of
 * folders and items under a sticky header, a row per {@link FolderTreeRow}
 * (`lib/folderTreeRows.ts` builds them), indented by depth. Presentational:
 * what the rows are, how they sort and what their actions do are the
 * caller's.
 *
 * - **The Name column** carries the chevron (folders), the folder or item
 *   icon and the name, which takes `dir="auto"`. An item's name is a **real
 *   link** (`hrefOf`) for the keyboard and a middle click; the rest of its row
 *   opens it too. A click anywhere on a folder's row, or on its chevron (a
 *   button, `aria-expanded`), opens or closes it.
 * - **The actions column** is the caller's (`actionsOf`), shown on hover and
 *   on keyboard focus — always on a device that cannot hover. A click there
 *   never reaches the row.
 * - **It mirrors under RTL**: the indent is `paddingInlineStart`, and a
 *   closed folder's chevron points the way the text runs (set as an inline
 *   style, which the RTL stylis plugin does not rewrite).
 * - The table is its container's **one scrolling region** — the caller gives
 *   it a box of definite height (`flex: 1; minHeight: 0`).
 */
function FolderTreeTable<T>({
  testId,
  rows,
  nameLabel,
  columns,
  actionsLabel,
  sort,
  direction,
  onSort,
  folderName,
  itemName,
  hrefOf,
  onOpenItem,
  onToggle,
  toggleLabel,
  actionsOf,
  rowTestId,
  linkTestId,
  folderIcon,
  itemIcon,
}: {
  /** The table's test id, and the root of its headers' (`<testId>-sort-<column>`). */
  testId: string;
  rows: readonly FolderTreeRow<T>[];
  nameLabel: string;
  columns: readonly FolderTreeColumn<T>[];
  /** The actions column's header, read by assistive technology only. */
  actionsLabel: string;
  /** The column sorted by — `name` or one of `columns`. */
  sort: string;
  direction: "asc" | "desc";
  onSort: (column: string) => void;
  folderName: (folder: GameFolder) => string;
  itemName: (item: T) => string;
  hrefOf: (item: T) => string;
  onOpenItem: (item: T) => void;
  onToggle: (folderId: string) => void;
  toggleLabel: (folder: GameFolder, open: boolean) => string;
  actionsOf: (row: FolderTreeRow<T>) => ReactNode;
  rowTestId: (row: FolderTreeRow<T>) => string;
  linkTestId: (item: T) => string;
  folderIcon?: (folder: GameFolder) => ReactNode;
  itemIcon?: (item: T) => ReactNode;
}) {
  const theme = useTheme();
  const rtl = theme.direction === "rtl";

  const header = (id: string, label: string, sortable: boolean) =>
    sortable ? (
      <TableSortLabel
        active={sort === id}
        direction={sort === id ? direction : "asc"}
        onClick={() => onSort(id)}
        data-testid={`${testId}-sort-${id}`}
      >
        {label}
      </TableSortLabel>
    ) : (
      label
    );

  return (
    <TableContainer sx={{ flex: 1, minHeight: 0 }}>
      <Table size="small" stickyHeader data-testid={testId}>
        <TableHead>
          <TableRow>
            <TableCell sortDirection={sort === "name" ? direction : false} sx={{ fontWeight: 600 }}>
              {header("name", nameLabel, true)}
            </TableCell>
            {columns.map((column) => (
              <TableCell
                key={column.id}
                align={column.align}
                sortDirection={sort === column.id ? direction : false}
                sx={{ fontWeight: 600, whiteSpace: "nowrap", width: column.width }}
              >
                {header(column.id, column.label, column.sortable === true)}
              </TableCell>
            ))}
            <TableCell sx={{ width: 1 }}>
              <Box component="span" sx={visuallyHidden}>
                {actionsLabel}
              </Box>
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => {
            const folder = row.kind === "folder" ? row.folder : undefined;
            const key = row.kind === "folder" ? `folder-${row.folder.id}` : `item-${rowTestId(row)}`;
            return (
              <TableRow
                key={key}
                hover
                data-testid={rowTestId(row)}
                onClick={() => (row.kind === "folder" ? onToggle(row.folder.id) : onOpenItem(row.item))}
                sx={{
                  cursor: "pointer",
                  "& .folder-tree-actions": { opacity: 0, transition: "opacity 120ms" },
                  "&:hover .folder-tree-actions, &:focus-within .folder-tree-actions": { opacity: 1 },
                  "@media (hover: none)": { "& .folder-tree-actions": { opacity: 1 } },
                }}
              >
                <TableCell sx={{ py: 0.25, paddingInlineStart: 1 + row.depth * INDENT }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 0 }}>
                    {folder !== undefined && row.kind === "folder" ? (
                      <IconButton
                        size="small"
                        aria-expanded={row.open}
                        aria-label={toggleLabel(folder, row.open)}
                        data-testid={`${rowTestId(row)}-toggle`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onToggle(folder.id);
                        }}
                        sx={{ p: 0.25 }}
                      >
                        <KeyboardArrowRightRoundedIcon
                          fontSize="small"
                          style={{
                            transform: row.open ? "rotate(90deg)" : rtl ? "scaleX(-1)" : "none",
                            transition: "transform 120ms",
                          }}
                        />
                      </IconButton>
                    ) : (
                      // An item lines up with its sibling folders' icons.
                      <Box sx={{ width: 26, flexShrink: 0 }} />
                    )}
                    <Box sx={{ display: "flex", flexShrink: 0, color: "text.secondary" }}>
                      {folder !== undefined
                        ? (folderIcon?.(folder) ?? <FolderRoundedIcon fontSize="small" />)
                        : row.kind === "item" &&
                          (itemIcon?.(row.item) ?? <InsertDriveFileOutlinedIcon fontSize="small" />)}
                    </Box>
                    {row.kind === "folder" ? (
                      <Box component="span" dir="auto" sx={nameSx}>
                        {folderName(row.folder)}
                      </Box>
                    ) : (
                      <Box
                        component={RouterLink}
                        to={hrefOf(row.item)}
                        dir="auto"
                        data-testid={linkTestId(row.item)}
                        onClick={(event: React.MouseEvent) => event.stopPropagation()}
                        sx={{ ...nameSx, color: "inherit", textDecoration: "none", "&:hover": { textDecoration: "underline" } }}
                      >
                        {itemName(row.item)}
                      </Box>
                    )}
                  </Box>
                </TableCell>
                {columns.map((column) => (
                  <TableCell
                    key={column.id}
                    align={column.align}
                    sx={{ py: 0.25, whiteSpace: "nowrap", color: "text.secondary" }}
                  >
                    {column.render(row)}
                  </TableCell>
                ))}
                <TableCell sx={{ py: 0.25, whiteSpace: "nowrap" }} onClick={(event) => event.stopPropagation()}>
                  <Box className="folder-tree-actions" sx={{ display: "flex", justifyContent: "flex-end", gap: 0.25 }}>
                    {actionsOf(row)}
                  </Box>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

const nameSx = {
  fontWeight: 500,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

const visuallyHidden = {
  border: 0,
  clip: "rect(0 0 0 0)",
  height: 1,
  margin: -1,
  overflow: "hidden",
  padding: 0,
  position: "absolute",
  whiteSpace: "nowrap",
  width: 1,
} as const;

export default FolderTreeTable;
