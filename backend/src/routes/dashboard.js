const express = require('express');
const { auth } = require('../middleware/auth');
const supabaseDashboard = require('../services/supabaseDashboard');

const router = express.Router();

// @route   GET /api/dashboard
// @desc    Get dashboard overview data
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const result = await supabaseDashboard.getDashboardOverview();
    if (result.error) throw result.error;
    res.json(result);
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
