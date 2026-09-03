import Box from "@mui/material/Box";

import { default as MatesList } from "./MatesList";

/**
 * Layout-only wrapper, as on every other screen — the shell already insets and
 * squares the area this fills (`Layout.tsx`, `BOARD_INSET_PX`).
 */
const Main = () => (
  <Box data-testid="mates-list-wrapper" sx={{ height: "100%" }}>
    <MatesList />
  </Box>
);

export default Main;
