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
    // [DISABLED] Batch sync endpoint for MongoDB is now deprecated. Use Supabase for all booking operations.
    // router.post('/sync-batch', ...)
      updated_at: new Date()
    };
    const updated = await supabaseBookings.updateBooking(req.params.id, updates);
    res.json(updated);
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
    const { startDate, endDate } = req.query;
    
    let query = { isActive: true };
    
    if (propertyId) {
      query.property = propertyId;
    }
    
    if (startDate && endDate) {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }

        const checkIn = moment(req.body.checkin_date);
        const checkOut = moment(req.body.checkout_date);
        const nights = checkOut.diff(checkIn, 'days');
    const bookings = await supabaseBookings.getBookings({ propertyId });
    res.json(bookings);
        const booking = {
          ...req.body,
          nights,
          status: req.body.status || 'confirmed',
          created_at: new Date(),
          updated_at: new Date()
        };
        const created = await supabaseBookings.createBooking(booking);
        res.status(201).json(created);
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
      }

    // Preload properties map (name -> _id) case-insensitive for fast lookup
    const properties = await Property.find({ isActive: true }).select('_id name');
    const propNameMap = new Map(properties.map(p => [p.name.toLowerCase(), p._id]));

    let inserted = 0, updated = 0, skipped = 0;
    const results = [];

    for (const b of incoming) {
      // Validate minimal fields
      if (!b.propertyName || !b.start || !b.end || !b.platform) { skipped++; continue; }
      const propId = propNameMap.get(b.propertyName.toLowerCase());
      if (!propId) { skipped++; continue; }
      const checkIn = new Date(b.start);
      const checkOut = new Date(b.end);
      if (!(checkIn instanceof Date) || isNaN(checkIn) || !(checkOut instanceof Date) || isNaN(checkOut) || checkOut <= checkIn) { skipped++; continue; }
      const nights = Math.round((checkOut - checkIn) / (1000*60*60*24));
      const platformName = b.platform === 'booking' ? 'booking.com' : b.platform; // normalize naming
      const compositeQuery = {
        property: propId,
        'platform.name': platformName,
        'dates.checkIn': checkIn,
        'dates.checkOut': checkOut
      };

      const existing = await Booking.findOne(compositeQuery);
      const pricingTotal = b.revenue || 0;
      const guestCount = b.guestCount || b.guests || 1;
      const status = b.status || 'confirmed';

      if (existing) {
        // Update selected mutable fields (status, pricing, guest count)
        existing.pricing.totalAmount = pricingTotal || existing.pricing.totalAmount || 0;
        existing.pricing.baseAmount = existing.pricing.baseAmount || pricingTotal;
        existing.guest.numberOfGuests = guestCount;
        existing.status = status;
        existing.icalSource = existing.icalSource || {};
        if (b.eventId) existing.icalSource.eventId = b.eventId;
        existing.icalSource.lastSync = new Date();
        await existing.save();
        updated++;
        results.push({ action:'updated', id: existing._id, platform: platformName, property: b.propertyName, checkIn, checkOut });
        continue;
      }

      // Insert new booking using placeholder guest/pricing if missing
      const newBooking = new Booking({
        property: propId,
        guest: {
          firstName: b.guestFirstName || 'Guest',
          lastName: b.guestLastName || 'Unknown',
          email: b.guestEmail || `unknown-${platformName}-${Date.now()}@example.com`,
          phone: b.guestPhone || '',
          numberOfGuests: guestCount,
          specialRequests: b.specialRequests || ''
        },
        dates: { checkIn, checkOut, nights },
        pricing: {
          baseAmount: pricingTotal,
            cleaningFee: 0,
            securityDeposit: 0,
            taxes: 0,
            platformFee: 0,
            totalAmount: pricingTotal,
            currency: 'ZAR'
        },
        platform: {
          name: platformName,
          bookingId: b.bookingRef || b.bookingId || undefined,
          confirmationNumber: b.confirmationNumber || undefined
        },
        status,
        paymentStatus: pricingTotal > 0 ? 'paid' : 'pending',
        icalSource: {
          lastSync: new Date(),
          eventId: b.eventId || null
        },
        isActive: true
      });
      await newBooking.save();
      inserted++;
      results.push({ action:'inserted', id: newBooking._id, platform: platformName, property: b.propertyName, checkIn, checkOut });
    }

    res.json({ message: 'Sync completed', inserted, updated, skipped, results });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error during sync' });
  }
});

module.exports = router;

// [DISABLED] Export to Supabase endpoint is now deprecated. Use Supabase as the primary data source.
// router.post('/export-supabase', ...)
