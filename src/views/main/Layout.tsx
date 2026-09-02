import { useState, useRef, useEffect, useMemo } from 'react';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { Link as RouterLink, Outlet, useMatches, type UIMatch } from 'react-router';
import { useTranslation } from 'react-i18next';
import { default as SideBar } from './Sidebar';
import { BoardWidgetContext } from './service';
import { ForceLTR } from '../../theme/ForceLTR';
import ColorModeIconDropdown from '../../theme/ColorModeIconDropdown';
import LanguageSwitch from '../../theme/LanguageSwitch';

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

const DefaultLayoutViewport = () => {

    const svc = BoardWidgetContext.useActorRef()
    const { t } = useTranslation();


    // MANUALLY FIXING BOARD VIEWPORT SIZE IN PIXELS
    const ref = useRef<HTMLDivElement>(null)
    const [bodyDimentions, setBodyDimentions] = useState<Rect>({ width: 0, height: 0 })
   // const [boardDimentions, setBoardDimentions] = useState<Rect>({ width: 0, height: 0 })


    useEffect(() => {
        if (!ref.current) return;
        const _bounds = ref.current.getBoundingClientRect()
        console.log("PrintViewWidget ref", _bounds)
        const { width, height } = _bounds
        if (width === 0 || height === 0) return;
        setBodyDimentions({ width, height })
    }, [ref]);


    const boardDimentions = useMemo(()=>{
        const { width, height } = bodyDimentions
        if (width === 0 || height === 0) return { width: 0, height: 0 };
        const minorSide =  Math.min(bodyDimentions.width,bodyDimentions.height)
        const output:Rect = {
            width:minorSide,
            height: minorSide
        }
        return output

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
                 ref={ref}
                 data-testid="layout-wrapper"
                sx={{
                    display: "flex",
                    bgcolor: "background.default",
                    flexGrow: 1,
                    // Without this the row refuses to shrink below its content
                    // and pushes the shell past the viewport instead of
                    // clipping — which would also make the measurement above
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
                        sx={{
                            display: "flex",
                            flexGrow:1,
                            minHeight: 0,
                        }}
                   >
                         <Box
                            data-testid="layout-board-square-body"
                            sx={{

                                width:`${boardDimentions.width}px`,
                                height: `${boardDimentions.height}px`

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
                           <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                               {t("panel.analysisTitle")}
                           </Typography>
                           <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>
                               {t("panel.analysisPlaceholder")}
                           </Typography>

                        </Box>



                   </Box>


                </Box>


            </Box>

        </Box>
    )
}



const DefaultLayout = ()=>
            <BoardWidgetContext.Provider>
                <DefaultLayoutViewport />
            </BoardWidgetContext.Provider>

export { DefaultLayout }
