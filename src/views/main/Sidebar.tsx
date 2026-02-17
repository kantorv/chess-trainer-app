import { useState } from 'react';
import Box from '@mui/material/Box';

const SideBar = ()=>{




    return (
        <Box
         sx={[
                (theme) => ({
                   p:theme.spacing(0.5),
                   //m:theme.spacing(0.5),
                     display: "flex",
                     flexDirection:"column",

                     
                 //   background: "wheat",
                    // height: `calc(100% - ${theme.spacing(4)})`,
                    // width: `calc(100% - ${theme.spacing(4)})`,
                    //     background: "green",
                    // m: 1,
                    flexGrow: 1,
                   


                    overflow: "auto",
                   
                   
                })
            ]}
        
        >
            <p>Left sidebar</p>
        </Box>
    )

}


export default SideBar