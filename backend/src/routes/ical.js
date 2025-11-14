const express = require('express');
const { auth, authorize } = require('../middleware/auth');
const ICalService = require('../services/icalService');
const Property = require('../models/Property');

const router = express.Router();

// @route   POST /api/ical/sync/:propertyId
// @desc    Sync iCal for a specific property
// @access  Private (Admin/Property Manager)
router.post('/sync/:propertyId', auth, authorize('admin', 'property-manager'), async (req, res) => {
  try {
    const property = await Property.findById(req.params.propertyId);
    
    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }

    const results = await ICalService.syncPropertyCalendar(property);
    
    res.json({
      message: 'iCal sync completed',
      propertyName: property.name,
      results
    });
  } catch (error) {
    console.error('iCal sync error:', error);
    res.status(500).json({ message: 'Error syncing iCal data', error: error.message });
  }
});

// @route   POST /api/ical/sync-all
// @desc    Sync iCal for all properties
// @access  Private (Admin only)
router.post('/sync-all', auth, authorize('admin'), async (req, res) => {
  try {
    const results = await ICalService.syncAllProperties();
    
    res.json({
      message: 'Bulk iCal sync completed',
      results
    });
  } catch (error) {
    console.error('Bulk iCal sync error:', error);
    res.status(500).json({ message: 'Error syncing all iCal data', error: error.message });
  }
});

// @route   GET /api/ical/status
// @desc    Get iCal sync status for all properties
// @access  Private (Admin/Property Manager)
router.get('/status', auth, authorize('admin', 'property-manager'), async (req, res) => {
  try {
    const properties = await Property.find({ isActive: true })
      .select('name platformIntegrations')
      .lean();
    
    const status = properties.map(property => {
      const platforms = [];
      
      Object.keys(property.platformIntegrations).forEach(platform => {
        const config = property.platformIntegrations[platform];
        if (config.icalUrl) {
          platforms.push({
            platform,
            isActive: config.isActive,
            hasUrl: true
          });
        }
      });
      
      return {
        propertyId: property._id,
        propertyName: property.name,
        platforms
      };
    });
    
    res.json(status);
  } catch (error) {
    console.error('Error getting iCal status:', error);
    res.status(500).json({ message: 'Error getting iCal status' });
  }
});

module.exports = router;
