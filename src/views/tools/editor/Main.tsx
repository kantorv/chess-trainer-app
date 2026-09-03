import Box from "@mui/material/Box";

import { default as BoardEditor } from "./BoardEditor";

/**
 * Layout-only wrapper, as on every other screen — the shell already insets and
 * squares the area this fills (`Layout.tsx`, `BOARD_INSET_PX`).
 */
const Main = () => (
  <Box data-testid="board-editor-wrapper" sx={{ height: "100%" }}>
    <BoardEditor />
  </Box>
);

export default Main;
