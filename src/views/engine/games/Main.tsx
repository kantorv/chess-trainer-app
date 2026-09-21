import Box from "@mui/material/Box";

import { default as PlayedGames } from "./PlayedGames";

/**
 * Layout-only wrapper, as on every other screen — the shell already insets and
 * squares the area this fills (`Layout.tsx`, `BOARD_INSET_PX`).
 */
const Main = () => (
  <Box data-testid="played-games-wrapper" sx={{ height: "100%" }}>
    <PlayedGames />
  </Box>
);

export default Main;
