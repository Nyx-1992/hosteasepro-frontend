// Service to sync Mongo bookings into Supabase bookings table
// Uses server-side service role key for privileged upsert (DO NOT expose service key to client).
// Env vars required:
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// If only anon key available, restrict operations or implement user auth-based inserts.

const { createClient } = require('@supabase/supabase-js');
const Booking = require('../models/Booking');
const Property = require('../models/Property');

function initSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY; // use service role for bypassing RLS if needed
  if (!url || !key) {
    console.warn('[SupabaseSync] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return null;
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// Normalize platform naming to match Supabase choices
function normalizePlatform(p) {
  if (!p) return 'direct';
  if (p === 'booking.com' || p === 'booking') return 'booking.com';
  return p;
}

// Fetch mongo bookings and map to EXISTING Supabase legacy schema (checkin_date / checkout_date etc.)
async function fetchMongoBookings() {
  const bookings = await Booking.find({ isActive: true }).populate('property', 'name');
  return bookings.map(b => {
    const checkIn = b.dates?.checkIn ? new Date(b.dates.checkIn) : null;
    const checkOut = b.dates?.checkOut ? new Date(b.dates.checkOut) : null;
    const nights = (checkIn && checkOut) ? Math.max(1, Math.round((checkOut - checkIn) / (1000*60*60*24))) : null;
    return {
      property_name: b.property?.name || 'Unknown',
      platform: normalizePlatform(b.platform?.name || b.platform),
      guest_name: [b.guest?.firstName, b.guest?.lastName].filter(Boolean).join(' ').trim() || 'Guest',
      guest_email: b.guest?.email || null,
      guest_phone: b.guest?.phone || null,
      checkin_date: checkIn ? checkIn.toISOString().slice(0,10) : null, // date only
      checkout_date: checkOut ? checkOut.toISOString().slice(0,10) : null, // date only
      nights,
      booking_reference: b.platform?.bookingId || b.platform?.confirmationNumber || b._id.toString(),
      total_amount: b.pricing?.totalAmount || 0,
      currency: b.pricing?.currency || 'ZAR',
      guest_count: b.guest?.numberOfGuests || 1,
      status: b.status || 'confirmed',
      special_requests: b.guest?.specialRequests || null,
      notes: null,
      domestic_service_arranged: false,
      access_codes_sent: false,
      welcome_package_sent: false,
      created_at: b.createdAt || new Date(),
      updated_at: new Date(),
      property_id: null // cannot reliably map Mongo ObjectId to Supabase integer without a lookup table
    };
  }).filter(r => r.checkin_date && r.checkout_date);
}

async function upsertBookings(supabase, rows) {
  // Ensure composite unique index exists for legacy schema (run separately if needed):
  // CREATE UNIQUE INDEX IF NOT EXISTS bookings_unique_span_legacy ON public.bookings (property_name, platform, checkin_date, checkout_date);
  const CHUNK = 100;
  let attempted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from('bookings')
      .upsert(chunk, { onConflict: 'property_name,platform,checkin_date,checkout_date' });
    if (error) {
      console.error('[SupabaseSync] Upsert error (legacy schema):', error);
      throw error;
    }
    attempted += chunk.length;
  }
  return attempted;
}

async function syncMongoToSupabase() {
  const supabase = initSupabaseAdmin();
  if (!supabase) return { ok: false, message: 'Supabase not configured' };
  const mongoRows = await fetchMongoBookings();
  if (!mongoRows.length) return { ok: true, inserted: 0, message: 'No active mongo bookings to sync' };
  const inserted = await upsertBookings(supabase, mongoRows);
  return { ok: true, inserted, message: 'Legacy schema sync complete' };
}

module.exports = { syncMongoToSupabase };
