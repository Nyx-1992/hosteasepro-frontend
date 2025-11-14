const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth, authorize } = require('../middleware/auth');
const Property = require('../models/Property');

const router = express.Router();

// @route   GET /api/properties
// @desc    Get all properties
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const properties = await Property.find({ isActive: true })
      .populate('owner', 'firstName lastName email')
      .sort({ name: 1 });
    
    res.json(properties);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/properties/:id
// @desc    Get property by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const property = await Property.findById(req.params.id)
      .populate('owner', 'firstName lastName email');
    
    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }
    
    res.json(property);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/properties
// @desc    Create new property
// @access  Private (Admin only)
router.post('/', auth, authorize('admin'), [
  body('name').trim().notEmpty().withMessage('Property name is required'),
  body('address.street').trim().notEmpty().withMessage('Street address is required'),
  body('address.city').trim().notEmpty().withMessage('City is required'),
  body('address.province').trim().notEmpty().withMessage('Province is required'),
  body('bedrooms').isInt({ min: 0 }).withMessage('Bedrooms must be a non-negative number'),
  body('bathrooms').isInt({ min: 0 }).withMessage('Bathrooms must be a non-negative number'),
  body('maxGuests').isInt({ min: 1 }).withMessage('Maximum guests must be at least 1'),
  body('pricing.basePrice').isFloat({ min: 0 }).withMessage('Base price must be a positive number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const property = new Property({
      ...req.body,
      owner: req.user._id
    });

    await property.save();
    await property.populate('owner', 'firstName lastName email');

    res.status(201).json(property);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/properties/:id
// @desc    Update property
// @access  Private (Admin only)
router.put('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    
    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }

    Object.assign(property, req.body);
    await property.save();
    await property.populate('owner', 'firstName lastName email');

    res.json(property);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/properties/:id
// @desc    Soft delete property
// @access  Private (Admin only)
router.delete('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    
    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }

    property.isActive = false;
    await property.save();

    res.json({ message: 'Property deactivated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/properties/:id/platforms
// @desc    Update platform integrations for a property
// @access  Private (Admin only)
router.put('/:id/platforms', auth, authorize('admin'), async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    
    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }

    property.platformIntegrations = {
      ...property.platformIntegrations,
      ...req.body
    };

    await property.save();
    res.json(property.platformIntegrations);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
