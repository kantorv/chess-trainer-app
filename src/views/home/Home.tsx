import { Link as RouterLink } from "react-router";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Typography from "@mui/material/Typography";

import { navTree, type NavTreeNode } from "../main/navTree";

/**
 * The index screen. There is no board here — with the demo screens gone, `"/"`
 * is a plain landing page whose only job is to point at the real screens.
 *
 * It is built from `navTree()`, the same registry the sidebar renders, so a
 * screen or folder added to `navItems` / `navFolders` shows up here for free and
 * nothing lists the routes twice.
 */
const screensOf = (node: NavTreeNode): NavTreeNode[] =>
  (node.children ?? []).flatMap((child) =>
    child.kind === "screen" ? [child] : screensOf(child),
  );

const Home = () => {
  const { t } = useTranslation();

  return (
    <Box sx={{ height: "100%", overflowY: "auto", p: 1 }}>
      <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
        {t("home.title")}
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5, mb: 3 }}>
        {t("home.subtitle")}
      </Typography>

      {navTree().map((folder) => (
        <Box key={folder.id} component="section" sx={{ mb: 3 }}>
          <Typography
            variant="overline"
            color="text.secondary"
            sx={{ display: "block", mb: 1 }}
          >
            {t(folder.labelKey)}
          </Typography>

          <Box
            sx={{
              display: "grid",
              gap: 1.5,
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            }}
          >
            {screensOf(folder).map((entry) => {
              const Icon = entry.icon;
              return (
                <Card key={entry.to} variant="outlined">
                  <CardActionArea
                    component={RouterLink}
                    to={entry.to as string}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1.5,
                      p: 1.5,
                    }}
                  >
                    <Icon color="primary" />
                    <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>
                      {t(entry.labelKey)}
                    </Typography>
                  </CardActionArea>
                </Card>
              );
            })}
          </Box>
        </Box>
      ))}
    </Box>
  );
};

export default Home;
