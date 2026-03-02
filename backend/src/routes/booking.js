const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth, authorize } = require('../middleware/auth');
// const Booking = require('../models/Booking');
const supabaseBookings = require('../services/supabaseBookings');
const Property = require('../models/Property');
const moment = require('moment');
const { syncMongoToSupabase } = require('../services/supabaseSync');

const router = express.Router();

// @route   GET /api/bookings
// @desc    Get all bookings with filtering
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const { property } = req.query;
    // For now, only filter by property (extend as needed)
    const bookings = await supabaseBookings.getBookings({ propertyId: property });
    res.json({ bookings });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/bookings/:id
// @desc    Get booking by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const booking = await supabaseBookings.getBookingById(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    res.json(booking);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/bookings/:id/status
// @desc    Update booking status
// @access  Private (Admin/Property Manager)
router.put('/:id/status', auth, authorize('admin', 'property-manager'), async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'confirmed', 'checked-in', 'checked-out', 'cancelled', 'no-show'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
    const updates = { status, updated_at: new Date() };
    const updated = await supabaseBookings.updateBooking(req.params.id, updates);
    res.json({ message: 'Status updated successfully', status, updated });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/bookings/calendar/:propertyId?
// @desc    Get calendar view of bookings
// @access  Private
router.get('/calendar/:propertyId?', auth, async (req, res) => {
  try {
    const { propertyId } = req.params;
    // Optionally filter by propertyId
    const bookings = await supabaseBookings.getBookings({ propertyId });
    res.json({ bookings });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

// [DISABLED] Export to Supabase endpoint is now deprecated. Use Supabase as the primary data source.
// router.post('/export-supabase', ...)
