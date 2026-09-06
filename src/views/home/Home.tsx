import { Link as RouterLink } from "react-router";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Typography from "@mui/material/Typography";

import { asAppLanguage } from "../../i18n";
import { navLabel, navTree, type NavTreeNode } from "../main/navTree";

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
  const { t, i18n } = useTranslation();
  const language = asAppLanguage(i18n.language);
  /*
    A card's name is a catalog key for an authored screen and the data's own
    `{ en, he }` for one generated from a library catalog — the same two kinds
    the sidebar renders, resolved the same way. See `navTree.ts`.
  */
  const labelOf = (node: NavTreeNode) => navLabel(node, (key) => t(key), language);

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
            {labelOf(folder)}
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
                      {labelOf(entry)}
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
