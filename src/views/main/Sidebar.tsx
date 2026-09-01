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
                     //   onClick={() => navigate("/")}

                    ><ArrowForwardIosIcon />
                    </IconButton>
                }
                disablePadding
            >
                <ListItemButton
                     onClick={() => navigate("/")}
                >
                    <Avatar alt="Basic"
                        sx={{
                            mr: 1,
                        }}>
                        <DevicesRoundedIcon sx={{ fontSize: '1rem' }} />
                    </Avatar>
                    <ListItemText id={`Basic1`} primary={`Basic Board`} />
                </ListItemButton>
            </ListItem>


            <ListItem
                sx={{

                 //   bgcolor: 'red',
                   bgcolor: 'gray',

                }}
                secondaryAction={
                    <IconButton
                       // onClick={() => navigate("/move")}

                    ><ArrowForwardIosIcon />
                    </IconButton>
                }
                disablePadding
            >
                <ListItemButton  onClick={() => navigate("/move")}>
                    <Avatar alt="Moving"  
                        sx={{
                            mr: 1,
                        }}
                    >
                        <DevicesRoundedIcon sx={{ fontSize: '1rem' }} />
                    </Avatar>
                    <ListItemText id={`Moving`} primary={`Moving example`} />
                </ListItemButton>
            </ListItem>



            <ListItem
                sx={{

                 //   bgcolor: 'red',
                   bgcolor: 'gray',

                }}
                secondaryAction={
                    <IconButton
                    //    onClick={() => navigate("/analyze")}

                    ><ArrowForwardIosIcon />
                    </IconButton>
                }
                disablePadding
            >
                <ListItemButton  onClick={() => navigate("/analyze")}>
                    <Avatar alt="Analisys"  
                        sx={{
                            mr: 1,
                        }}
                    >
                        <DevicesRoundedIcon sx={{ fontSize: '1rem' }} />
                    </Avatar>
                    <ListItemText id={`Board3`} primary={`Engine evaluation demo`} />
                </ListItemButton>
            </ListItem>




            <ListItem
                sx={{

                 //   bgcolor: 'red',
                   bgcolor: 'gray',
                   mt:1

                }}
                secondaryAction={
                    <IconButton
                    //    onClick={() => navigate("/analyze")}

                    ><ArrowForwardIosIcon />
                    </IconButton>
                }
                disablePadding
            >
                <ListItemButton  onClick={() => navigate("/player1")}>
                    <Avatar alt="Analisys"  
                        sx={{
                            mr: 1,
                        }}
                    >
                        <DevicesRoundedIcon sx={{ fontSize: '1rem' }} />
                    </Avatar>
                    <ListItemText id={`Player1`} primary={`Play with engine 1`} />
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