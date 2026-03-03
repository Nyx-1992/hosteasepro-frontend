// Service for dashboard data using Supabase/Postgres
const { createClient } = require('@supabase/supabase-js');

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env vars missing');
  return createClient(url, key);
}

const BOOKINGS = 'bookings';
const PROPERTIES = 'properties';
const FINANCIAL = 'financial_records';

async function getDashboardOverview() {
  const supabase = getSupabaseClient();
  const today = new Date();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sevenDays = 7 * 24 * 60 * 60 * 1000;

  // Current bookings (active today)
  const { data: currentBookings, error: currentError } = await supabase
    .from(BOOKINGS)
    .select('*')
    .eq('is_active', true)
    .lte('checkin_date', today.toISOString().slice(0,10))
    .gte('checkout_date', today.toISOString().slice(0,10));

  // Upcoming check-ins (next 7 days)
  const { data: upcomingCheckIns } = await supabase
    .from(BOOKINGS)
    .select('*')
    .eq('is_active', true)
    .gte('checkin_date', today.toISOString().slice(0,10))
    .lte('checkin_date', new Date(Date.now() + sevenDays).toISOString().slice(0,10))
    .order('checkin_date', { ascending: true })
    .limit(10);

  // Upcoming check-outs (next 7 days)
  const { data: upcomingCheckOuts } = await supabase
    .from(BOOKINGS)
    .select('*')
    .eq('is_active', true)
    .gte('checkout_date', today.toISOString().slice(0,10))
    .lte('checkout_date', new Date(Date.now() + sevenDays).toISOString().slice(0,10))
    .order('checkout_date', { ascending: true })
    .limit(10);

  // Revenue (last 30 days)
  const { data: revenueData } = await supabase
    .from(FINANCIAL)
    .select('date, amount')
    .eq('type', 'income')
    .gte('date', thirtyDaysAgo.toISOString().slice(0,10));

  // Property stats (bookings per property, last 30 days)
  const { data: propertyStats } = await supabase
    .from(PROPERTIES)
    .select('id, name');
  // Additional stats can be calculated in route

  // Recent bookings
  const { data: recentBookings } = await supabase
    .from(BOOKINGS)
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(10);

  return {
    currentBookings,
    upcomingCheckIns,
    upcomingCheckOuts,
    revenueData,
    propertyStats,
    recentBookings,
    error: currentError
  };
}

module.exports = { getDashboardOverview };
