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

    // ── A FEED THAT GOES QUIET DOES NOT FREE THE DATES ────────────────────
    // When a booking is cancelled or deleted it simply vanished from this
    // list, and the event stopped appearing. That is enough for a consumer
    // that re-reads the whole calendar and replaces what it had. It is NOT
    // enough for one that only adds what it sees, and several channels work
    // that way: the dates stay closed for ever, sold by nobody.
    //
    // Found in production 2026-10-08 on TV House. An Airbnb reservation over
    // Christmas (23 Dec → 2 Jan with its two adjacent blocks) was published
    // here, cancelled on Airbnb on 2-3 October, and correctly dropped from
    // the feed. LekkeSlaap went on showing the property as unavailable, and
    // attributed the block to us — Christmas and New Year, the most
    // expensive nights of the year, closed on a channel by a booking that no
    // longer existed. Nothing in HEP was wrong; the calendar simply never
    // said the word "cancelled" out loud.
    //
    // RFC 5545 has the answer: re-publish the same UID with STATUS:CANCELLED
    // and a higher SEQUENCE. A consumer that honours cancellations releases
    // the dates; one that diffs properly has already dropped it and ignores
    // this. Bounded to a window — a tombstone has to be repeated long enough
    // to be seen, not kept for ever. 90 days is roughly three months of daily
    // polls to notice one cancellation; past that the event is bloat in every
    // read. Clearing a backlog that predates this code is a re-add of the
    // feed URL on the channel, not a longer window here.
    const RELEASE_WINDOW_DAYS = 90;
    const releaseCutoff = new Date(Date.now() - RELEASE_WINDOW_DAYS * 86400000)
      .toISOString();
    const goneUrl = `${SUPABASE_URL}/rest/v1/bookings?property_id=eq.${propertyId}&or=(is_active.eq.false,status.eq.cancelled)&check_out_date=gte.${todayStr}&select=id,guest_name,check_in_date,check_out_date,status,platform,notes,cancelled_at,updated_at&order=check_in_date.asc`;

    let withdrawn = [];
    try {
      const goneRes = await fetch(goneUrl, {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
        },
      });
      if (goneRes.ok) {
        const all = await goneRes.json();
        withdrawn = all.filter(b =>
          (b.cancelled_at || b.updated_at || '') >= releaseCutoff);
      }
    } catch (_) {
      // Releasing dates is a repair, not the job. If this lookup fails the
      // feed must still publish what IS booked — going quiet about live
      // bookings to report cancellations would double-book the property.
      withdrawn = [];
    }

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
    let released = 0;
    const seenUids = new Set();

    // Both lists go through the same gate. A tombstone is only honest for
    // something this feed would actually have published: emitting
    // STATUS:CANCELLED for a caretaker placeholder or a 200-night glitch we
    // always skipped would be telling a channel to release dates we never
    // told it to close.
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
      // They live in one function now because the cancellation pass below
      // has to apply exactly the same rules. Two copies would drift, and the
      // way they would drift is a tombstone for an event we never published.
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
      lines.push(`SEQUENCE:0`);
      lines.push(`STATUS:CONFIRMED`);
      lines.push('END:VEVENT');
      seenUids.add(uid);
      emitted++;
    }

    // ── Tombstones: say "cancelled" instead of saying nothing ─────────────
    // Same UID, SEQUENCE one higher so it supersedes the event the consumer
    // already holds. Guarded against a UID that is also live above — a
    // calendar that both confirms and cancels the same event is worse than
    // either, and that is how a real booking would get released.
    for (const b of withdrawn) {
      if (!publishable(b)) continue;
      const uid = `hep-${feedId}-${b.id}@snapartments.co.za`;
      if (seenUids.has(uid)) continue;

      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${uid}`);
      lines.push(`DTSTAMP:${now}`);
      lines.push(`DTSTART;VALUE=DATE:${b.check_in_date.replace(/-/g, '')}`);
      lines.push(`DTEND;VALUE=DATE:${b.check_out_date.replace(/-/g, '')}`);
      lines.push(`SUMMARY:Available — booking cancelled`);
      lines.push(`SEQUENCE:1`);
      lines.push(`STATUS:CANCELLED`);
      lines.push('END:VEVENT');
      seenUids.add(uid);
      released++;
    }

    // Some platforms reject empty feeds — add a placeholder if no events.
    // Counts live events only: a calendar carrying nothing but cancellations
    // still has no availability information in it.
    if (emitted === 0 && released === 0) {
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
