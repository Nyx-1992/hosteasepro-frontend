// api/calendar/speranta.ics.js
// Outbound iCal feed for Speranta Flat
// Paste this URL into Airbnb/Booking.com/LekkeSlaap as an external calendar:
// https://hosteasepro-frontend.vercel.app/api/calendar/speranta.ics

export const config = { runtime: 'edge' };

// Environment-driven: Vercel env vars SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// (Production = prod project, Preview/staging = hep-staging). Same file on every branch.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PROPERTY_ID = 'e9737638-d83a-4947-940a-8746789e4d9f';
const PROPERTY_NAME = 'Speranta Flat';
const FEED_ID = 'speranta';

export default async function handler(req) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return new Response('Server not configured — missing SUPABASE_URL or service role key', { status: 500 });
  }
  return generateFeed(PROPERTY_ID, PROPERTY_NAME, FEED_ID);
}

async function generateFeed(propertyId, propertyName, feedId) {
  try {
    // Fetch active, current-and-future bookings for this property. Past
    // stays don't affect availability on other platforms, so they're
    // excluded rather than exported as dead history.
    const todayStr = new Date().toISOString().slice(0, 10);
    const url = `${SUPABASE_URL}/rest/v1/bookings?property_id=eq.${propertyId}&is_active=eq.true&status=in.(confirmed,pending,checked-in,checked-out,owner,blocked)&check_out_date=gte.${todayStr}&select=id,guest_name,check_in_date,check_out_date,status,platform,notes&order=check_in_date.asc`;

    const res = await fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) throw new Error(`Supabase error: ${res.status}`);
    const bookings = await res.json();

    const now = formatICalDate(new Date());
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      `PRODID:-//S&N Apt Management//HostEase Pro//EN`,
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${propertyName} — Blocked Dates`,
      'X-WR-TIMEZONE:Africa/Johannesburg',
    ];

    let emitted = 0;
    for (const b of bookings) {
      if (!b.check_in_date || !b.check_out_date) continue;

      // Caretaker residency placeholders (e.g. "Tino Caretaker") aren't
      // guest bookings — the app's own isCaretaker() already excludes them
      // from the Dashboard/invoice picker/occupancy views, but this feed
      // is a separate serverless endpoint with no access to that client-
      // side helper, so the check is duplicated here. Same match logic as
      // isCaretaker() in demo/index_fixed.html.
      const nameLower = (b.guest_name || b.notes || '').toLowerCase();
      if (nameLower.includes('caretaker') || nameLower.includes('tino')) continue;

      // A single event spanning many months is virtually always bad data
      // (e.g. a malformed inbound iCal import) rather than a genuine
      // closure — publishing it would blank out the whole calendar on
      // every connected platform. Found in production 2026-07-29: a TV
      // House 'blocked' row spanning 2026-02-01 to 2026-12-31 did exactly
      // that on LekkeSlaap. Skip anything over ~4 months instead.
      const nights = Math.round((new Date(b.check_out_date) - new Date(b.check_in_date)) / 86400000);
      if (nights > 120) continue;

      // For iCal: DTSTART = check-in date, DTEND = check-out date (exclusive)
      const dtStart = b.check_in_date.replace(/-/g, '');
      const dtEnd   = b.check_out_date.replace(/-/g, '');

      const summary = b.status === 'owner'   ? 'Owner Stay — Not Available' :
                      b.status === 'blocked'  ? 'Not Available' :
                      'Not Available'; // Never expose guest names to other platforms

      const uid = `hep-${feedId}-${b.id}@snapartments.co.za`;

      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${uid}`);
      lines.push(`DTSTAMP:${now}`);
      lines.push(`DTSTART;VALUE=DATE:${dtStart}`);
      lines.push(`DTEND;VALUE=DATE:${dtEnd}`);
      lines.push(`SUMMARY:${summary}`);
      lines.push(`STATUS:CONFIRMED`);
      lines.push('END:VEVENT');
      emitted++;
    }

    // Some platforms reject empty feeds — add a placeholder if no events
    if (emitted === 0) {
      const today = new Date().toISOString().slice(0,10).replace(/-/g,'');
      lines.push('BEGIN:VEVENT');
      lines.push('UID:hep-speranta-placeholder@snapartments.co.za');
      lines.push('DTSTAMP:' + formatICalDate(new Date()));
      lines.push('DTSTART;VALUE=DATE:' + today);
      lines.push('DTEND;VALUE=DATE:' + today);
      lines.push('SUMMARY:Calendar Active');
      lines.push('STATUS:CANCELLED');
      lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    const icsContent = lines.join('\r\n');

    return new Response(icsContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="${feedId}.ics"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (err) {
    return new Response(`Error: ${err.message}`, { status: 500 });
  }
}

function formatICalDate(date) {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}
