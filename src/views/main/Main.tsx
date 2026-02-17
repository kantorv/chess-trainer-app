
import { useState } from 'react';
import Box from '@mui/material/Box';
//import SideMenu from './components/SideMenu'; // TODO: make AnonymousSideMenu and AuthenticatedSideMenu

import { BoardWidgetContext } from './service';

import {default as Board1 } from './Board1'

const Main = () => {

    
    return (
    <Box
        data-testid="board1-wrapper"
        sx={{
           
            
          

        }}
    >
       <Board1 />
    </Box>
    )
}

export default Main