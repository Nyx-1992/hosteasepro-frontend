const express = require('express');
const { auth, authorize } = require('../middleware/auth');
const Invoice = require('../models/Invoice');

const router = express.Router();

// @route   GET /api/invoices
// @desc    Get all invoices
// @access  Private (Admin/Property Manager)
router.get('/', auth, authorize('admin', 'property-manager'), async (req, res) => {
  try {
    const { status, property, page = 1, limit = 20 } = req.query;
    
    let query = {};
    if (status) query.status = status;
    if (property) query.property = property;

    const invoices = await Invoice.find(query)
      .populate('property', 'name')
      .populate('booking', 'guest dates')
      .populate('createdBy', 'firstName lastName')
      .sort({ issueDate: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Invoice.countDocuments(query);

    res.json({
      invoices,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/invoices
// @desc    Create new invoice
// @access  Private (Admin/Property Manager)
router.post('/', auth, authorize('admin', 'property-manager'), async (req, res) => {
  try {
    const invoice = new Invoice({
      ...req.body,
      createdBy: req.user._id
    });

    await invoice.save();
    await invoice.populate('property', 'name');

    res.status(201).json(invoice);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
