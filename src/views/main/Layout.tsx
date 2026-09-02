import { useState, useRef, useEffect, useMemo } from 'react';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { Link as RouterLink, Outlet, useMatches, type UIMatch } from 'react-router';
import { useTranslation } from 'react-i18next';
import { default as SideBar } from './Sidebar';
import { Footer } from './Footer';
import { BoardWidgetContext } from './service';
import { RightPanelOutlet, RightPanelProvider } from './rightPanel';
import { ForceLTR } from '../../theme/ForceLTR';
import ColorModeIconDropdown from '../../theme/ColorModeIconDropdown';
import LanguageSwitch from '../../theme/LanguageSwitch';

/**
 * Board inset in pixels — the MUI `p: 2` (2 × the 8px spacing unit) that used
 * to live only on `views/player/engine_basic/Main.tsx`, now applied once here
 * in the shell so all four board screens get the same breathing room. Kept as
 * a raw number, not `theme.spacing(2)`: `cssVariables` is on, so that returns a
 * `calc(var(--mui-spacing))` string the resize maths cannot subtract.
 */
const BOARD_INSET_PX = 16;

const Header = () => {
    const { t } = useTranslation();

    return (
        <AppBar
            position="static"
            elevation={0}
            data-testid="layout-header"
            sx={{
                flexShrink: 0,
                color: 'text.primary',
                bgcolor: 'background.translucent',
                backdropFilter: 'blur(8px)',
                borderBottom: '1px solid',
                borderColor: 'divider',
            }}
        >
            <Toolbar variant="dense" sx={{ gap: 2, minHeight: 56 }}>
                <Box
                    component={RouterLink}
                    to="/"
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.25,
                        color: 'text.primary',
                        textDecoration: 'none',
                        // Pushes everything after it to the far end of the bar,
                        // in whichever direction "far end" currently means.
                        marginInlineEnd: 'auto',
                    }}
                >
                    <Box
                        sx={{
                            display: 'grid',
                            placeItems: 'center',
                            width: 30,
                            height: 30,
                            borderRadius: '9px',
                            bgcolor: 'text.primary',
                            color: 'background.paper',
                            fontSize: 12,
                            fontWeight: 800,
                        }}
                    >
                        {t('app.brandMark')}
                    </Box>
                    <Typography
                        component="span"
                        sx={{ fontWeight: 800, letterSpacing: '-0.01em' }}
                    >
                        {t('app.brandText')}
                    </Typography>
                </Box>

                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <LanguageSwitch />
                    <ColorModeIconDropdown />
                </Stack>
            </Toolbar>
        </AppBar>
    );
};

/**
 * What the right-hand aside shows until a route puts something there — see
 * `rightPanel.tsx`. Unchanged from when the shell rendered these two lines
 * inline: a route that registers nothing must see exactly this.
 */
const AnalysisPlaceholder = () => {
    const { t } = useTranslation();

    return (
        <>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                {t("panel.analysisTitle")}
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>
                {t("panel.analysisPlaceholder")}
            </Typography>
        </>
    );
};

const DefaultLayoutViewport = () => {

    const svc = BoardWidgetContext.useActorRef()

    // The board area is sized in pixels because `react-chessboard` fills its
    // container and has no intrinsic size. `ref` sits on the padded board
    // viewport (the row that holds the square + the analysis aside), so the
    // measurement already excludes the header, the footer and the sidebar —
    // whatever is left is what the square has to fit inside.
    const ref = useRef<HTMLDivElement>(null)
    const [bodyDimentions, setBodyDimentions] = useState<Rect>({ width: 0, height: 0 })

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        const measure = () => {
            const { width, height } = el.getBoundingClientRect();
            if (width === 0 || height === 0) return;
            setBodyDimentions((prev) =>
                prev.width === width && prev.height === height
                    ? prev
                    : { width, height },
            );
        };

        measure();

        // Preferred: observe the measured element itself, so any layout change
        // that resizes it re-squares the board.
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        // Also listen for window resizes directly — cheap, and covers
        // environments whose layout engine does not drive the observer.
        window.addEventListener("resize", measure);

        return () => {
            observer.disconnect();
            window.removeEventListener("resize", measure);
        };
    }, []);


    const boardDimentions = useMemo<Rect>(()=>{
        const { width, height } = bodyDimentions
        if (width === 0 || height === 0) return { width: 0, height: 0 };
        // Strip the inset from both edges before squaring: the square plus its
        // surrounding inset then never exceeds the available body area, at any
        // window size.
        const minorSide = Math.max(0, Math.min(width, height) - BOARD_INSET_PX * 2)
        return {
            width: minorSide,
            height: minorSide,
        }

    },[bodyDimentions])




    const matches = useMatches();
    const [curPath, setCurPath] = useState<string>("");

    const updateLocationFn = (match:UIMatch)=>svc.send({
        type:"EVENTS.NAVIGATION.ROUTER.MATCH.UPDATE",
        match:match
    })


    useEffect(()=>{
        console.log("[TemplatesReadonlyWidgetLayout] matches update", matches);
        const last_match =  matches.pop()
        if(undefined === last_match) return
        if (curPath === last_match.pathname) return
        setCurPath(last_match.pathname)

        console.log("[TemplatesReadonlyWidgetLayout][updateLocationFn] called", last_match);
        updateLocationFn(last_match)
    },[matches])





    return (
        <Box
            data-testid="layout-root"
            component="div"
            sx={{
                display: "flex",
                flexDirection: "column",
                bgcolor: "background.default",
                color: "text.primary",
                height: "100vh",
                width: "100vw",
                flexGrow: 0,
                overflow: "hidden",
            }}
        >
            <Header />

            <Box
                 data-testid="layout-wrapper"
                sx={{
                    display: "flex",
                    bgcolor: "background.default",
                    flexGrow: 1,
                    // Without this the row refuses to shrink below its content
                    // and pushes the shell past the viewport instead of
                    // clipping — which would also make the measurement below
                    // read a taller box than the one actually on screen.
                    minHeight: 0,
                    overflow: "hidden",
                }}
            >
                <Box
                    data-testid="layout-sidebar-container"
                    sx={{

                        flex: 3,
                        display: "flex",
                        flexDirection: "column"
                    }}
                >
                    <SideBar />

                </Box>

                <Box
                   data-testid="layout-body-container"
                    sx={{
                        flex: 9,
                        display: "flex",
                        flexDirection: "column"
                    }}
                >
                   <Box
                        ref={ref}
                        data-testid="layout-board-viewport"
                        sx={{
                            display: "flex",
                            flexGrow:1,
                            minHeight: 0,
                            // The shell-level board inset (was `p: 2` on one
                            // Main wrapper only). Measured together with the box
                            // in `getBoundingClientRect`, then subtracted back
                            // out when the square is computed.
                            p: `${BOARD_INSET_PX}px`,
                            overflow: "hidden",
                        }}
                   >
                        <Box
                            sx={{
                                flexShrink: 0,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                            }}
                        >
                             <Box
                                data-testid="layout-board-square-body"
                                // A plain inline style, not `sx`: this is a
                                // per-pixel value with no theme token in it, and
                                // it changes on every resize — no reason to mint
                                // a fresh emotion class each time.
                                style={{
                                    width: `${boardDimentions.width}px`,
                                    height: `${boardDimentions.height}px`,
                                }}
                            >
                                {/*
                                    The board must never mirror: files run a-h left
                                    to right in every language, and flipping them
                                    would put a1 bottom-right while chess.js and the
                                    engine still report a1 as bottom-left. ForceLTR
                                    pins this subtree to the unflipped emotion cache
                                    and an LTR theme. It fills the square rather than
                                    wrapping it, so the container-sizing contract in
                                    .claude/rules/chessboard.md still holds.
                                */}
                                <ForceLTR sx={{ width: "100%", height: "100%" }}>
                                    <Outlet />
                                </ForceLTR>

                            </Box>
                        </Box>

                         <Box
                            component="aside"
                            data-testid="layout-board-square-sidebar"
                            sx={{
                                flexGrow: 1,
                                minWidth: 0,
                                overflow: "auto",
                                p: 2,
                                bgcolor: "background.paper",
                                borderInlineStart: "1px solid",
                                borderColor: "divider",
                            }}
                        >
                            {/*
                                The per-route panel slot. A route renders
                                `<RightPanel>` (see `rightPanel.tsx`) to fill
                                this aside with its own content; with none
                                registered — all four board screens today — the
                                outlet renders the Analysis placeholder and the
                                aside is exactly what it always was. The aside
                                itself stays outside ForceLTR and mirrors under
                                Hebrew, panel content included.
                            */}
                            <RightPanelOutlet fallback={<AnalysisPlaceholder />} />

                        </Box>



                   </Box>


                </Box>


            </Box>

            <Footer />

        </Box>
    )
}



const DefaultLayout = ()=>
            <BoardWidgetContext.Provider>
                {/*
                    Above the viewport, so the aside's outlet and every route
                    behind the `<Outlet />` share one slot.
                */}
                <RightPanelProvider>
                    <DefaultLayoutViewport />
                </RightPanelProvider>
            </BoardWidgetContext.Provider>

export { DefaultLayout }
