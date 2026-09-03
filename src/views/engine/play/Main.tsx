import Box from "@mui/material/Box";

import { default as PlayWithEngine } from "./PlayWithEngine";

/**
 * Layout-only wrapper, as on every other screen — the shell already insets and
 * squares the area this fills (`Layout.tsx`, `BOARD_INSET_PX`).
 */
const Main = () => (
  <Box data-testid="play-with-engine-wrapper" sx={{ height: "100%" }}>
    <PlayWithEngine />
  </Box>
);

export default Main;
