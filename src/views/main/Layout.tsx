
import { useState, useRef , useEffect, useMemo} from 'react';
import Box from '@mui/material/Box';
//import SideMenu from './components/SideMenu'; // TODO: make AnonymousSideMenu and AuthenticatedSideMenu
import { Outlet, useLocation } from 'react-router';
import { default as SideBar } from './Sidebar'
import { BoardWidgetContext } from './service';

const DefaultLayout = () => {

    const svc = BoardWidgetContext.useActorRef()

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


  

    return (
        <Box
            data-testid="layout-root"
            component="div"
            sx={[
                (theme) => ({

                    display: "flex",
                    background: "gray",
                    height: "100vh",
                    width: "100vw",

                    //     height: `calc(100vh - ${theme.spacing(2)})`,
                    //     width: `calc(100vw - ${theme.spacing(2)})`,
                    //     p:theme.spacing(0.5),
                    //    m:theme.spacing(0.5),
                    //     background: "green",
                    // m: 1,
                    flexGrow: 0,

                    overflow: "hidden",
                    justifyContent: "center",

                })
            ]}

        >

            <Box
                 ref={ref}
                 data-testid="layout-wrapper"
                sx={[
                    (theme) => ({
                      //  p: theme.spacing(0.5),
                        //m:theme.spacing(0.5),
                        display: "flex",


                        background: "aliceblue",
                        // height: `calc(100% - ${theme.spacing(4)})`,
                        // width: `calc(100% - ${theme.spacing(4)})`,
                        //     background: "green",
                        // m: 1,
                        flexGrow: 1,

                        overflow: "hidden",


                    })
                ]}
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
                        
                        //  overflow: "auto",
                       // background:"blue",
                        flex: 9,
                        display: "flex",
                        flexDirection: "column"
                    }}
                >
                   <Box
                        sx={{
                            display: "flex",
                            flexGrow:1,
                        }}
                   >
                         <Box
                            data-testid="layout-board-square-body"
                            sx={{

                                width:`${boardDimentions.width}px`,
                                height: `${boardDimentions.height}px`
                                
                            }}
                        >
                            <Outlet />

                        </Box>

                         <Box
                            data-testid="layout-board-square-sidebar"
                            sx={{


                                 flexGrow:1,
                                  
                                background:"maroon"
                            }}
                        >
                           <p>Right sidebar</p>

                        </Box>



                   </Box>
                  

                </Box>


            </Box>

        </Box>
    )
}


export { DefaultLayout }