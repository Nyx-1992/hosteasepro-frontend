// Supabase Bookings Service - HostEasePro
// Handles CRUD for bookings using Supabase/Postgres

const { createClient } = require('@supabase/supabase-js');

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials');
  return createClient(url, key);
}

// Fetch all bookings (optionally by property)
async function getBookings({ propertyId } = {}) {
  const supabase = getSupabaseClient();
  let query = supabase.from('bookings').select('*');
  if (propertyId) query = query.eq('property_id', propertyId);
  const { data, error } = await query.order('checkin_date', { ascending: true });
  if (error) throw error;
  return data;
}

// Fetch single booking by ID
async function getBookingById(id) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from('bookings').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

// Create a new booking
async function createBooking(booking) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from('bookings').insert([booking]).single();
  if (error) throw error;
  return data;
}

// Update a booking
async function updateBooking(id, updates) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from('bookings').update(updates).eq('id', id).single();
  if (error) throw error;
  return data;
}

// Delete a booking
async function deleteBooking(id) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('bookings').delete().eq('id', id);
  if (error) throw error;
  return { success: true };
}

module.exports = {
  getBookings,
  getBookingById,
  createBooking,
  updateBooking,
  deleteBooking,
};
