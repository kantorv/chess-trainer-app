import Box from "@mui/material/Box";

import RepertoireUpload from "./RepertoireUpload";

/**
 * Layout-only wrapper, as on every other screen — the shell already insets and
 * squares the area this fills (`Layout.tsx`).
 */
const Main = () => (
  <Box data-testid="repertoire-upload-wrapper" sx={{ height: "100%" }}>
    <RepertoireUpload />
  </Box>
);

export default Main;
