import Box from "@mui/material/Box";

import { default as LibraryGameScreen } from "./LibraryGameScreen";

/**
 * Layout-only wrapper, as on every other screen — the shell already insets and
 * squares the area this fills (`Layout.tsx`, `BOARD_INSET_PX`).
 */
const Main = () => (
  <Box data-testid="library-game-wrapper" sx={{ height: "100%" }}>
    <LibraryGameScreen />
  </Box>
);

export default Main;
