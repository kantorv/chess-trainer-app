
import { useState } from 'react';
import Box from '@mui/material/Box';
//import SideMenu from './components/SideMenu'; // TODO: make AnonymousSideMenu and AuthenticatedSideMenu
import { Outlet, useLocation } from 'react-router';
import {default as SideBar} from './Sidebar'
import { BoardWidgetContext } from './service';

const DefaultLayout = () => {

    const svc = BoardWidgetContext.useActorRef()
    

    return (
        <Box
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
                sx={[
                    (theme) => ({
                        p: theme.spacing(0.5),
                        //m:theme.spacing(0.5),
                        display: "flex",


                        background: "aliceblue",
                        // height: `calc(100% - ${theme.spacing(4)})`,
                        // width: `calc(100% - ${theme.spacing(4)})`,
                        //     background: "green",
                        // m: 1,
                        flexGrow: 1,

                        overflow: "auto",


                    })
                ]}
            >
               <Box
                sx={{
                    
                    
                    flex: 3,
                    display: "flex",
                    flexDirection:"column"
                }}
               >
                    <SideBar />

               </Box>

            <Box
                sx={{
                    
                  
                    flex: 9,
                    display: "flex",
                    flexDirection:"column"
                }}
               >
                   <Outlet />

               </Box>
             

            </Box>

        </Box>
    )
}


export { DefaultLayout }