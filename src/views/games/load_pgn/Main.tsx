import Box from "@mui/material/Box";

import { default as LoadPgn } from "./LoadPgn";

/**
 * Layout-only wrapper, as on every other screen — the shell already insets and
 * squares the area this fills (`Layout.tsx`, `BOARD_INSET_PX`).
 */
const Main = () => (
  <Box data-testid="load-pgn-wrapper" sx={{ height: "100%" }}>
    <LoadPgn />
  </Box>
);

export default Main;
