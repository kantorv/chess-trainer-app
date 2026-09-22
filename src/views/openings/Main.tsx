import Box from "@mui/material/Box";

import { default as OpeningsBoard } from "./OpeningsBoard";

/**
 * Layout-only wrapper, as on every other screen — the shell already insets and
 * squares the area this fills (`Layout.tsx`, `BOARD_INSET_PX`).
 */
const Main = () => (
  <Box data-testid="openings-wrapper" sx={{ height: "100%" }}>
    <OpeningsBoard />
  </Box>
);

export default Main;
