// Import bookings from ICS feeds into Supabase
// Usage: (PowerShell)
// $env:SUPABASE_URL='https://xyz.supabase.co'; $env:SUPABASE_SERVICE_KEY='service-role-key'; 
// node import_ical_bookings.js --feed airbnb=https://calendar.airbnb.com/ical/XXX.ics --property "Demo Apartment" --platform airbnb
// Multiple feeds: --feed airbnb=url1 --feed booking=url2 ...
// Optional: --daysPast 120 to synthesize past bookings from ICS if present.

import fs from 'fs';
import path from 'path';
import process from 'process';
import ical from 'node-ical';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY; // service role for bypassing RLS
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

function parseArgsOrConfig() {
  const args = process.argv.slice(2);
  const feedsArg = [];
  let propertyName = null;
  let daysPast = null;
  let configPath = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--feed') {
      const pair = args[++i];
      const [platform, url] = pair.split('=');
      feedsArg.push({ platform, url });
    } else if (a === '--property') {
      propertyName = args[++i];
    } else if (a === '--daysPast') {
      daysPast = parseInt(args[++i], 10) || 0;
    } else if (a === '--config') {
      configPath = args[++i];
    }
  }
  if (configPath) {
    const resolved = path.resolve(configPath);
    if (!fs.existsSync(resolved)) {
      console.error('Config file not found:', resolved); process.exit(1);
    }
    const raw = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
    const feeds = raw.feeds || [];
    if (feeds.length === 0) { console.error('Config has no feeds'); process.exit(1); }
    return { feeds, daysPast: daysPast ?? raw.daysPast ?? 0, propertyName: null, fromConfig: true };
  }
  if (feedsArg.length === 0) {
    console.error('Provide --config feeds.config.json OR at least one --feed platform=url');
    process.exit(1);
  }
  if (!propertyName) {
    console.error('Provide --property "Property Name" when using individual --feed arguments');
    process.exit(1);
  }
  // Wrap into unified feed objects referencing one property
  const feeds = feedsArg.map(f => ({ ...f, property: propertyName }));
  return { feeds, daysPast: daysPast ?? 0, propertyName, fromConfig: false };
}

async function ensureOrgAndProperty(propertyName) {
  // Single-org assumption; fetch first org
  const { data: orgRows, error: orgErr } = await supabase.from('organizations').select('id').limit(1);
  if (orgErr) throw orgErr;
  if (!orgRows || orgRows.length === 0) throw new Error('No organization rows found. Seed organizations first.');
  const orgId = orgRows[0].id;
  // Find property
  const { data: props } = await supabase.from('properties').select('id').eq('org_id', orgId).eq('name', propertyName).limit(1);
  if (props && props.length > 0) return { orgId, propertyId: props[0].id };
  // Create property
  const { data: inserted, error: insErr } = await supabase.from('properties').insert({ org_id: orgId, name: propertyName, status: 'active' }).select('id').limit(1);
  if (insErr) throw insErr;
  return { orgId, propertyId: inserted[0].id };
}

function extractGuest(summary) {
  if (!summary) return { first: null, last: null };
  // Airbnb examples often: 'Reservation: John Doe' or 'John Doe' or 'Jane'
  let s = summary.replace('Reservation:', '').trim();
  const parts = s.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

function normalizeEventSpan(ev) {
  // ICS DTEND is usually checkout date/time; we trust triggers to adjust midnight times.
  return { checkIn: ev.start, checkOut: ev.end };
}

async function upsertBookings(records) {
  if (records.length === 0) return { count: 0 };
  // Upsert based on unique span index
  const { error } = await supabase.from('bookings').upsert(records, {
    onConflict: 'org_id,property_id,platform,check_in,check_out'
  });
  if (error) throw error;
  return { count: records.length };
}

function platformSpecificGuestCleanup(platform, first, last) {
  if (!first && !last) return { first, last };
  // Example Airbnb sometimes includes parentheses or codes
  const cleanup = s => s ? s.replace(/\(.*?\)/g, '').trim() : s;
  return { first: cleanup(first), last: cleanup(last) };
}

async function processFeed(feed, propertyCtx, daysPast) {
  console.log(`Fetching ICS for platform=${feed.platform}`);
  const data = await ical.async.fromURL(feed.url);
  const now = new Date();
  const cutoffPast = daysPast > 0 ? new Date(now.getTime() - daysPast * 86400000) : null;
  const rows = [];
  for (const k of Object.keys(data)) {
    const ev = data[k];
    if (ev.type !== 'VEVENT') continue;
    const { checkIn, checkOut } = normalizeEventSpan(ev);
    if (!checkIn || !checkOut) continue;
    // Filter optional past range
    if (cutoffPast && checkOut < cutoffPast) continue;
    let { first, last } = extractGuest(ev.summary || ev.description || '');
    ({ first, last } = platformSpecificGuestCleanup(feed.platform, first, last));
    rows.push({
      org_id: propertyCtx.orgId,
      property_id: propertyCtx.propertyId,
      property_name: null, // trigger not needed; we already have property_id
      platform: feed.platform,
      guest_first_name: first,
      guest_last_name: last,
      check_in: checkIn.toISOString(),
      check_out: checkOut.toISOString(),
      status: 'confirmed',
      total_amount: null,
      currency: 'ZAR'
    });
  }
  return rows;
}

async function main() {
  const { feeds, daysPast, fromConfig } = parseArgsOrConfig();
  let aggregate = [];
  for (const feed of feeds) {
    const propertyCtx = await ensureOrgAndProperty(feed.property);
    const rows = await processFeed(feed, propertyCtx, daysPast);
    console.log(`Parsed ${rows.length} events from ${feed.platform} for property="${feed.property}"`);
    aggregate = aggregate.concat(rows);
  }
  // Deduplicate across all properties/platforms
  const key = r => `${r.org_id}|${r.property_id}|${r.platform}|${r.check_in}|${r.check_out}`;
  const dedupMap = new Map();
  aggregate.forEach(r => { if (!dedupMap.has(key(r))) dedupMap.set(key(r), r); });
  const finalRows = Array.from(dedupMap.values());
  console.log(`Upserting ${finalRows.length} unique booking spans across ${feeds.length} feeds...`);
  const { count } = await upsertBookings(finalRows);
  console.log(`Done. Upsert attempted for ${count} rows.`);
  console.log('Next: review bookings table and enrich missing financials, guest details, and platform fees.');
  if (fromConfig) {
    console.log('Config-driven run complete. To re-run: node import_ical_bookings.js --config feeds.config.json');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
