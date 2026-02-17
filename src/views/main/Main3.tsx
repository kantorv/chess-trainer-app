
import { useState } from 'react';
import Box from '@mui/material/Box';
//import SideMenu from './components/SideMenu'; // TODO: make AnonymousSideMenu and AuthenticatedSideMenu

import { BoardWidgetContext } from './service';

import {default as Board3 } from './Board3'

const Main = () => {

    
    return (
    <Box
        data-testid="board3-wrapper"
        sx={{
           
            
          

        }}
    >
       <Board3 />
    </Box>
    )
}

export default Main