const express = require('express');
const { auth } = require('../middleware/auth');
const Booking = require('../models/Booking');
const Property = require('../models/Property');
const FinancialRecord = require('../models/FinancialRecord');
const moment = require('moment');

const router = express.Router();

// @route   GET /api/dashboard
// @desc    Get dashboard overview data
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const today = moment().startOf('day');
    const thirtyDaysAgo = moment().subtract(30, 'days').startOf('day');
    
    // Current bookings overview
    const currentBookings = await Booking.aggregate([
      {
        $match: {
          isActive: true,
          'dates.checkIn': { $lte: today.toDate() },
          'dates.checkOut': { $gte: today.toDate() }
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Upcoming check-ins (next 7 days)
    const upcomingCheckIns = await Booking.find({
      isActive: true,
      'dates.checkIn': {
        $gte: today.toDate(),
        $lte: moment().add(7, 'days').toDate()
      }
    })
    .populate('property', 'name')
    .sort({ 'dates.checkIn': 1 })
    .limit(10);

    // Upcoming check-outs (next 7 days)
    const upcomingCheckOuts = await Booking.find({
      isActive: true,
      'dates.checkOut': {
        $gte: today.toDate(),
        $lte: moment().add(7, 'days').toDate()
      }
    })
    .populate('property', 'name')
    .sort({ 'dates.checkOut': 1 })
    .limit(10);

    // Revenue overview (last 30 days)
    const revenueData = await FinancialRecord.aggregate([
      {
        $match: {
          type: 'income',
          date: { $gte: thirtyDaysAgo.toDate() }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$date' }
          },
          total: { $sum: '$amount' }
        }
      },
      { $sort: { '_id': 1 } }
    ]);

    // Property occupancy rates
    const propertyStats = await Property.aggregate([
      {
        $lookup: {
          from: 'bookings',
          localField: '_id',
          foreignField: 'property',
          as: 'bookings'
        }
      },
      {
        $project: {
          name: 1,
          totalBookings: {
            $size: {
              $filter: {
                input: '$bookings',
                cond: {
                  $and: [
                    { $eq: ['$$this.isActive', true] },
                    { $gte: ['$$this.dates.checkIn', thirtyDaysAgo.toDate()] }
                  ]
                }
              }
            }
          },
          activeBookings: {
            $size: {
              $filter: {
                input: '$bookings',
                cond: {
                  $and: [
                    { $eq: ['$$this.isActive', true] },
                    { $eq: ['$$this.status', 'checked-in'] }
                  ]
                }
              }
            }
          }
        }
      }
    ]);

    // Recent activity (last 10 bookings)
    const recentBookings = await Booking.find({ isActive: true })
      .populate('property', 'name')
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({
      currentBookings,
      upcomingCheckIns,
      upcomingCheckOuts,
      revenueData,
      propertyStats,
      recentBookings
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/dashboard/stats
// @desc    Get key performance indicators
// @access  Private
router.get('/stats', auth, async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const daysAgo = moment().subtract(parseInt(period), 'days').startOf('day');

    const stats = await Promise.all([
      // Total revenue
      FinancialRecord.aggregate([
        {
          $match: {
            type: 'income',
            date: { $gte: daysAgo.toDate() }
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$amount' }
          }
        }
      ]),

      // Total bookings
      Booking.countDocuments({
        isActive: true,
        createdAt: { $gte: daysAgo.toDate() }
      }),

      // Average booking value
      Booking.aggregate([
        {
          $match: {
            isActive: true,
            createdAt: { $gte: daysAgo.toDate() }
          }
        },
        {
          $group: {
            _id: null,
            averageValue: { $avg: '$pricing.totalAmount' }
          }
        }
      ]),

      // Occupancy rate
      Booking.aggregate([
        {
          $match: {
            isActive: true,
            'dates.checkIn': { $gte: daysAgo.toDate() }
          }
        },
        {
          $group: {
            _id: null,
            totalNights: { $sum: '$dates.nights' }
          }
        }
      ])
    ]);

    const totalProperties = await Property.countDocuments({ isActive: true });
    const occupancyRate = stats[3][0] ? 
      (stats[3][0].totalNights / (totalProperties * parseInt(period)) * 100) : 0;

    res.json({
      totalRevenue: stats[0][0]?.total || 0,
      totalBookings: stats[1],
      averageBookingValue: stats[2][0]?.averageValue || 0,
      occupancyRate: occupancyRate.toFixed(1)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
