
import { useState } from 'react';
import Box from '@mui/material/Box';
//import SideMenu from './components/SideMenu'; // TODO: make AnonymousSideMenu and AuthenticatedSideMenu

import { BoardWidgetContext } from './service';

import {default as Board2 } from './Board2'

const Main = () => {

    
    return (
    <Box
        data-testid="board2-wrapper"
        sx={{
           
            
          

        }}
    >
       <Board2 />
    </Box>
    )
}

export default Main