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

  // Vercel hands the whole last path segment over, extension included.
  const raw = new URL(req.url).pathname.split('/').pop() || '';
  const token = decodeURIComponent(raw).replace(/\.ics$/i, '').trim();
  if (!/^[a-f0-9]{16,64}$/i.test(token)) return notFound();

  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/properties?ical_token=eq.${encodeURIComponent(token)}&select=id,name,short_key`,
    { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } });
  if (!r.ok) return notFound();

  const property = (await r.json())[0];
  if (!property) return notFound();

  return generateIcalFeed(property.id, property.name || 'Property',
                          property.short_key || token.slice(0, 8));
}
