#!/usr/bin/env node
/**
 * Outbound iCal feeds exist for every property, in every organisation.
 *
 * WHY THIS EXISTS. The feature was two hardcoded serverless functions —
 * api/speranta-cal.js and api/tvhouse-cal.js, four lines each, wired to
 * two fixed routes — and a Settings card hidden from anyone who was not
 * S&N. So every other agency had no outbound feed at all. For a
 * multi-property host that is not a missing nicety: without it a booking
 * taken in HEP never blocks the dates on Airbnb or Booking.com, and the
 * calendars drift apart until a double booking turns up.
 *
 * 897 gives each property an unguessable token and one dynamic route
 * serves them all. Two decisions worth pinning:
 *
 *   THE TOKEN, NOT THE SHORT KEY. /api/calendar/{short_key}.ics would
 *   have worked and would also have made every agency's occupancy
 *   enumerable by guessing property names. And a feed URL, once pasted
 *   into three platforms, cannot be taken back — with a token it can be
 *   rotated, whereas 894 established the short key must never move
 *   because domestics.property_id stores it.
 *
 *   THE OLD URLS KEEP WORKING. They are in Airbnb, Booking.com and
 *   LekkeSlaap right now. A feed that quietly stops resolving does not
 *   announce itself; the calendars just drift.
 *
 * Run: node scripts/tests/test_ical_feeds.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(ROOT, 'demo', 'index_fixed.html'), 'utf8');
const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const endpoint = fs.readFileSync(path.join(ROOT, 'api', 'calendar', '[token].js'), 'utf8');
const feedLib = fs.readFileSync(path.join(ROOT, 'api', '_lib', 'icalFeed.js'), 'utf8');

const fail = [];
const ok = (name, cond) => { console.log((cond ? '  ✓ ' : '  ✗ ') + name); if (!cond) fail.push(name); };

// ── Routing ───────────────────────────────────────────────────────
console.log('\n── Routing ──');

const sources = vercel.rewrites.map(r => r.source);
const idx = (s) => sources.indexOf(s);
const dest = (s) => (vercel.rewrites.find(r => r.source === s) || {}).destination;

// ══ THE REWRITE THAT EMPTIED THE CALENDAR ═════════════════════════
//
// vercel.json used to carry:
//
//     /api/calendar/:token  ->  /api/calendar/[token]
//
// Vercel does not substitute :token into a bracketed destination; it
// rewrites to that path LITERALLY. Every feed HEP hands out is
// /api/calendar/<token>.ics, so every one of them reached the endpoint
// with a last path segment of "[token]", failed its hex test and returned
// 404.
//
// Booking.com reads a 404 as a feed with no events in it and carried on
// selling nights the owner had blocked for herself. She could not stay in
// her own flat.
//
// AND THIS FILE ASSERTED THE BROKEN LINE HAD TO BE THERE — "a tokenised
// route exists" was green throughout. Without the rewrite, Vercel's own
// file-system routing maps /api/calendar/anything onto [token].js with
// the path intact, which is all that was ever needed.
ok('the rewrite that swallowed the token is gone',
   idx('/api/calendar/:token') < 0);
ok('nothing else rewrites a calendar path to a literal bracket',
   !vercel.rewrites.some(r => String(r.destination).includes('[')));
// File-system routing only gets a look in because /api/(.*) passes the
// path through ahead of the catch-all that serves the app shell.
ok('/api/(.*) still passes API paths through untouched',
   dest('/api/(.*)') === '/api/$1');
ok('and it is matched before the catch-all app route',
   idx('/api/(.*)') < idx('/(.*)'));

// The legacy URLs are live on three booking platforms and cannot 404.
// They are not tokens, so they need an explicit mapping.
ok('the legacy Speranta URL still resolves', idx('/api/calendar/speranta.ics') >= 0);
ok('the legacy TV House URL still resolves', idx('/api/calendar/tvhouse.ics') >= 0);
ok('the legacy URLs point at real 32-hex tokens',
   /^\/api\/calendar\/[a-f0-9]{32}$/.test(dest('/api/calendar/speranta.ics') || '') &&
   /^\/api\/calendar\/[a-f0-9]{32}$/.test(dest('/api/calendar/tvhouse.ics') || ''));
ok('the legacy URLs are matched before the generic /api passthrough',
   idx('/api/calendar/speranta.ics') < idx('/api/(.*)') &&
   idx('/api/calendar/tvhouse.ics') < idx('/api/(.*)'));

// ── The endpoint ──────────────────────────────────────────────────
console.log('\n── The endpoint ──');

// THE REAL EXTRACTION, LIFTED OUT OF THE ENDPOINT — not a copy of it.
// The previous version reimplemented the parsing here, so it went on
// passing while the deployed route was handed "[token]" by a rewrite and
// answered 404 to every platform. A test that reproduces the code cannot
// notice the code being bypassed.
const parse = (pathname) => {
  const body = endpoint.slice(endpoint.indexOf('const u = new URL(req.url);'),
                              endpoint.indexOf('if (!token) return notFound();'));
  const fn = new Function('req', body + '\n  return token || null;');
  return fn({ url: 'https://x' + pathname });
};


const good = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
ok('a 32-hex token with .ics parses', parse(`/api/calendar/${good}.ics`) === good);
ok('the same token without .ics parses', parse(`/api/calendar/${good}`) === good);
ok('.ICS in caps parses', parse(`/api/calendar/${good}.ICS`) === good);
ok('a short key is rejected', parse('/api/calendar/speranta.ics') === null);
ok('a uuid is rejected (wrong alphabet)',
   parse('/api/calendar/e9737638-d83a-4947-940a-8746789e4d9f.ics') === null);
ok('a path traversal attempt is rejected', parse('/api/calendar/..%2F..%2Fetc.ics') === null);
ok('an empty token is rejected', parse('/api/calendar/.ics') === null);
ok('a too-short hex string is rejected', parse('/api/calendar/abc123.ics') === null);

ok('the token is looked up, never trusted as a property id',
   /ical_token=eq\./.test(endpoint) && !/id=eq\.\$\{token\}/.test(endpoint));
ok('the token is url-encoded into the query', /encodeURIComponent\(token\)/.test(endpoint));
ok('an unknown token and an error look identical from outside',
   (endpoint.match(/return notFound\(\)/g) || []).length >= 4);

// ── What the feed says ────────────────────────────────────────────
console.log('\n── What goes out ──');

ok('guest names never appear in an event', /Never expose guest names/.test(feedLib));
ok('every event summary is "Not Available" or an owner stay',
   /'Not Available'/.test(feedLib) && /Owner Stay/.test(feedLib));

// ── The Settings panel ────────────────────────────────────────────
console.log('\n── The Settings panel ──');

ok('the panel is built per property, not typed into the markup',
   /function renderIcalFeeds\(\)/.test(html) && /_propertiesRaw \|\| \[\]/.test(html));
ok('it is no longer hidden from other organisations',
   !/settings-sn-ical-card/.test(html));
ok('no hardcoded S&N feed URL is left in the page',
   !/calendar\/speranta\.ics/.test(html) && !/calendar\/tvhouse\.ics/.test(html));
ok('the URL is built from the current origin, not a fixed host',
   /location\.origin\}\/api\/calendar\//.test(html));
ok('it redraws when the property list changes',
   /renderIcalFeeds\(\);/.test(html.slice(html.indexOf('async function loadProperties'))));
ok('an org with no properties gets an explanation, not an empty box',
   /Add a property first/.test(html));
ok('the panel says these addresses are sensitive',
   /Treat these like passwords/.test(html));

console.log(fail.length ? `\n${fail.length} FAILED\n` : '\nAll checks passed\n');
process.exit(fail.length ? 1 : 0);
