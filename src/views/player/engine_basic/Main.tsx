
import { useState } from 'react';
import Box from '@mui/material/Box';
//import SideMenu from './components/SideMenu'; // TODO: make AnonymousSideMenu and AuthenticatedSideMenu
 

import {default as Board } from './Board'

const Main = () => {

    
    return (
    <Box
        data-testid="player-engine-wrapper"
        sx={{
           
            p:2
          

        }}
    >
       <Board />
    </Box>
    )
}

export default Main