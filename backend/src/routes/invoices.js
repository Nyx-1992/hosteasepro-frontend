const express = require('express');
const { auth, authorize } = require('../middleware/auth');
const { createClient } = require('@supabase/supabase-js');

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials');
  return createClient(url, key);
}

const router = express.Router();

// @route   GET /api/invoices
// @desc    Get all invoices
// @access  Private (Admin/Property Manager)
router.get('/', auth, authorize('admin', 'property-manager'), async (req, res) => {
  try {
    const { status, property, page = 1, limit = 20 } = req.query;
    const supabase = getSupabaseClient();
    let query = supabase.from('invoices').select('*');
    if (status) query = query.eq('status', status);
    if (property) query = query.eq('property_id', property);
    query = query.order('issue_date', { ascending: false });
    // Pagination
    const from = (page - 1) * limit;
    const to = from + Number(limit) - 1;
    query = query.range(from, to);
    const { data: invoices, error } = await query;
    if (error) throw error;
    // Get total count
    const { count, error: countError } = await supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .eq('status', status || '')
      .eq('property_id', property || '');
    if (countError) throw countError;
    res.json({
      invoices,
      totalPages: Math.ceil((count || 0) / limit),
      currentPage: Number(page),
      total: count || 0
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
    const supabase = getSupabaseClient();
    const insertData = {
      ...req.body,
      created_by: req.user.userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    const { data: invoice, error } = await supabase
      .from('invoices')
      .insert([insertData])
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(invoice);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
