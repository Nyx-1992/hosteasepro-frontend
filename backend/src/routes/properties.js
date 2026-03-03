const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth, authorize } = require('../middleware/auth');
const { createClient } = require('@supabase/supabase-js');

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials');
  return createClient(url, key);
}

const router = express.Router();

// @route   GET /api/properties
// @desc    Get all properties
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const supabase = getSupabaseClient();
    const { data: properties, error } = await supabase
      .from('properties')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });
    if (error) throw error;
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
    const supabase = getSupabaseClient();
    const { data: property, error } = await supabase
      .from('properties')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw error;
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
    const supabase = getSupabaseClient();
    const insertData = {
      ...req.body,
      owner_id: req.user.userId,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    const { data: property, error } = await supabase
      .from('properties')
      .insert([insertData])
      .select()
      .single();
    if (error) throw error;
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
    const supabase = getSupabaseClient();
    const { data: property, error: findError } = await supabase
      .from('properties')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (findError) throw findError;
    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }
    const updates = {
      ...req.body,
      updated_at: new Date().toISOString()
    };
    const { data: updated, error } = await supabase
      .from('properties')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(updated);
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
    const supabase = getSupabaseClient();
    const { data: property, error: findError } = await supabase
      .from('properties')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (findError) throw findError;
    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }
    const { error } = await supabase
      .from('properties')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', req.params.id);
    if (error) throw error;
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
    const supabase = getSupabaseClient();
    const { data: property, error: findError } = await supabase
      .from('properties')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (findError) throw findError;
    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }
    const newIntegrations = {
      ...property.platform_integrations,
      ...req.body
    };
    const { data: updated, error } = await supabase
      .from('properties')
      .update({ platform_integrations: newIntegrations, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(updated.platform_integrations);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
