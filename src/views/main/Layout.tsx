
import { useState } from 'react';
import Box from '@mui/material/Box';
//import SideMenu from './components/SideMenu'; // TODO: make AnonymousSideMenu and AuthenticatedSideMenu
import { Outlet, useLocation } from 'react-router';


const DefaultLayout = () => {


    return (
    <Box>
        <Outlet />
    </Box>
    )
}


export { DefaultLayout }