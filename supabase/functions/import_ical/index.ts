// Supabase Edge Function (Deno) to import iCal feeds stored in public.ical_feeds
// Deploy via: supabase functions deploy import_ical --project-ref <project-ref>
// Invoke via: POST https://<project>.functions.supabase.co/import_ical
// Requires service role or JWT with admin rights due to RLS on ical_feeds

// Permissions: keep this restricted; optionally create a function secret key

import 'https://deno.land/x/dotenv/load.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_KEY');
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env');
}

interface ICalFeed { id: string; org_id: string; property_id: string; platform: string; feed_url: string; }

async function fetchFeeds(): Promise<ICalFeed[]> {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/ical_feeds?select=id,org_id,property_id,platform,feed_url&is_active=eq.true`, {
    headers: { apikey: SUPABASE_SERVICE_KEY!, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` }
  });
  if (!resp.ok) throw new Error(`Fetch feeds failed: ${resp.status}`);
  return await resp.json();
}

function parseIcs(content: string) {
  const lines = content.split(/\r?\n/);
  const events: any[] = [];
  let current: any = {};
  for (const line of lines) {
    if (line.startsWith('BEGIN:VEVENT')) current = {};
    else if (line.startsWith('END:VEVENT')) { if (current.start && current.end) events.push(current); current = {}; }
    else if (/^DTSTART/.test(line)) current.start = line.split(':')[1];
    else if (/^DTEND/.test(line)) current.end = line.split(':')[1];
    else if (line.startsWith('SUMMARY:')) current.summary = line.substring(8).trim();
    else if (line.startsWith('DESCRIPTION:') && !current.summary) current.summary = line.substring(12).trim();
  }
  return events;
}

function parseDate(raw: string): Date | null {
  if (!raw) return null;
  try {
    if (/Z$/.test(raw)) return new Date(raw.replace(/Z$/, 'Z'));
    if (/^\d{8}$/.test(raw)) {
      const year = raw.substring(0,4); const month = raw.substring(4,6); const day = raw.substring(6,8);
      return new Date(`${year}-${month}-${day}T00:00:00Z`);
    }
    return new Date(raw);
  } catch { return null; }
}

function splitGuest(summary: string | undefined) {
  if (!summary) return { first: null, last: null };
  const cleaned = summary.replace('Reservation:', '').trim();
  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

async function upsertBookings(rows: any[]) {
  if (rows.length === 0) return 0;
  // Batch to avoid large payload; use conflict keys
  const batchSize = 300;
  for (let i=0; i<rows.length; i+=batchSize) {
    const slice = rows.slice(i, i+batchSize);
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/bookings?on_conflict=org_id,property_id,platform,check_in,check_out`, {
      method: 'POST',
      headers: { apikey: SUPABASE_SERVICE_KEY!, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, Prefer: 'return=minimal', 'Content-Type': 'application/json' },
      body: JSON.stringify(slice)
    });
    if (!resp.ok && resp.status !== 409) {
      const text = await resp.text();
      console.error('Upsert error slice', i, resp.status, text);
    }
  }
  return rows.length;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Use POST', { status: 405 });
  try {
    const feeds = await fetchFeeds();
    const allRows: any[] = [];
    for (const f of feeds) {
      const r = await fetch(f.feed_url);
      if (!r.ok) { console.warn('Failed feed', f.platform, f.property_id); continue; }
      const content = await r.text();
      const events = parseIcs(content);
      for (const ev of events) {
        const start = parseDate(ev.start); const end = parseDate(ev.end);
        if (!start || !end) continue;
        const guest = splitGuest(ev.summary);
        allRows.push({
          org_id: f.org_id,
          property_id: f.property_id,
          property_name: null,
          platform: f.platform,
          guest_first_name: guest.first,
          guest_last_name: guest.last,
          check_in: start.toISOString(),
          check_out: end.toISOString(),
          status: 'confirmed',
          total_amount: null,
          currency: 'ZAR'
        });
      }
    }
    // Deduplicate
    const dedupMap = new Map<string, any>();
    for (const r of allRows) {
      const k = `${r.property_id}|${r.platform}|${r.check_in}|${r.check_out}`;
      if (!dedupMap.has(k)) dedupMap.set(k, r);
    }
    const finalRows = Array.from(dedupMap.values());
    const count = await upsertBookings(finalRows);
    return new Response(JSON.stringify({ feeds: feeds.length, imported: count }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
