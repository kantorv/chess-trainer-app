import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';

/**
 * Project source repository. A plain constant rather than a catalog string:
 * the URL is the same in every language (only its label is translated).
 */
const REPO_URL = 'https://github.com/kantorv/chess-trainer-app';

/**
 * The app shell's footer: rendered once by `Layout`, below the sidebar + board
 * row, on every screen. It mirrors the `Header` treatment (translucent fill,
 * blur, a divider border — here on the block-start edge) and stays a dense,
 * non-scrolling strip. Direction-relative: it follows the active language like
 * the sidebar, so every inset is a logical property and it is *not* wrapped in
 * `ForceLTR` (that hatch is only for the board subtree).
 */
const Footer = () => {
    const { t } = useTranslation();

    return (
        <Box
            component="footer"
            data-testid="layout-footer"
            sx={{
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                minHeight: 36,
                paddingInline: 2,
                color: 'text.secondary',
                bgcolor: 'background.translucent',
                backdropFilter: 'blur(8px)',
                borderTop: '1px solid',
                borderColor: 'divider',
                fontSize: 13,
            }}
        >
            <Typography
                component="span"
                variant="caption"
                data-testid="layout-footer-version"
                sx={{ color: 'text.secondary' }}
            >
                {t('app.brandText')} v{__APP_VERSION__}
            </Typography>

            <Link
                href={REPO_URL}
                target="_blank"
                rel="noopener"
                variant="caption"
                data-testid="layout-footer-repo-link"
                sx={{ color: 'text.secondary', marginInlineStart: 'auto' }}
            >
                {t('footer.source')}
            </Link>
        </Box>
    );
};

export { Footer };
