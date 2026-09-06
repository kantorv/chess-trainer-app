import Box from "@mui/material/Box";

import { default as UserPgnsSection } from "./UserPgnsSection";

/**
 * Layout-only wrapper, as on every other screen — the shell already insets and
 * squares the area this fills (`Layout.tsx`, `BOARD_INSET_PX`).
 */
const Main = () => (
  <Box data-testid="user-pgns-wrapper" sx={{ height: "100%" }}>
    <UserPgnsSection />
  </Box>
);

export default Main;
