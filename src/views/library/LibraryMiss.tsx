import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { Link as RouterLink } from "react-router";
import { useTranslation } from "react-i18next";

/**
 * A Library path that names nothing — a collection that is not there (a
 * deleted upload, an old link), or a game number past its end. Says which,
 * and links back to the Library.
 */
function LibraryMiss({ what }: { what: "collection" | "game" }) {
  const { t } = useTranslation();
  return (
    <Box data-testid="library-not-found" sx={{ p: 2, display: "grid", gap: 2, justifyItems: "start" }}>
      <Typography>{t(`library.notFound.${what}`)}</Typography>
      <Button variant="outlined" component={RouterLink} to="/library">
        {t("library.notFound.back")}
      </Button>
    </Box>
  );
}

export default LibraryMiss;
