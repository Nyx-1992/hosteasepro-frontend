import React from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Button,
  Box,
} from '@mui/material';
import {
  Menu as MenuIcon,
  AccountCircle,
  ExitToApp,
} from '@mui/icons-material';
import { useAuth } from '../App';

const Navbar = ({ onMenuClick }) => {
  const { user, logout } = useAuth();

  return (
    <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
      <Toolbar>
        <IconButton
          color="inherit"
          edge="start"
          onClick={onMenuClick}
          sx={{ mr: 2 }}
        >
          <MenuIcon />
        </IconButton>
        
        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
          Nyx Training - Property Management
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AccountCircle />
            <Typography variant="body2">
              {user?.firstName} {user?.lastName} ({user?.role})
            </Typography>
          </Box>
          
          <Button
            color="inherit"
            startIcon={<ExitToApp />}
            onClick={logout}
            size="small"
          >
            Logout
          </Button>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Navbar;
