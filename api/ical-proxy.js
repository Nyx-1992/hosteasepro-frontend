// Fetch a platform's calendar on the browser's behalf.
//
// ══ WHY THIS EXISTS ══════════════════════════════════════════════
//
// The browser cannot fetch Airbnb's or LekkeSlaap's .ics directly — the
// platforms send no CORS headers, so it needs a relay. demo/index_fixed.html
// has always had a list of three relays to try, and the FIRST one is this
// path... which until now did not exist.
//
// So every calendar sync the product has ever done fell through to the
// second entry: api.allorigins.win, a free public service run by strangers.
// Guest names, email addresses and stay dates for every property have been
// passing through it.
//
// Nobody chose that. The list was written with our own relay first and the
// public ones as a fallback; the file just was not created. This is it.
//
// ══ WHAT IT WILL AND WILL NOT FETCH ══════════════════════════════
//
// An open relay is a genuine liability: anyone who finds it could use it to
// fetch internal addresses from inside our network, or to hide their own
// traffic behind our server. So it is deliberately narrow:
//
//   - https only
//   - only the calendar hosts we actually sync from
//   - GET only, 20s cap, and the response is returned as plain text
//
// A URL that is not on the list is refused rather than fetched. That is the
// whole difference between a relay and an open proxy.

// Suffix match, so airbnb.com covers www.airbnb.com and calendar.airbnb.com
// but not airbnb.com.evil.example — a plain "includes" would allow that.
const ALLOWED_HOSTS = [
  'airbnb.com', 'airbnb.co.za',
  'booking.com', 'admin.booking.com',
  'lekkeslaap.co.za',
  'nightsbridge.com', 'nightsbridge.co.za',
  'vrbo.com', 'homeaway.com',
  'google.com',            // Google Calendar ICS, used by some owners
  'calendar.google.com',
];

function hostAllowed(host) {
  const h = String(host || '').toLowerCase();
  return ALLOWED_HOSTS.some(a => h === a || h.endsWith('.' + a));
}

export default async function handler(req, res) {
  const raw = (req.query && req.query.url) || '';
  if (!raw) return res.status(400).send('Missing url');

  let target;
  try { target = new URL(raw); }
  catch (e) { return res.status(400).send('Not a URL'); }

  if (target.protocol !== 'https:') return res.status(400).send('https only');
  if (!hostAllowed(target.hostname)) {
    // Named in the response on purpose: when an agency adds a feed from a
    // platform we have not met, this message is the only thing that tells
    // anyone why the sync is silent.
    return res.status(403).send(`Not a calendar host we sync from: ${target.hostname}`);
  }

  try {
    const upstream = await fetch(target.toString(), {
      signal: AbortSignal.timeout(20000),
      headers: { 'User-Agent': 'HostEasePro/1.0 (+https://hosteasepro.com)' },
    });
    if (!upstream.ok) return res.status(502).send(`Upstream ${upstream.status}`);
    const text = await upstream.text();
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    // The browser sync re-fetches on a timer; a short cache stops a page
    // left open all day from hammering the platform.
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.status(200).send(text);
  } catch (e) {
    return res.status(504).send('Calendar did not respond');
  }
}
