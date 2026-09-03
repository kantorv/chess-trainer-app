import Box from "@mui/material/Box";

import { default as MateDetail } from "./MateDetail";

/**
 * Layout-only wrapper, as on every other screen — the shell already insets and
 * squares the area this fills (`Layout.tsx`, `BOARD_INSET_PX`).
 */
const Main = () => (
  <Box data-testid="mate-detail-wrapper" sx={{ height: "100%" }}>
    <MateDetail />
  </Box>
);

export default Main;
