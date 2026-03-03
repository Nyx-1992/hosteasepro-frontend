import React, { useState, useMemo } from 'react';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import AddIcon from '@mui/icons-material/Add';
import Fab from '@mui/material/Fab';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
const PLATFORM_OPTIONS = [
  { value: 'airbnb', label: 'Airbnb' },
  { value: 'lekkeslaap', label: 'LekkeSlaap' },
  { value: 'booking.com', label: 'Booking.com' },
  { value: 'website', label: 'Website' },
  { value: 'privat', label: 'Privat' },
  { value: 'family_friend_blocker', label: 'Family/Friend Blocker' },
  { value: 'owner_blocker', label: 'Owner Blocker' },
];
const AddBookingDialog = ({ open, onClose, onSubmit, properties }) => {
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [guestCount, setGuestCount] = useState('');
  const [platform, setPlatform] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const handleSubmit = () => {
    if (!startDate || !endDate || !platform || !propertyId) return;
    onSubmit({
      check_in: startDate,
      check_out: endDate,
      guest_count: guestCount,
      platform,
      property_id: propertyId,
    });
  };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Add Booking</DialogTitle>
      <DialogContent>
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <TextField select label="Property" value={propertyId} onChange={e => setPropertyId(e.target.value)} fullWidth size="small" required>
              {properties.map(property => (
                <MenuItem key={property.id} value={property.id}>{property.name}</MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6}>
            <DatePicker label="Start Date" value={startDate} onChange={setStartDate} slotProps={{ textField: { fullWidth: true, size: 'small' } }} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <DatePicker label="End Date" value={endDate} onChange={setEndDate} slotProps={{ textField: { fullWidth: true, size: 'small' } }} />
          </Grid>
          <Grid item xs={12}>
            <TextField label="Guest Count" value={guestCount} onChange={e => setGuestCount(e.target.value)} type="number" fullWidth size="small" />
          </Grid>
          <Grid item xs={12}>
            <TextField select label="Booking Platform" value={platform} onChange={e => setPlatform(e.target.value)} fullWidth size="small" required>
              {PLATFORM_OPTIONS.map(opt => (
                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
              ))}
            </TextField>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained">Add</Button>
      </DialogActions>
    </Dialog>
  );
};
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Chip, Button, TextField, MenuItem, Grid, LinearProgress, Dialog, DialogTitle, DialogContent, DialogActions, Tabs, Tab
} from '@mui/material';
import { Add, Visibility, CalendarToday, ListAlt } from '@mui/icons-material';
import { useQuery } from 'react-query';
import { bookingService, propertyService } from '../services/authService';
import { format } from 'date-fns';
import { useAuth } from '../App';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';

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
            <Chip label={booking.platform.name} size="small" color={getPlatformColor(booking.platform.name)} />
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
            <Chip label={booking.status} color={getStatusColor(booking.status)} />
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

function getStatusColor(status) {
  switch (status) {
    case 'confirmed': return 'success';
    case 'checked-in': return 'info';
    case 'checked-out': return 'default';
    case 'cancelled': return 'error';
    case 'no-show': return 'warning';
    default: return 'default';
  }
}
function getPlatformColor(platform) {
  switch (platform) {
    case 'airbnb': return 'error';
    case 'booking.com': return 'primary';
    case 'lekkeslaap': return 'secondary';
    case 'fewo': return 'info';
    case 'domestic': return 'success';
    default: return 'default';
  }
}

const Bookings = () => {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [filters, setFilters] = useState({ property: '', status: '', platform: '', page: 1 });
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [tab, setTab] = useState(0); // 0 = Table, 1 = Calendar
  const { user } = useAuth();
  const { data: properties = [] } = useQuery('properties', propertyService.getProperties);
    const handleAddBooking = async (data) => {
      try {
        await bookingService.createBooking(data);
        setAddDialogOpen(false);
        // Optionally refetch bookings
        window.location.reload();
      } catch (e) {
        alert('Failed to add booking');
      }
    };
  const { data: bookingsData, isLoading } = useQuery(['bookings', filters], () => bookingService.getBookings(filters), { keepPreviousData: true });
  const { data: calendarData, isLoading: calendarLoading } = useQuery(['calendar', filters], () => bookingService.getCalendar(filters.property), { keepPreviousData: true });

  const handleFilterChange = (field, value) => setFilters(prev => ({ ...prev, [field]: value, page: 1 }));
  const handleViewDetails = (booking) => { setSelectedBooking(booking); setDetailsOpen(true); };

  // Calendar event mapping
  const calendarEvents = useMemo(() => {
    if (!Array.isArray(calendarData)) return [];
    return calendarData.map(booking => {
      let title = `${booking.guest_first_name || ''} ${booking.guest_last_name || ''} (${booking.property_name || ''})`;
      // Show blocked Booking.com entries clearly
      if (booking.status === 'blocked' && booking.platform === 'booking') {
        title = `Blocked (Booking.com) - ${booking.property_name || ''}`;
      }
      return {
        id: booking.id,
        title,
        start: booking.check_in,
        end: booking.check_out,
        color: (booking.status === 'blocked' && booking.platform === 'booking') ? '#bdbdbd' : undefined,
        extendedProps: booking
      };
    });
  }, [calendarData]);

  if (isLoading || calendarLoading) {
    return (
      <Box>
        <LinearProgress />
        <Typography sx={{ mt: 2 }}>Loading bookings...</Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, position: 'relative' }}>
        <Typography variant="h4">Bookings</Typography>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab icon={<ListAlt />} label="Table View" />
          <Tab icon={<CalendarToday />} label="Calendar View" />
        </Tabs>
        {/* Floating Add Booking Button (only in Calendar view) */}
        {tab === 1 && (user.role === 'admin' || user.role === 'property-manager') && (
          <Fab color="primary" aria-label="add" sx={{ position: 'absolute', right: 16, bottom: -56, zIndex: 10 }} onClick={() => setAddDialogOpen(true)}>
            <AddIcon />
          </Fab>
        )}
        <AddBookingDialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} onSubmit={handleAddBooking} properties={properties} />
      </Box>
      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <TextField select label="Property" value={filters.property_id || ''} onChange={e => handleFilterChange('property_id', e.target.value)} fullWidth size="small">
              <MenuItem value="">All Properties</MenuItem>
              {properties.map(property => (
                <MenuItem key={property.id} value={property.id}>{property.name}</MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField select label="Status" value={filters.status} onChange={e => handleFilterChange('status', e.target.value)} fullWidth size="small">
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
            <TextField select label="Platform" value={filters.platform} onChange={e => handleFilterChange('platform', e.target.value)} fullWidth size="small">
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
      {/* Table View */}
      {tab === 0 && (
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
              {bookingsData?.bookings?.map((booking) => {
                // Show blocked Booking.com entries with a clear label
                const isBlockedBooking = booking.status === 'blocked' && booking.platform === 'booking';
                return (
                  <TableRow key={booking.id} style={isBlockedBooking ? { background: '#f5f5f5' } : {}}>
                    <TableCell>
                      <Box>
                        <Typography variant="body2" fontWeight="bold">
                          {isBlockedBooking ? 'Blocked (Booking.com)' : `${booking.guest.firstName} ${booking.guest.lastName}`}
                        </Typography>
                        {booking.guest.email && !isBlockedBooking && (
                          <Typography variant="caption" color="textSecondary">{booking.guest.email}</Typography>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>{booking.property?.name}</TableCell>
                    <TableCell>{format(new Date(booking.dates.checkIn), 'MMM dd, yyyy')}</TableCell>
                    <TableCell>{format(new Date(booking.dates.checkOut), 'MMM dd, yyyy')}</TableCell>
                    <TableCell>{booking.dates.nights}</TableCell>
                    <TableCell><Chip label={booking.platform.name} size="small" color={getPlatformColor(booking.platform.name)} variant="outlined" /></TableCell>
                    <TableCell><Chip label={booking.status} size="small" color={getStatusColor(booking.status)} /></TableCell>
                    <TableCell>{booking.pricing?.totalAmount ? `R ${booking.pricing.totalAmount}` : '-'}</TableCell>
                    <TableCell>
                      {!isBlockedBooking && (
                        <Button size="small" startIcon={<Visibility />} onClick={() => handleViewDetails(booking)}>View</Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {/* Calendar View */}
      {tab === 1 && (
        <Paper sx={{ p: 2 }}>
          <FullCalendar
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            events={calendarEvents}
            eventClick={info => {
              const booking = info.event.extendedProps;
              setSelectedBooking(booking);
              setDetailsOpen(true);
            }}
            height={600}
          />
        </Paper>
      )}
      <BookingDetailsDialog open={detailsOpen} onClose={() => setDetailsOpen(false)} booking={selectedBooking} />
    </Box>
  );
};

export default Bookings;
