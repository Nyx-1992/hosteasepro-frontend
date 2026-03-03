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

// @route   GET /api/financial/records
// @desc    Get financial records with filtering
// @access  Private (Admin/Property Manager)
router.get('/records', auth, authorize('admin', 'property-manager'), async (req, res) => {
  try {
    const { type, category, property, startDate, endDate, page = 1, limit = 50 } = req.query;
    const supabase = getSupabaseClient();
    let query = supabase.from('financial_records').select('*');
    if (type) query = query.eq('type', type);
    if (category) query = query.eq('category', category);
    if (property) query = query.eq('property_id', property);
    if (startDate) query = query.gte('date', startDate);
    if (endDate) query = query.lte('date', endDate);
    query = query.order('date', { ascending: false });
    // Pagination
    const from = (page - 1) * limit;
    const to = from + Number(limit) - 1;
    query = query.range(from, to);
    const { data: records, error } = await query;
    if (error) throw error;
    // Get total count
    const { count, error: countError } = await supabase
      .from('financial_records')
      .select('*', { count: 'exact', head: true })
      .eq('type', type || '')
      .eq('category', category || '')
      .eq('property_id', property || '');
    if (countError) throw countError;
    res.json({
      records,
      totalPages: Math.ceil((count || 0) / limit),
      currentPage: Number(page),
      total: count || 0
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
    const supabase = getSupabaseClient();
    let query = supabase.from('financial_records').select('*');
    if (property) query = query.eq('property_id', property);
    if (startDate) query = query.gte('date', startDate);
    if (endDate) query = query.lte('date', endDate);
    const { data: records, error } = await query;
    if (error) throw error;
    // Summary by type
    const summary = {};
    const categoryBreakdown = {};
    for (const rec of records) {
      // By type
      if (!summary[rec.type]) summary[rec.type] = { total: 0, count: 0 };
      summary[rec.type].total += rec.amount;
      summary[rec.type].count += 1;
      // By type+category
      const catKey = `${rec.type}|${rec.category}`;
      if (!categoryBreakdown[catKey]) categoryBreakdown[catKey] = { type: rec.type, category: rec.category, total: 0, count: 0 };
      categoryBreakdown[catKey].total += rec.amount;
      categoryBreakdown[catKey].count += 1;
    }
    res.json({
      summary: Object.entries(summary).map(([type, val]) => ({ type, ...val })),
      categoryBreakdown: Object.values(categoryBreakdown)
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
    const supabase = getSupabaseClient();
    const insertData = {
      ...req.body,
      created_by: req.user.userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    const { data: record, error } = await supabase
      .from('financial_records')
      .insert([insertData])
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(record);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
