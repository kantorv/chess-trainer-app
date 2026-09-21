import Box from "@mui/material/Box";

import AnalysisSettingsScreen from "./AnalysisSettingsScreen";

/**
 * Layout-only wrapper, as on every other screen — the shell already insets and
 * squares the area this fills (`Layout.tsx`).
 */
const Main = () => (
  <Box data-testid="analysis-settings-wrapper" sx={{ height: "100%" }}>
    <AnalysisSettingsScreen />
  </Box>
);

export default Main;
