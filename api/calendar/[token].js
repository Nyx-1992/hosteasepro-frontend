// Outbound iCal feed for ANY property, in ANY organisation.
//
// Replaces api/speranta-cal.js and api/tvhouse-cal.js — two copies of the
// same four lines, each hardcoded to one of S&N's properties and wired to
// its own route in vercel.json. That arrangement meant a new agency got
// no outbound feed at all, which for a multi-property host is not a
// missing nicety: it is the difference between one calendar and three
// that drift apart until a double booking turns up.
//
// The URL carries an unguessable token (897) rather than the property's
// short key. The feed itself is deliberately dull — every event is "Not
// Available" and no guest name ever appears, because it is published to
// competitors' platforms — but a guessable URL would make every agency's
// occupancy enumerable, and a token can be rotated when a feed URL needs
// taking back. A short key cannot: 894 established it must never move,
// because domestics.property_id stores it.
//
// THE OLD URLS STILL WORK. They are pasted into Airbnb, Booking.com and
// LekkeSlaap right now, and a feed that quietly stops resolving does not
// announce itself — the calendars simply drift. They stay until they
// have been replaced at each platform.
import { generateIcalFeed } from '../_lib/icalFeed.js';

export const config = { runtime: 'edge' };

const SUPABASE_URL = process.env.SUPABASE_URL;

function notFound() {
  // Deliberately identical for "no such token" and "token exists but
  // something else went wrong": a different response for a real token
  // turns this into an oracle for guessing them.
  return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
}

export default async function handler(req) {
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_ROLE_KEY || !SUPABASE_URL) return notFound();

  // ── WHERE THE TOKEN COMES FROM, AND WHY THERE ARE TWO PLACES ────
  //
  // Normally Vercel hands the whole last path segment over, extension
  // included, and that is all this read.
  //
  // IT WAS NOT ALL THAT WAS NEEDED. vercel.json carried a rewrite:
  //
  //     /api/calendar/:token  ->  /api/calendar/[token]
  //
  // Vercel does not substitute :token into a bracketed destination — it
  // rewrites to that path LITERALLY. So every feed HEP hands out,
  // /api/calendar/<token>.ics, arrived here with a last segment of
  // "[token]", failed the hex test below, and returned 404.
  //
  // Booking.com reads a 404 as a feed with nothing in it, so it went on
  // selling nights the owner had blocked for herself. She could not stay
  // in her own flat. That is what a silently empty calendar costs.
  //
  // The rewrite is gone, so file-system routing handles it and the path
  // is intact. The query fallback stays because this cannot be tested
  // from the sandbox — supabase.co and the deployment are both
  // unreachable from here — and a feed that fails silently is exactly the
  // failure being fixed. If Vercel ever passes the segment as a param
  // instead, this keeps working.
  const u = new URL(req.url);
  const fromPath  = u.pathname.split('/').pop() || '';
  const fromQuery = u.searchParams.get('token') || '';
  const clean = (s) => decodeURIComponent(s || '').replace(/\.ics$/i, '').trim();

  const token = [clean(fromPath), clean(fromQuery)]
    .find(t => /^[a-f0-9]{16,64}$/i.test(t)) || '';
  if (!token) return notFound();

  const svc = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };

  // ── TWO KINDS OF TOKEN ──────────────────────────────────────────
  //
  // A PER-CHANNEL token (944) says which channel is reading and whether
  // that channel is told about cancellations. The property's own
  // ical_token is the shared feed that is pasted into three platforms
  // right now; it still works and says nothing new.
  //
  // Per-channel is tried FIRST, because the whole point is that one
  // channel can be given a different feed from the others.
  let property = null;
  let opts = {};

  const perChannel = await fetch(
    `${SUPABASE_URL}/rest/v1/outbound_feed_tokens?token=eq.${encodeURIComponent(token)}` +
    `&select=channel,tombstones,property_id,properties(id,name,short_key)`,
    { headers: svc });
  if (perChannel.ok) {
    const row = (await perChannel.json())[0];
    if (row && row.properties) {
      property = row.properties;
      opts = { tombstones: !!row.tombstones, channel: row.channel };
      // Best effort: knowing when a channel last read its own feed is how
      // "Airbnb has not picked this up yet" stops being a guess. Never
      // awaited — a write must not delay or fail the calendar.
      fetch(`${SUPABASE_URL}/rest/v1/outbound_feed_tokens?token=eq.${encodeURIComponent(token)}`,
        { method: 'PATCH',
          headers: { ...svc, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ last_served_at: new Date().toISOString() }) }).catch(() => {});
    }
  }

  if (!property) {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/properties?ical_token=eq.${encodeURIComponent(token)}&select=id,name,short_key`,
      { headers: svc });
    if (!r.ok) return notFound();
    property = (await r.json())[0];
  }
  if (!property) return notFound();

  // feedId stays the SHORT KEY whichever token was used. It is what the
  // event UIDs are built from, so every URL for a property emits the same
  // UIDs — which is the only reason a tombstone on the Airbnb feed can
  // cancel an event Airbnb imported from the shared one.
  return generateIcalFeed(property.id, property.name || 'Property',
                          property.short_key || token.slice(0, 8), opts);
}
