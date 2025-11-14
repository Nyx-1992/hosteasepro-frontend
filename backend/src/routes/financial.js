const express = require('express');
const { auth, authorize } = require('../middleware/auth');
const FinancialRecord = require('../models/FinancialRecord');
const Booking = require('../models/Booking');
const Property = require('../models/Property');

const router = express.Router();

// @route   GET /api/financial/records
// @desc    Get financial records with filtering
// @access  Private (Admin/Property Manager)
router.get('/records', auth, authorize('admin', 'property-manager'), async (req, res) => {
  try {
    const { type, category, property, startDate, endDate, page = 1, limit = 50 } = req.query;
    
    let query = {};
    
    if (type) query.type = type;
    if (category) query.category = category;
    if (property) query.property = property;
    
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const records = await FinancialRecord.find(query)
      .populate('property', 'name')
      .populate('booking', 'guest dates')
      .populate('createdBy', 'firstName lastName')
      .sort({ date: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await FinancialRecord.countDocuments(query);

    res.json({
      records,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/financial/summary
// @desc    Get financial summary/dashboard
// @access  Private (Admin/Property Manager)
router.get('/summary', auth, authorize('admin', 'property-manager'), async (req, res) => {
  try {
    const { startDate, endDate, property } = req.query;
    
    let matchQuery = {};
    if (property) matchQuery.property = property;
    if (startDate || endDate) {
      matchQuery.date = {};
      if (startDate) matchQuery.date.$gte = new Date(startDate);
      if (endDate) matchQuery.date.$lte = new Date(endDate);
    }

    const summary = await FinancialRecord.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$type',
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    const categoryBreakdown = await FinancialRecord.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: { type: '$type', category: '$category' },
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      summary,
      categoryBreakdown
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/financial/records
// @desc    Create new financial record
// @access  Private (Admin/Property Manager)
router.post('/records', auth, authorize('admin', 'property-manager'), async (req, res) => {
  try {
    const record = new FinancialRecord({
      ...req.body,
      createdBy: req.user._id
    });

    await record.save();
    await record.populate('property', 'name');

    res.status(201).json(record);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
