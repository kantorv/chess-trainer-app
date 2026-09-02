
import { useState } from 'react';
import Box from '@mui/material/Box';
//import SideMenu from './components/SideMenu'; // TODO: make AnonymousSideMenu and AuthenticatedSideMenu
 

import {default as Board } from './Board'

const Main = () => {

    
    return (
    <Box
        data-testid="player-engine-wrapper"
        sx={{
            // The board inset now lives once in the app shell (Layout.tsx,
            // BOARD_INSET_PX) so all four board screens share it.
        }}
    >
       <Board />
    </Box>
    )
}

export default Main