import Box from "@mui/material/Box";

import { default as LibraryUpload } from "./LibraryUpload";

/**
 * Layout-only wrapper, as on every other screen — the shell already insets and
 * squares the area this fills (`Layout.tsx`, `BOARD_INSET_PX`).
 */
const Main = () => (
  <Box data-testid="library-upload-wrapper" sx={{ height: "100%" }}>
    <LibraryUpload />
  </Box>
);

export default Main;
