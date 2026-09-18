import Box from "@mui/material/Box";

import RepertoireSettingsScreen from "./RepertoireSettingsScreen";

/**
 * Layout-only wrapper, as on every other screen — the shell already insets and
 * squares the area this fills (`Layout.tsx`).
 */
const Main = () => (
  <Box data-testid="repertoire-settings-wrapper" sx={{ height: "100%" }}>
    <RepertoireSettingsScreen />
  </Box>
);

export default Main;
