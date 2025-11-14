import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  LinearProgress,
} from '@mui/material';
import { Add, Edit, Sync } from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { propertyService, icalService } from '../services/authService';
import { useAuth } from '../App';

const PropertyDialog = ({ open, onClose, property = null }) => {
  const [formData, setFormData] = useState(
    property || {
      name: '',
      description: '',
      address: {
        street: '',
        city: '',
        province: '',
        postalCode: '',
        country: 'South Africa'
      },
      propertyType: 'apartment',
      bedrooms: 1,
      bathrooms: 1,
      maxGuests: 2,
      pricing: {
        basePrice: 0,
        currency: 'ZAR'
      },
      platformIntegrations: {
        bookingCom: { icalUrl: '', isActive: false },
        lekkeSlaap: { icalUrl: '', isActive: false },
        fewo: { icalUrl: '', isActive: false },
        airbnb: { icalUrl: '', isActive: false }
      }
    }
  );

  const queryClient = useQueryClient();
  
  const createMutation = useMutation(propertyService.createProperty, {
    onSuccess: () => {
      queryClient.invalidateQueries('properties');
      onClose();
    }
  });

  const updateMutation = useMutation(
    (data) => propertyService.updateProperty(property._id, data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('properties');
        onClose();
      }
    }
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    if (property) {
      updateMutation.mutate(formData);
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleChange = (field, value) => {
    if (field.includes('.')) {
      const [parent, child] = field.split('.');
      setFormData(prev => ({
        ...prev,
        [parent]: {
          ...prev[parent],
          [child]: value
        }
      }));
    } else {
      setFormData(prev => ({ ...prev, [field]: value }));
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {property ? 'Edit Property' : 'Add New Property'}
      </DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Property Name"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                required
                fullWidth
                margin="normal"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                select
                label="Property Type"
                value={formData.propertyType}
                onChange={(e) => handleChange('propertyType', e.target.value)}
                required
                fullWidth
                margin="normal"
              >
                {['apartment', 'house', 'studio', 'villa', 'other'].map(type => (
                  <MenuItem key={type} value={type}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Description"
                value={formData.description}
                onChange={(e) => handleChange('description', e.target.value)}
                multiline
                rows={3}
                fullWidth
                margin="normal"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Street Address"
                value={formData.address.street}
                onChange={(e) => handleChange('address.street', e.target.value)}
                required
                fullWidth
                margin="normal"
              />
            </Grid>
            <Grid item xs={4}>
              <TextField
                label="City"
                value={formData.address.city}
                onChange={(e) => handleChange('address.city', e.target.value)}
                required
                fullWidth
                margin="normal"
              />
            </Grid>
            <Grid item xs={4}>
              <TextField
                label="Province"
                value={formData.address.province}
                onChange={(e) => handleChange('address.province', e.target.value)}
                required
                fullWidth
                margin="normal"
              />
            </Grid>
            <Grid item xs={4}>
              <TextField
                label="Postal Code"
                value={formData.address.postalCode}
                onChange={(e) => handleChange('address.postalCode', e.target.value)}
                required
                fullWidth
                margin="normal"
              />
            </Grid>
            <Grid item xs={3}>
              <TextField
                type="number"
                label="Bedrooms"
                value={formData.bedrooms}
                onChange={(e) => handleChange('bedrooms', parseInt(e.target.value))}
                required
                fullWidth
                margin="normal"
                inputProps={{ min: 0 }}
              />
            </Grid>
            <Grid item xs={3}>
              <TextField
                type="number"
                label="Bathrooms"
                value={formData.bathrooms}
                onChange={(e) => handleChange('bathrooms', parseInt(e.target.value))}
                required
                fullWidth
                margin="normal"
                inputProps={{ min: 0 }}
              />
            </Grid>
            <Grid item xs={3}>
              <TextField
                type="number"
                label="Max Guests"
                value={formData.maxGuests}
                onChange={(e) => handleChange('maxGuests', parseInt(e.target.value))}
                required
                fullWidth
                margin="normal"
                inputProps={{ min: 1 }}
              />
            </Grid>
            <Grid item xs={3}>
              <TextField
                type="number"
                label="Base Price (ZAR)"
                value={formData.pricing.basePrice}
                onChange={(e) => handleChange('pricing.basePrice', parseFloat(e.target.value))}
                required
                fullWidth
                margin="normal"
                inputProps={{ min: 0, step: 0.01 }}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button 
            type="submit" 
            variant="contained"
            disabled={createMutation.isLoading || updateMutation.isLoading}
          >
            {property ? 'Update' : 'Create'} Property
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

const Properties = () => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState(null);
  
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: properties = [], isLoading } = useQuery(
    'properties',
    propertyService.getProperties
  );

  const syncMutation = useMutation(icalService.syncProperty, {
    onSuccess: () => {
      queryClient.invalidateQueries('bookings');
    }
  });

  const handleEdit = (property) => {
    setSelectedProperty(property);
    setDialogOpen(true);
  };

  const handleAdd = () => {
    setSelectedProperty(null);
    setDialogOpen(true);
  };

  const handleSync = (propertyId) => {
    syncMutation.mutate(propertyId);
  };

  if (isLoading) {
    return (
      <Box>
        <LinearProgress />
        <Typography sx={{ mt: 2 }}>Loading properties...</Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Properties</Typography>
        {user.role === 'admin' && (
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={handleAdd}
          >
            Add Property
          </Button>
        )}
      </Box>

      <Grid container spacing={3}>
        {properties.map((property) => (
          <Grid item xs={12} md={6} lg={4} key={property._id}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  {property.name}
                </Typography>
                
                <Typography color="textSecondary" gutterBottom>
                  {property.address.street}, {property.address.city}
                </Typography>

                <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                  <Chip 
                    label={`${property.bedrooms} bed`} 
                    size="small" 
                    variant="outlined" 
                  />
                  <Chip 
                    label={`${property.bathrooms} bath`} 
                    size="small" 
                    variant="outlined" 
                  />
                  <Chip 
                    label={`${property.maxGuests} guests`} 
                    size="small" 
                    variant="outlined" 
                  />
                  <Chip 
                    label={`R${property.pricing.basePrice}/night`} 
                    size="small" 
                    color="primary" 
                  />
                </Box>

                <Typography variant="body2" color="textSecondary" paragraph>
                  {property.description}
                </Typography>

                <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                  {user.role === 'admin' && (
                    <>
                      <Button
                        size="small"
                        startIcon={<Edit />}
                        onClick={() => handleEdit(property)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="small"
                        startIcon={<Sync />}
                        onClick={() => handleSync(property._id)}
                        disabled={syncMutation.isLoading}
                      >
                        Sync iCal
                      </Button>
                    </>
                  )}
                </Box>

                {/* Platform Integration Status */}
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Platform Integrations:
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {Object.entries(property.platformIntegrations).map(([platform, config]) => (
                      <Chip
                        key={platform}
                        label={platform.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                        size="small"
                        color={config.isActive ? 'success' : 'default'}
                        variant={config.isActive ? 'filled' : 'outlined'}
                      />
                    ))}
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <PropertyDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        property={selectedProperty}
      />
    </Box>
  );
};

export default Properties;
