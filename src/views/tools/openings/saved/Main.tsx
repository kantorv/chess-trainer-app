import Box from "@mui/material/Box";

import { default as SavedOpenings } from "./SavedOpenings";

/**
 * Layout-only wrapper, as on every other screen — the shell already insets and
 * squares the area this fills (`Layout.tsx`, `BOARD_INSET_PX`).
 */
const Main = () => (
  <Box data-testid="saved-openings-wrapper" sx={{ height: "100%" }}>
    <SavedOpenings />
  </Box>
);

export default Main;