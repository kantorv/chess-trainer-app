import Box from "@mui/material/Box";

import Repertoires from "./Repertoires";

/**
 * Layout-only wrapper, as on every other screen — the shell already insets and
 * squares the area this fills (`Layout.tsx`).
 */
const Main = () => (
  <Box data-testid="repertoires-wrapper" sx={{ height: "100%" }}>
    <Repertoires />
  </Box>
);

export default Main;
