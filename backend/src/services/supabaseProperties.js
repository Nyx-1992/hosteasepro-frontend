// Supabase Properties Service - HostEasePro
// Handles CRUD for properties using Supabase/Postgres

const { createClient } = require('@supabase/supabase-js');

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials');
  return createClient(url, key);
}

// Fetch all active properties
async function getActiveProperties() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .eq('status', 'active');
  if (error) throw error;
  return data;
}

// Fetch property by ID
async function getPropertyById(id) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

module.exports = {
  getActiveProperties,
  getPropertyById,
};
