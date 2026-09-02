import Box from "@mui/material/Box";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import { Link as RouterLink, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { navItems } from "./navItems";

function SidebarLinks() {
  const { pathname } = useLocation();
  const { t } = useTranslation();

  return (
    <List dense component="nav" aria-label={t("nav.ariaLabel")} sx={{ p: 0 }}>
      {navItems.map(({ to, labelKey, icon: Icon }) => {
        // Exact match rather than a prefix test: "/" is a prefix of every other
        // route, so `startsWith` would light up the basic board everywhere.
        const isActive = pathname === to;

        return (
          <ListItem key={to} disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton
              component={RouterLink}
              to={to}
              selected={isActive}
              aria-current={isActive ? "page" : undefined}
              sx={{ gap: 1 }}
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
                primary={t(labelKey)}
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
      })}
    </List>
  );
}

const SideBar = () => (
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
    <SidebarLinks />
  </Box>
);

export default SideBar;
