import React from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Paper,
  List,
  ListItem,
  ListItemText,
  Chip,
  LinearProgress,
} from '@mui/material';
import {
  TrendingUp,
  EventNote,
  CheckCircle,
  AttachMoney,
} from '@mui/icons-material';
import { useQuery } from 'react-query';
import { dashboardService } from '../services/authService';
import { format } from 'date-fns';

const StatCard = ({ title, value, icon, color = 'primary' }) => (
  <Card>
    <CardContent>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography color="textSecondary" gutterBottom variant="body2">
            {title}
          </Typography>
          <Typography variant="h4" component="h2">
            {value}
          </Typography>
        </Box>
        <Box sx={{ color: `${color}.main` }}>
          {icon}
        </Box>
      </Box>
    </CardContent>
  </Card>
);

const Dashboard = () => {
  const { data: dashboardData, isLoading } = useQuery(
    'dashboard',
    dashboardService.getDashboard,
    { refetchInterval: 300000 } // Refresh every 5 minutes
  );

  const { data: stats } = useQuery(
    'dashboard-stats',
    () => dashboardService.getStats('30'),
    { refetchInterval: 300000 }
  );

  if (isLoading) {
    return (
      <Box sx={{ width: '100%' }}>
        <LinearProgress />
        <Typography sx={{ mt: 2 }}>Loading dashboard...</Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Dashboard Overview
      </Typography>

      {/* Key Performance Indicators */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Revenue (30 days)"
            value={`R ${stats?.totalRevenue?.toLocaleString() || '0'}`}
            icon={<AttachMoney sx={{ fontSize: 40 }} />}
            color="success"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Bookings"
            value={stats?.totalBookings || '0'}
            icon={<EventNote sx={{ fontSize: 40 }} />}
            color="info"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Occupancy Rate"
            value={`${stats?.occupancyRate || '0'}%`}
            icon={<TrendingUp sx={{ fontSize: 40 }} />}
            color="warning"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Avg Booking Value"
            value={`R ${Math.round(stats?.averageBookingValue || 0)}`}
            icon={<CheckCircle sx={{ fontSize: 40 }} />}
            color="secondary"
          />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* Upcoming Check-ins */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Upcoming Check-ins (Next 7 Days)
            </Typography>
            <List dense>
              {dashboardData?.upcomingCheckIns?.slice(0, 5).map((booking) => (
                <ListItem key={booking._id}>
                  <ListItemText
                    primary={`${booking.guest.firstName} ${booking.guest.lastName}`}
                    secondary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2">
                          {booking.property.name} - {format(new Date(booking.dates.checkIn), 'MMM dd, yyyy')}
                        </Typography>
                        <Chip 
                          label={booking.platform.name} 
                          size="small" 
                          variant="outlined" 
                        />
                      </Box>
                    }
                  />
                </ListItem>
              )) || (
                <ListItem>
                  <ListItemText primary="No upcoming check-ins" />
                </ListItem>
              )}
            </List>
          </Paper>
        </Grid>

        {/* Upcoming Check-outs */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Upcoming Check-outs (Next 7 Days)
            </Typography>
            <List dense>
              {dashboardData?.upcomingCheckOuts?.slice(0, 5).map((booking) => (
                <ListItem key={booking._id}>
                  <ListItemText
                    primary={`${booking.guest.firstName} ${booking.guest.lastName}`}
                    secondary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2">
                          {booking.property.name} - {format(new Date(booking.dates.checkOut), 'MMM dd, yyyy')}
                        </Typography>
                        <Chip 
                          label={booking.platform.name} 
                          size="small" 
                          variant="outlined" 
                        />
                      </Box>
                    }
                  />
                </ListItem>
              )) || (
                <ListItem>
                  <ListItemText primary="No upcoming check-outs" />
                </ListItem>
              )}
            </List>
          </Paper>
        </Grid>

        {/* Property Statistics */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Property Performance
            </Typography>
            <List dense>
              {dashboardData?.propertyStats?.map((property) => (
                <ListItem key={property._id}>
                  <ListItemText
                    primary={property.name}
                    secondary={`${property.totalBookings} bookings (30 days) | ${property.activeBookings} currently occupied`}
                  />
                </ListItem>
              )) || (
                <ListItem>
                  <ListItemText primary="No property data available" />
                </ListItem>
              )}
            </List>
          </Paper>
        </Grid>

        {/* Current Bookings Status */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Current Bookings Status
            </Typography>
            <List dense>
              {dashboardData?.currentBookings?.map((status) => (
                <ListItem key={status._id}>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body1" sx={{ textTransform: 'capitalize' }}>
                          {status._id.replace('-', ' ')}
                        </Typography>
                        <Chip 
                          label={status.count} 
                          size="small" 
                          color={
                            status._id === 'checked-in' ? 'success' :
                            status._id === 'confirmed' ? 'info' : 'default'
                          }
                        />
                      </Box>
                    }
                  />
                </ListItem>
              )) || (
                <ListItem>
                  <ListItemText primary="No active bookings" />
                </ListItem>
              )}
            </List>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Dashboard;
