import React from 'react';
import {
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemButton,
  Divider,
  Box,
  Toolbar,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  Business as BusinessIcon,
  EventNote as EventNoteIcon,
  CheckCircle as CheckCircleIcon,
  MenuBook as MenuBookIcon,
  AccountBalance as AccountBalanceIcon,
  Sync as SyncIcon,
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../App';

const DRAWER_WIDTH = 240;

const Sidebar = ({ open, onClose }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const menuItems = [
    {
      text: 'Dashboard',
      icon: <DashboardIcon />,
      path: '/dashboard',
      roles: ['admin', 'property-manager', 'customer']
    },
    {
      text: 'Properties',
      icon: <BusinessIcon />,
      path: '/properties',
      roles: ['admin', 'property-manager']
    },
    {
      text: 'Bookings',
      icon: <EventNoteIcon />,
      path: '/bookings',
      roles: ['admin', 'property-manager', 'customer']
    },
    {
      text: 'Check-In Management',
      icon: <CheckCircleIcon />,
      path: '/checkin',
      roles: ['admin', 'property-manager']
    },
    {
      text: 'Knowledge Base',
      icon: <MenuBookIcon />,
      path: '/knowledge-base',
      roles: ['admin', 'property-manager', 'customer']
    },
    {
      text: 'Financial Reports',
      icon: <AccountBalanceIcon />,
      path: '/financial',
      roles: ['admin', 'property-manager']
    },
  ];

  const handleNavigation = (path) => {
    navigate(path);
    if (window.innerWidth < 900) {
      onClose();
    }
  };

  const filteredMenuItems = menuItems.filter(item => 
    item.roles.includes(user?.role)
  );

  const drawer = (
    <Box>
      <Toolbar />
      <List>
        {filteredMenuItems.map((item) => (
          <ListItem key={item.text} disablePadding>
            <ListItemButton
              selected={location.pathname === item.path}
              onClick={() => handleNavigation(item.path)}
              sx={{
                '&.Mui-selected': {
                  backgroundColor: 'primary.main',
                  color: 'primary.contrastText',
                  '&:hover': {
                    backgroundColor: 'primary.dark',
                  },
                  '& .MuiListItemIcon-root': {
                    color: 'inherit',
                  },
                },
              }}
            >
              <ListItemIcon>
                {item.icon}
              </ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>

      {(user?.role === 'admin' || user?.role === 'property-manager') && (
        <>
          <Divider />
          <List>
            <ListItem>
              <ListItemText 
                primary="Admin Tools" 
                primaryTypographyProps={{ 
                  variant: 'subtitle2', 
                  color: 'text.secondary' 
                }} 
              />
            </ListItem>
            <ListItem disablePadding>
              <ListItemButton onClick={() => {/* Handle sync */}}>
                <ListItemIcon>
                  <SyncIcon />
                </ListItemIcon>
                <ListItemText primary="Sync iCal Feeds" />
              </ListItemButton>
            </ListItem>
          </List>
        </>
      )}
    </Box>
  );

  return (
    <Drawer
      variant="persistent"
      open={open}
      sx={{
        width: open ? DRAWER_WIDTH : 0,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: DRAWER_WIDTH,
          boxSizing: 'border-box',
        },
      }}
    >
      {drawer}
    </Drawer>
  );
};

export default Sidebar;
