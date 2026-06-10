// api/calendar/speranta.ics.js
// Outbound iCal feed for Speranta Flat
// Paste this URL into Airbnb/Booking.com/LekkeSlaap as an external calendar:
// https://hosteasepro-frontend.vercel.app/api/calendar/speranta.ics

export const config = { runtime: 'edge' };

const SUPABASE_URL = 'https://dkyzbzlshrxdwetykmdo.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRreXpiemxzaHJ4ZHdldHlrbWRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMwMzkyMTUsImV4cCI6MjA3ODYxNTIxNX0.d4K89mdZVzG4Rv4H44MYnhV4VlW3V1vSgbYZcjcPMQw';
const PROPERTY_ID = 'e9737638-d83a-4947-940a-8746789e4d9f';
const PROPERTY_NAME = 'Speranta Flat';
const FEED_ID = 'speranta';

export default async function handler(req) {
  return generateFeed(PROPERTY_ID, PROPERTY_NAME, FEED_ID);
}

async function generateFeed(propertyId, propertyName, feedId) {
  try {
    // Fetch all active bookings for this property
    const url = `${SUPABASE_URL}/rest/v1/bookings?property_id=eq.${propertyId}&is_active=eq.true&status=in.(confirmed,pending,checked-in,checked-out,owner,blocked)&select=id,guest_name,check_in_date,check_out_date,status,platform,notes&order=check_in_date.asc`;
    
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

    for (const b of bookings) {
      if (!b.check_in_date || !b.check_out_date) continue;

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
    }

    // Some platforms reject empty feeds — add a placeholder if no events
    if (bookings.filter(b => b.check_in_date).length === 0) {
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
