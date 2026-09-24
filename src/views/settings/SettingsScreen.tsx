import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import { Link as RouterLink, Navigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";

import ExportTab from "./ExportTab";
import ImportTab from "./ImportTab";
import StorageTab from "./StorageTab";

/**
 * **Settings** (`/settings/<tab>`, CTA-86) — the app's own settings, one tab
 * per concern. A tab is a route segment, so each is linkable and has its own
 * nav entry; **adding one** is an entry in {@link SETTINGS_TABS}, a
 * `navItems()` entry in the Settings folder, and its `settings.tabs.<id>` key
 * in both catalogs. An unknown tab lands on the first.
 */
const SETTINGS_TABS: readonly { id: string; content: () => ReactNode }[] = [
  { id: "export", content: () => <ExportTab /> },
  { id: "import", content: () => <ImportTab /> },
  { id: "storage", content: () => <StorageTab /> },
];

function SettingsScreen() {
  const { t } = useTranslation();
  const { tab } = useParams();
  const active = SETTINGS_TABS.find((candidate) => candidate.id === tab);
  if (active === undefined) return <Navigate to={`/settings/${SETTINGS_TABS[0].id}`} replace />;

  return (
    <Box
      data-testid="settings-screen"
      sx={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column", gap: 1 }}
    >
      <Typography variant="subtitle1" component="h1" sx={{ fontWeight: 700, flexShrink: 0 }}>
        {t("settings.title")}
      </Typography>
      <Tabs
        value={active.id}
        sx={{
          flexShrink: 0,
          minHeight: 36,
          borderBottom: "1px solid",
          borderColor: "divider",
          "& .MuiTab-root": { minHeight: 36, textTransform: "none" },
        }}
      >
        {SETTINGS_TABS.map(({ id }) => (
          <Tab
            key={id}
            value={id}
            label={t(`settings.tabs.${id}`)}
            component={RouterLink}
            to={`/settings/${id}`}
            data-testid={`settings-tab-${id}`}
          />
        ))}
      </Tabs>
      <Box
        role="tabpanel"
        data-testid={`settings-tab-content-${active.id}`}
        sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}
      >
        {active.content()}
      </Box>
    </Box>
  );
}

export default SettingsScreen;
