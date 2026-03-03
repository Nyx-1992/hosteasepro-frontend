// Service for interacting with Supabase knowledge_base table
// All functions are async and return { data, error }

const { createClient } = require('@supabase/supabase-js');

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env vars missing');
  return createClient(url, key);
}

const TABLE = 'knowledge_base';

async function listArticles({ category, search, page = 1, limit = 20 }) {
  const supabase = getSupabaseClient();
  let query = supabase.from(TABLE).select('*', { count: 'exact' }).eq('is_published', true);
  if (category) query = query.eq('category', category);
  if (search) query = query.textSearch('title', search, { type: 'plain' });
  query = query.order('priority', { ascending: false }).order('updated_at', { ascending: false });
  query = query.range((page - 1) * limit, page * limit - 1);
  const { data, count, error } = await query;
  return { data, count, error };
}

async function getArticleById(id) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).single();
  return { data, error };
}

async function createArticle(article) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from(TABLE).insert([article]).select().single();
  return { data, error };
}

async function updateArticle(id, updates) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from(TABLE).update(updates).eq('id', id).select().single();
  return { data, error };
}

async function deleteArticle(id) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  return { error };
}

module.exports = {
  listArticles,
  getArticleById,
  createArticle,
  updateArticle,
  deleteArticle
};
