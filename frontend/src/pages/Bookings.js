import React, { useState } from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Button,
  TextField,
  MenuItem,
  Grid,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import { Add, Visibility } from '@mui/icons-material';
import { useQuery } from 'react-query';
import { bookingService, propertyService } from '../services/authService';
import { format } from 'date-fns';
import { useAuth } from '../App';

const BookingDetailsDialog = ({ open, onClose, booking }) => {
  if (!booking) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Booking Details - {booking.guest.firstName} {booking.guest.lastName}
      </DialogTitle>
      <DialogContent>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <Typography variant="subtitle2">Property</Typography>
            <Typography>{booking.property?.name}</Typography>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Typography variant="subtitle2">Platform</Typography>
            <Chip 
              label={booking.platform.name} 
              size="small"
              color={
                booking.platform.name === 'airbnb' ? 'error' :
                booking.platform.name === 'booking.com' ? 'primary' :
                booking.platform.name === 'lekkeslaap' ? 'secondary' :
                'default'
              }
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <Typography variant="subtitle2">Check-in</Typography>
            <Typography>{format(new Date(booking.dates.checkIn), 'PPP')}</Typography>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Typography variant="subtitle2">Check-out</Typography>
            <Typography>{format(new Date(booking.dates.checkOut), 'PPP')}</Typography>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Typography variant="subtitle2">Nights</Typography>
            <Typography>{booking.dates.nights}</Typography>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Typography variant="subtitle2">Guests</Typography>
            <Typography>{booking.guest.numberOfGuests}</Typography>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Typography variant="subtitle2">Total Amount</Typography>
            <Typography>R {booking.pricing.totalAmount}</Typography>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Typography variant="subtitle2">Status</Typography>
            <Chip 
              label={booking.status} 
              color={
                booking.status === 'confirmed' ? 'success' :
                booking.status === 'checked-in' ? 'info' :
                booking.status === 'checked-out' ? 'default' :
                'warning'
              }
            />
          </Grid>
          <Grid item xs={12}>
            <Typography variant="subtitle2">Guest Email</Typography>
            <Typography>{booking.guest.email}</Typography>
          </Grid>
          {booking.guest.phone && (
            <Grid item xs={12}>
              <Typography variant="subtitle2">Guest Phone</Typography>
              <Typography>{booking.guest.phone}</Typography>
            </Grid>
          )}
          {booking.guest.specialRequests && (
            <Grid item xs={12}>
              <Typography variant="subtitle2">Special Requests</Typography>
              <Typography>{booking.guest.specialRequests}</Typography>
            </Grid>
          )}
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

const Bookings = () => {
  const [filters, setFilters] = useState({
    property: '',
    status: '',
    platform: '',
    page: 1
  });
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  
  const { user } = useAuth();

  const { data: properties = [] } = useQuery(
    'properties',
    propertyService.getProperties
  );

  const { data: bookingsData, isLoading } = useQuery(
    ['bookings', filters],
    () => bookingService.getBookings(filters),
    { keepPreviousData: true }
  );

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value, page: 1 }));
  };

  const handleViewDetails = (booking) => {
    setSelectedBooking(booking);
    setDetailsOpen(true);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'confirmed': return 'success';
      case 'checked-in': return 'info';
      case 'checked-out': return 'default';
      case 'cancelled': return 'error';
      case 'no-show': return 'warning';
      default: return 'default';
    }
  };

  const getPlatformColor = (platform) => {
    switch (platform) {
      case 'airbnb': return 'error';
      case 'booking.com': return 'primary';
      case 'lekkeslaap': return 'secondary';
      case 'fewo': return 'info';
      case 'domestic': return 'success';
      default: return 'default';
    }
  };

  if (isLoading) {
    return (
      <Box>
        <LinearProgress />
        <Typography sx={{ mt: 2 }}>Loading bookings...</Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Bookings</Typography>
        {(user.role === 'admin' || user.role === 'property-manager') && (
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => {/* Handle add booking */}}
          >
            Add Domestic Booking
          </Button>
        )}
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              select
              label="Property"
              value={filters.property}
              onChange={(e) => handleFilterChange('property', e.target.value)}
              fullWidth
              size="small"
            >
              <MenuItem value="">All Properties</MenuItem>
              {properties.map(property => (
                <MenuItem key={property._id} value={property._id}>
                  {property.name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              select
              label="Status"
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              fullWidth
              size="small"
            >
              <MenuItem value="">All Statuses</MenuItem>
              <MenuItem value="pending">Pending</MenuItem>
              <MenuItem value="confirmed">Confirmed</MenuItem>
              <MenuItem value="checked-in">Checked In</MenuItem>
              <MenuItem value="checked-out">Checked Out</MenuItem>
              <MenuItem value="cancelled">Cancelled</MenuItem>
              <MenuItem value="no-show">No Show</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              select
              label="Platform"
              value={filters.platform}
              onChange={(e) => handleFilterChange('platform', e.target.value)}
              fullWidth
              size="small"
            >
              <MenuItem value="">All Platforms</MenuItem>
              <MenuItem value="airbnb">Airbnb</MenuItem>
              <MenuItem value="booking.com">Booking.com</MenuItem>
              <MenuItem value="lekkeslaap">LekkeSlaap</MenuItem>
              <MenuItem value="fewo">Fewo</MenuItem>
              <MenuItem value="domestic">Domestic</MenuItem>
            </TextField>
          </Grid>
        </Grid>
      </Paper>

      {/* Bookings Table */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Guest</TableCell>
              <TableCell>Property</TableCell>
              <TableCell>Check-in</TableCell>
              <TableCell>Check-out</TableCell>
              <TableCell>Nights</TableCell>
              <TableCell>Platform</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Amount</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {bookingsData?.bookings?.map((booking) => (
              <TableRow key={booking._id}>
                <TableCell>
                  <Box>
                    <Typography variant="body2" fontWeight="bold">
                      {booking.guest.firstName} {booking.guest.lastName}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      {booking.guest.email}
                    </Typography>
                  </Box>
                </TableCell>
                <TableCell>{booking.property?.name}</TableCell>
                <TableCell>
                  {format(new Date(booking.dates.checkIn), 'MMM dd, yyyy')}
                </TableCell>
                <TableCell>
                  {format(new Date(booking.dates.checkOut), 'MMM dd, yyyy')}
                </TableCell>
                <TableCell>{booking.dates.nights}</TableCell>
                <TableCell>
                  <Chip
                    label={booking.platform.name}
                    size="small"
                    color={getPlatformColor(booking.platform.name)}
                    variant="outlined"
                  />
                </TableCell>
                <TableCell>
                  <Chip
                    label={booking.status}
                    size="small"
                    color={getStatusColor(booking.status)}
                  />
                </TableCell>
                <TableCell>R {booking.pricing.totalAmount}</TableCell>
                <TableCell>
                  <Button
                    size="small"
                    startIcon={<Visibility />}
                    onClick={() => handleViewDetails(booking)}
                  >
                    View
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {bookingsData?.bookings?.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography color="textSecondary">
            No bookings found with the current filters.
          </Typography>
        </Box>
      )}

      <BookingDetailsDialog
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        booking={selectedBooking}
      />
    </Box>
  );
};

export default Bookings;
