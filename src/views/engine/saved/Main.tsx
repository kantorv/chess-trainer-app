import Box from "@mui/material/Box";

import { default as SavedGames } from "./SavedGames";

/**
 * Layout-only wrapper, as on every other screen — the shell already insets and
 * squares the area this fills (`Layout.tsx`, `BOARD_INSET_PX`).
 */
const Main = () => (
  <Box data-testid="saved-games-wrapper" sx={{ height: "100%" }}>
    <SavedGames />
  </Box>
);

export default Main;
