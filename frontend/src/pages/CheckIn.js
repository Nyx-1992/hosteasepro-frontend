import React, { useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Tab,
  Tabs,
} from '@mui/material';
import { 
  CheckCircle, 
  ExitToApp, 
  Visibility,
  Search,
  FilterList 
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { bookingService, propertyService } from '../services/authService';
import { format, isToday, isTomorrow } from 'date-fns';

const CheckInDialog = ({ open, onClose, booking, type }) => {
  const [formData, setFormData] = useState({
    notes: '',
    damages: '',
    keyHandedOver: false,
    cleaningNotes: '',
    keyReturned: false
  });

  const queryClient = useQueryClient();

  const checkInMutation = useMutation(
    (data) => bookingService.checkIn(booking?._id, data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('checkin-bookings');
        onClose();
      }
    }
  );

  const checkOutMutation = useMutation(
    (data) => bookingService.checkOut(booking?._id, data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('checkin-bookings');
        onClose();
      }
    }
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    if (type === 'checkin') {
      checkInMutation.mutate(formData);
    } else {
      checkOutMutation.mutate(formData);
    }
  };

  if (!booking) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {type === 'checkin' ? 'Check-in' : 'Check-out'} - {booking.guest.firstName} {booking.guest.lastName}
      </DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <Typography variant="body2" color="textSecondary">
                Property: {booking.property?.name}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                {type === 'checkin' ? 'Check-in' : 'Check-out'} Date: {format(
                  new Date(type === 'checkin' ? booking.dates.checkIn : booking.dates.checkOut), 
                  'PPP'
                )}
              </Typography>
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                label="Notes"
                multiline
                rows={3}
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                fullWidth
                placeholder="Any observations or comments..."
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                label="Damages/Issues"
                multiline
                rows={2}
                value={formData.damages}
                onChange={(e) => setFormData(prev => ({ ...prev, damages: e.target.value }))}
                fullWidth
                placeholder="Report any damages or maintenance issues..."
              />
            </Grid>

            {type === 'checkout' && (
              <Grid item xs={12}>
                <TextField
                  label="Cleaning Notes"
                  multiline
                  rows={2}
                  value={formData.cleaningNotes}
                  onChange={(e) => setFormData(prev => ({ ...prev, cleaningNotes: e.target.value }))}
                  fullWidth
                  placeholder="Cleaning status and requirements..."
                />
              </Grid>
            )}

            <Grid item xs={12}>
              <Button
                variant={formData[type === 'checkin' ? 'keyHandedOver' : 'keyReturned'] ? 'contained' : 'outlined'}
                onClick={() => setFormData(prev => ({ 
                  ...prev, 
                  [type === 'checkin' ? 'keyHandedOver' : 'keyReturned']: !prev[type === 'checkin' ? 'keyHandedOver' : 'keyReturned']
                }))}
                fullWidth
              >
                {type === 'checkin' ? 'Keys Handed Over' : 'Keys Returned'}
              </Button>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button 
            type="submit" 
            variant="contained"
            disabled={checkInMutation.isLoading || checkOutMutation.isLoading}
          >
            Complete {type === 'checkin' ? 'Check-in' : 'Check-out'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

const CheckIn = () => {
  const [tabValue, setTabValue] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState('checkin');

  const { data: properties = [] } = useQuery(
    'properties',
    propertyService.getProperties
  );

  // Get bookings for check-in management
  const { data: checkInBookings = [] } = useQuery(
    'checkin-bookings',
    () => bookingService.getBookings({ 
      status: 'confirmed',
      startDate: format(new Date(), 'yyyy-MM-dd')
    }),
    { refetchInterval: 300000 }
  );

  const { data: checkOutBookings = [] } = useQuery(
    'checkout-bookings', 
    () => bookingService.getBookings({ 
      status: 'checked-in'
    }),
    { refetchInterval: 300000 }
  );

  const handleCheckIn = (booking) => {
    setSelectedBooking(booking);
    setDialogType('checkin');
    setDialogOpen(true);
  };

  const handleCheckOut = (booking) => {
    setSelectedBooking(booking);
    setDialogType('checkout');
    setDialogOpen(true);
  };

  const getBookingPriority = (booking) => {
    const checkInDate = new Date(booking.dates.checkIn);
    const checkOutDate = new Date(booking.dates.checkOut);
    
    if (isToday(checkInDate) || isToday(checkOutDate)) return 'high';
    if (isTomorrow(checkInDate) || isTomorrow(checkOutDate)) return 'medium';
    return 'low';
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return 'error';
      case 'medium': return 'warning';
      default: return 'default';
    }
  };

  const filteredCheckIns = checkInBookings.bookings?.filter(booking =>
    booking.guest.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    booking.guest.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    booking.property?.name.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const filteredCheckOuts = checkOutBookings.bookings?.filter(booking =>
    booking.guest.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    booking.guest.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    booking.property?.name.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Check-in Management
      </Typography>
      
      <Typography variant="body2" color="textSecondary" paragraph>
        Manage guest check-ins and check-outs. Nina can use this interface to process arrivals and departures.
      </Typography>

      {/* Search */}
      <Box sx={{ mb: 3 }}>
        <TextField
          placeholder="Search by guest name or property..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: <Search sx={{ mr: 1, color: 'text.secondary' }} />
          }}
          fullWidth
        />
      </Box>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)}>
          <Tab label={`Check-ins (${filteredCheckIns.length})`} />
          <Tab label={`Check-outs (${filteredCheckOuts.length})`} />
        </Tabs>
      </Box>

      {/* Check-ins Tab */}
      {tabValue === 0 && (
        <Grid container spacing={3}>
          {filteredCheckIns.length === 0 ? (
            <Grid item xs={12}>
              <Card>
                <CardContent sx={{ textAlign: 'center', py: 4 }}>
                  <Typography color="textSecondary">
                    No pending check-ins found.
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ) : (
            filteredCheckIns.map(booking => {
              const priority = getBookingPriority(booking);
              return (
                <Grid item xs={12} md={6} lg={4} key={booking._id}>
                  <Card sx={{ height: '100%' }}>
                    <CardContent>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                        <Typography variant="h6">
                          {booking.guest.firstName} {booking.guest.lastName}
                        </Typography>
                        <Chip 
                          label={priority} 
                          size="small" 
                          color={getPriorityColor(priority)}
                        />
                      </Box>
                      
                      <Typography color="textSecondary" gutterBottom>
                        {booking.property?.name}
                      </Typography>
                      
                      <Typography variant="body2" gutterBottom>
                        Check-in: {format(new Date(booking.dates.checkIn), 'PPP')}
                      </Typography>
                      
                      <Typography variant="body2" gutterBottom>
                        Guests: {booking.guest.numberOfGuests}
                      </Typography>

                      <Typography variant="body2" gutterBottom>
                        Platform: <Chip label={booking.platform.name} size="small" variant="outlined" />
                      </Typography>

                      <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                        <Button
                          variant="contained"
                          startIcon={<CheckCircle />}
                          onClick={() => handleCheckIn(booking)}
                          size="small"
                          fullWidth
                        >
                          Check In
                        </Button>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })
          )}
        </Grid>
      )}

      {/* Check-outs Tab */}
      {tabValue === 1 && (
        <Grid container spacing={3}>
          {filteredCheckOuts.length === 0 ? (
            <Grid item xs={12}>
              <Card>
                <CardContent sx={{ textAlign: 'center', py: 4 }}>
                  <Typography color="textSecondary">
                    No pending check-outs found.
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ) : (
            filteredCheckOuts.map(booking => {
              const priority = getBookingPriority(booking);
              return (
                <Grid item xs={12} md={6} lg={4} key={booking._id}>
                  <Card sx={{ height: '100%' }}>
                    <CardContent>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                        <Typography variant="h6">
                          {booking.guest.firstName} {booking.guest.lastName}
                        </Typography>
                        <Chip 
                          label={priority} 
                          size="small" 
                          color={getPriorityColor(priority)}
                        />
                      </Box>
                      
                      <Typography color="textSecondary" gutterBottom>
                        {booking.property?.name}
                      </Typography>
                      
                      <Typography variant="body2" gutterBottom>
                        Check-out: {format(new Date(booking.dates.checkOut), 'PPP')}
                      </Typography>
                      
                      <Typography variant="body2" gutterBottom>
                        Guests: {booking.guest.numberOfGuests}
                      </Typography>

                      <Typography variant="body2" gutterBottom>
                        Platform: <Chip label={booking.platform.name} size="small" variant="outlined" />
                      </Typography>

                      <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                        <Button
                          variant="contained"
                          startIcon={<ExitToApp />}
                          onClick={() => handleCheckOut(booking)}
                          size="small"
                          fullWidth
                          color="secondary"
                        >
                          Check Out
                        </Button>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })
          )}
        </Grid>
      )}

      <CheckInDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        booking={selectedBooking}
        type={dialogType}
      />
    </Box>
  );
};

export default CheckIn;
