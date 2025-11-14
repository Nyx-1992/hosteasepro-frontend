const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth, authorize } = require('../middleware/auth');
const Booking = require('../models/Booking');
const Property = require('../models/Property');
const moment = require('moment');
const { syncMongoToSupabase } = require('../services/supabaseSync');

const router = express.Router();

// @route   GET /api/bookings
// @desc    Get all bookings with filtering
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const { property, status, platform, startDate, endDate, page = 1, limit = 50 } = req.query;
    
    let query = { isActive: true };
    
    if (property) {
      query.property = property;
    }
    
    if (status) {
      query.status = status;
    }
    
    if (platform) {
      query['platform.name'] = platform;
    }
    
    if (startDate || endDate) {
      query['dates.checkIn'] = {};
      if (startDate) {
        query['dates.checkIn'].$gte = new Date(startDate);
      }
      if (endDate) {
        query['dates.checkIn'].$lte = new Date(endDate);
      }
    }

    const bookings = await Booking.find(query)
      .populate('property', 'name address')
      .populate('checkIn.checkedInBy', 'firstName lastName')
      .populate('checkOut.checkedOutBy', 'firstName lastName')
      .sort({ 'dates.checkIn': -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Booking.countDocuments(query);

    res.json({
      bookings,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
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
    const booking = await Booking.findById(req.params.id)
      .populate('property')
      .populate('checkIn.checkedInBy', 'firstName lastName')
      .populate('checkOut.checkedOutBy', 'firstName lastName')
      .populate('communications.sentBy', 'firstName lastName');
    
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    
    res.json(booking);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/bookings
// @desc    Create new booking (manual/domestic)
// @access  Private (Admin/Property Manager)
router.post('/', auth, authorize('admin', 'property-manager'), [
  body('property').notEmpty().withMessage('Property is required'),
  body('guest.firstName').trim().notEmpty().withMessage('Guest first name is required'),
  body('guest.lastName').trim().notEmpty().withMessage('Guest last name is required'),
  body('guest.email').isEmail().withMessage('Valid email is required'),
  body('dates.checkIn').isISO8601().withMessage('Valid check-in date is required'),
  body('dates.checkOut').isISO8601().withMessage('Valid check-out date is required'),
  body('pricing.totalAmount').isFloat({ min: 0 }).withMessage('Total amount must be positive')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const checkIn = moment(req.body.dates.checkIn);
    const checkOut = moment(req.body.dates.checkOut);
    const nights = checkOut.diff(checkIn, 'days');

    if (nights <= 0) {
      return res.status(400).json({ message: 'Check-out date must be after check-in date' });
    }

    const booking = new Booking({
      ...req.body,
      dates: {
        ...req.body.dates,
        nights
      },
      platform: {
        name: 'domestic',
        ...req.body.platform
      }
    });

    await booking.save();
    await booking.populate('property', 'name address');

    res.status(201).json(booking);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/bookings/:id/checkin
// @desc    Process check-in
// @access  Private (Admin/Property Manager)
router.put('/:id/checkin', auth, authorize('admin', 'property-manager'), async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    booking.checkIn = {
      actualTime: req.body.actualTime || new Date(),
      checkedInBy: req.user._id,
      notes: req.body.notes || '',
      damages: req.body.damages || '',
      keyHandedOver: req.body.keyHandedOver || false
    };
    
    booking.status = 'checked-in';
    await booking.save();
    
    await booking.populate('property', 'name address');
    await booking.populate('checkIn.checkedInBy', 'firstName lastName');

    res.json(booking);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/bookings/:id/checkout
// @desc    Process check-out
// @access  Private (Admin/Property Manager)
router.put('/:id/checkout', auth, authorize('admin', 'property-manager'), async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    booking.checkOut = {
      actualTime: req.body.actualTime || new Date(),
      checkedOutBy: req.user._id,
      notes: req.body.notes || '',
      damages: req.body.damages || '',
      cleaningNotes: req.body.cleaningNotes || '',
      keyReturned: req.body.keyReturned || false
    };
    
    booking.status = 'checked-out';
    await booking.save();
    
    await booking.populate('property', 'name address');
    await booking.populate('checkOut.checkedOutBy', 'firstName lastName');

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

    const booking = await Booking.findById(req.params.id);
    
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    booking.status = status;
    await booking.save();

    res.json({ message: 'Status updated successfully', status });
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
      query.$or = [
        { 'dates.checkIn': { $gte: new Date(startDate), $lte: new Date(endDate) } },
        { 'dates.checkOut': { $gte: new Date(startDate), $lte: new Date(endDate) } },
        { 
          'dates.checkIn': { $lte: new Date(startDate) },
          'dates.checkOut': { $gte: new Date(endDate) }
        }
      ];
    }

    const bookings = await Booking.find(query)
      .populate('property', 'name')
      .select('property guest dates status platform pricing')
      .sort({ 'dates.checkIn': 1 });

    res.json(bookings);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/bookings/sync-batch
// @desc    Upsert an array of externally sourced bookings (iCal/manual injection) into DB
// @access  Private (Admin/Property Manager)
router.post('/sync-batch', auth, authorize('admin', 'property-manager'), async (req, res) => {
  try {
    const incoming = Array.isArray(req.body.bookings) ? req.body.bookings : [];
    if (!incoming.length) {
      return res.status(400).json({ message: 'No bookings provided', inserted:0, updated:0, skipped:0 });
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

// Export to Supabase endpoint (admin only)
router.post('/export-supabase', auth, authorize('admin', 'property-manager'), async (req, res) => {
  try {
    const result = await syncMongoToSupabase();
    if(!result.ok) return res.status(500).json(result);
    res.json({ message: 'Supabase sync complete', inserted: result.inserted });
  } catch (e) {
    console.error('Supabase export error', e);
    res.status(500).json({ message: 'Supabase export failed', error: e.message });
  }
});
