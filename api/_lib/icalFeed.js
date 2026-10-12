// Shared outbound iCal feed generator for api/speranta-cal.js and
// api/tvhouse-cal.js — was copy-pasted identically into both (same bug
// already hand-patched twice, independently, in each copy: the caretaker-
// placeholder exclusion and the >120-night bad-data guard). Extracted here
// so a future fix only needs to happen once.
//
// The `_lib` directory name keeps Vercel from treating this file as its
// own route — anything under api/ starting with an underscore is excluded
// from Serverless Function routing, same convention used for shared
// helpers elsewhere in Vercel projects.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function formatICalDate(date) {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

export async function generateIcalFeed(propertyId, propertyName, feedId) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return new Response('Server not configured — missing SUPABASE_URL or service role key', { status: 500 });
  }
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

    // ── WHY THIS FEED PUBLISHES ONLY WHAT IS BOOKED ───────────────────────
    //
    // It briefly did more. On 2026-10-09 this started re-publishing cancelled
    // bookings as tombstones — same UID, SEQUENCE 1, STATUS:CANCELLED — so a
    // channel that only ever ADDS what it sees would release dates instead of
    // holding them for ever. The reasoning still looks sound and the output
    // was valid iCal. It is reverted anyway.
    //
    // On 2026-10-12 LekkeSlaap reported "Failed to import" for the HEP
    // calendar on BOTH listings, while its Booking.com and Airbnb imports
    // succeeded minutes earlier. This file had not been touched for months
    // before that commit, and nothing else about the endpoint changed.
    //
    // The suspect is METHOD:PUBLISH carrying STATUS:CANCELLED events. iTIP
    // (RFC 5546) treats cancellation as its own method, and importers built
    // on strict iTIP libraries reject a whole calendar that mixes them. Not
    // proven — the sandbox cannot reach hosteasepro.com and LekkeSlaap's
    // parser is not ours to test — but it does not need to be proven to be
    // the wrong bet.
    //
    // THE ASYMMETRY IS THE WHOLE ARGUMENT. A rejected feed means NO blocks
    // reach the channel at all, so every genuinely booked night is on sale
    // there: double bookings, on both properties, on real guests. A missing
    // tombstone means a channel holds a date too long and loses one booking.
    // A feed that definitely parses beats a feature that might be rejected.
    //
    // There is also a simpler story for the ghost that prompted tombstones in
    // the first place: if the feed was already failing, LekkeSlaap was frozen
    // on its last good read — which still contained the Christmas booking.
    // "The link hasn't been updating anymore" says precisely that, and it
    // needs no cancellation protocol to explain. Re-adding the URL on the
    // channel clears a frozen copy.
    //
    // If a stale block does reappear on a channel whose feed is importing
    // cleanly, that is the evidence this needs, and the answer then is a
    // separate CANCEL-method calendar — never cancellations smuggled into
    // this one.

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

    // One gate, so the two rules below are stated once. It was extracted for
    // a second pass that has since been reverted; it stays because having
    // them in one place is right regardless of how many callers there are.
    const publishable = (b) => {
      if (!b.check_in_date || !b.check_out_date) return false;
      const nameLower = (b.guest_name || b.notes || '').toLowerCase();
      if (nameLower.includes('caretaker') || nameLower.includes('tino')) return false;
      const n = Math.round((new Date(b.check_out_date) - new Date(b.check_in_date)) / 86400000);
      if (n > 120) return false;
      return true;
    };

    for (const b of bookings) {
      // publishable() holds two rules this loop used to spell out inline:
      //
      //   Caretaker residency placeholders (e.g. "Tino Caretaker") aren't
      //   guest bookings — the app's own isCaretaker() already excludes them
      //   from the Dashboard/invoice picker/occupancy views, but this feed is
      //   a separate serverless endpoint with no access to that client-side
      //   helper, so the check is duplicated here.
      //
      //   A single event spanning many months is virtually always bad data
      //   (e.g. a malformed inbound iCal import) rather than a genuine
      //   closure — publishing it would blank out the whole calendar on every
      //   connected platform. Found in production 2026-07-29 on both
      //   properties independently. Skip anything over ~4 months.
      //
      if (!publishable(b)) continue;

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

    // Some platforms reject empty feeds — add a placeholder if no events.
    //
    // NOTE this placeholder is the one STATUS:CANCELLED left in the file. It
    // is reached only by a property with nothing booked at all, it predates
    // the tombstones by a long way, and a zero-length cancelled event is the
    // conventional way to ship a calendar that is valid but blocks nothing.
    // Left alone deliberately: if the iTIP theory above is right this path is
    // suspect too, but changing it to CONFIRMED would publish a real block on
    // today's date, which is a worse failure than the one being guessed at.
    if (emitted === 0) {
      const today = new Date().toISOString().slice(0,10).replace(/-/g,'');
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:hep-${feedId}-placeholder@snapartments.co.za`);
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
