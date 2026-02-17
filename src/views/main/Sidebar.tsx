import { useState } from 'react';
import Box from '@mui/material/Box';



import * as React from 'react';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import ListItemAvatar from '@mui/material/ListItemAvatar';
import Checkbox from '@mui/material/Checkbox';
import Avatar from '@mui/material/Avatar';
import IconButton from '@mui/material/IconButton';
import DevicesRoundedIcon from '@mui/icons-material/DevicesRounded';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';

import { useNavigate } from 'react-router';


function SidebarLinks() {
    const [checked, setChecked] = React.useState([1]);

    const handleToggle = (value: number) => () => {
        const currentIndex = checked.indexOf(value);
        const newChecked = [...checked];

        if (currentIndex === -1) {
            newChecked.push(value);
        } else {
            newChecked.splice(currentIndex, 1);
        }

        setChecked(newChecked);
    };


    const navigate = useNavigate()

    return (
        <List dense sx={{ width: '100%', bgcolor: 'background.paper', }}>

            <ListItem
                sx={{
                    bgcolor: 'gray',
                    mb: 1,

                }}
                secondaryAction={
                    <IconButton
                        onClick={() => navigate("/")}

                    ><ArrowForwardIosIcon />
                    </IconButton>
                }
                disablePadding
            >
                <ListItemButton

                >
                    <Avatar alt="Board1"
                        sx={{
                            mr: 1,
                        }}>
                        <DevicesRoundedIcon sx={{ fontSize: '1rem' }} />
                    </Avatar>
                    <ListItemText id={`Board1`} primary={`Board1`} />
                </ListItemButton>
            </ListItem>


            <ListItem
                sx={{

                 //   bgcolor: 'red',
                   bgcolor: 'gray',

                }}
                secondaryAction={
                    <IconButton
                        onClick={() => navigate("/board2")}

                    ><ArrowForwardIosIcon />
                    </IconButton>
                }
                disablePadding
            >
                <ListItemButton>
                    <Avatar alt="Board2"  
                        sx={{
                            mr: 1,
                        }}
                    >
                        <DevicesRoundedIcon sx={{ fontSize: '1rem' }} />
                    </Avatar>
                    <ListItemText id={`Board2`} primary={`Board2`} />
                </ListItemButton>
            </ListItem>



            <ListItem
                sx={{

                 //   bgcolor: 'red',
                   bgcolor: 'gray',

                }}
                secondaryAction={
                    <IconButton
                        onClick={() => navigate("/anal1")}

                    ><ArrowForwardIosIcon />
                    </IconButton>
                }
                disablePadding
            >
                <ListItemButton>
                    <Avatar alt="Analisys"  
                        sx={{
                            mr: 1,
                        }}
                    >
                        <DevicesRoundedIcon sx={{ fontSize: '1rem' }} />
                    </Avatar>
                    <ListItemText id={`Board3`} primary={`Analysis `} />
                </ListItemButton>
            </ListItem>


        </List>
    );
}


const SideBar = () => {




    return (
        <Box
            sx={[
                (theme) => ({
                    p: theme.spacing(0.5),
                    //m:theme.spacing(0.5),
                    display: "flex",
                    flexDirection: "column",


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
            <SidebarLinks />
        </Box>
    )

}


export default SideBar