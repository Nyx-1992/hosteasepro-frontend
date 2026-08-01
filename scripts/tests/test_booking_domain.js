#!/usr/bin/env node
/**
 * The booking site is moving to its own domain without taking the live
 * integrations down with it.
 *
 * WHY THIS EXISTS. sunsetcoaststays.co.za was bought on 2026-08-01.
 * snapartments.co.za, which serves the guest booking site today, becomes
 * the S&N property-MANAGEMENT company site (roadmap p2-24). Two things
 * therefore hang off one host, and they must not move together:
 *
 *   Guests see it.   The RETURN10 rebooking offer sends a past guest to
 *                    the booking site. After the switch that host shows a
 *                    B2B page about property management, so the link has
 *                    to follow the booking site to its new home.
 *
 *   The app CALLS it. Calendar imports go through /api/ical-proxy and
 *                    booking confirmations through /api/confirm. Both are
 *                    live. Both answer on snapartments.co.za regardless of
 *                    which brand that host displays, because the booking
 *                    site's middleware never rewrites /api.
 *
 * Collapsing these back into one constant is the failure this guards
 * against, and it is a silent one: repointing the API calls at a domain
 * whose DNS is still settling stops calendar sync and guest emails with
 * no error message and nothing on screen. Nobody finds out until a double
 * booking or a guest who never got their confirmation.
 *
 * Run: node scripts/tests/test_booking_domain.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(ROOT, 'demo', 'index_fixed.html'), 'utf8');

const fail = [];
const ok = (name, cond) => { console.log((cond ? '  ✓ ' : '  ✗ ') + name); if (!cond) fail.push(name); };

const constOf = (name) => {
  const m = html.match(new RegExp(`^const\\s+${name}\\s*=\\s*'([^']*)'`, 'm'));
  return m ? m[1] : null;
};

// ── The two constants ─────────────────────────────────────────────
console.log('\n── The two constants ──');

const apiUrl  = constOf('BOOKING_API_URL');
const siteUrl = constOf('BOOKING_SITE_URL');

ok('BOOKING_API_URL is defined',  !!apiUrl);
ok('BOOKING_SITE_URL is defined', !!siteUrl);
// The API host must be BARE — '/api/ical-proxy' is appended to it, so a
// path on the end silently produces /stays/api/ical-proxy and a 404 that
// looks like a broken calendar feed rather than a typo.
ok('the API host is a bare origin, no path', /^https:\/\/[^/]+$/.test(apiUrl || ''));

// The guest link IS allowed a path, and currently needs one: the company
// host's root is the B2B page now, so the listings live at /stays.
ok('the guest link is absolute https with no trailing slash',
   /^https:\/\/[^/]+(\/[^/]+)*$/.test(siteUrl || ''));

// The API host is the one proven to serve /api today. It is allowed to be
// either domain once both resolve — what it must never be is a host that
// is merely bought. That is the whole point of keeping it separate.
ok('the API host is a domain that already resolves to the deployment',
   ['https://www.snapartments.co.za', 'https://www.sunsetcoaststays.co.za'].includes(apiUrl));

// ── What each one is wired to ─────────────────────────────────────
console.log('\n── What each one is wired to ──');

// Take the exact call sites out of the page rather than trusting a
// description of them: a constant renamed at the top and left alone
// further down is precisely how these drift apart.
const icalProxy = html.match(/^\s*url => `\$\{(\w+)\}\/api\/ical-proxy/m);
const confirm   = html.match(/await fetch\((\w+) \+ '\/api\/confirm'/);
const return10  = [...html.matchAll(/RETURN10\*[^\n]*?\$\{(\w+)\}/g)].map(m => m[1]);

ok('the iCal CORS proxy calls the API host',       icalProxy && icalProxy[1] === 'BOOKING_API_URL');
ok('the confirmation email calls the API host',    confirm   && confirm[1]   === 'BOOKING_API_URL');
ok('every RETURN10 offer links to the guest host',
   return10.length >= 2 && return10.every(v => v === 'BOOKING_SITE_URL'));

// Both language versions of the guest message must move together — an
// Afrikaans guest sent to the company site is the same bug, found later.
ok('the RETURN10 offer exists in both languages', return10.length === 2);

// ── Nothing else reaches for a domain directly ────────────────────
console.log('\n── Nothing else reaches for a domain directly ──');

// The SEO preview in the Marketing tab names both domains as literal text
// (it shows the owner how a page will look in search results) and the iCal
// UID suffix uses one as an opaque namespace that is never resolved —
// changing that would re-issue UIDs and duplicate events in calendars
// already subscribed. Everything else must go through a constant.
const stray = [...html.matchAll(/https:\/\/www\.(snapartments|sunsetcoaststays)\.co\.za/g)]
  .filter(m => !/^const BOOKING_(API|SITE)_URL/.test(
    html.slice(html.lastIndexOf('\n', m.index) + 1, m.index + 40)));

ok('no hardcoded booking/company URL outside the two constants',
   stray.length === 0 || (console.log('    found: ' + stray.map(s => s[0]).join(', ')), false));

// ── The platform's own address ────────────────────────────────────
console.log('\n── The platform\'s own address ──');

// hosteasepro.com was registered 2026-08-01, which made a hardcoded
// hosteasepro-frontend.vercel.app a link that goes stale. The one that
// mattered was the domestic staff portal URL in Settings: that address is
// copied into WhatsApp and handed to a cleaner, so it long outlives the
// screen it was read off. Everything in the app the user can click or copy
// must come from location.origin.
const domestic = fs.readFileSync(path.join(ROOT, 'demo', 'domestic.html'), 'utf8');
const welcome  = fs.readFileSync(path.join(ROOT, 'demo', 'welcome.html'), 'utf8');
const codeOnly = (src) => src.split('\n')
  .filter(l => !/^\s*(\/\/|\*|<!--)/.test(l))
  .join('\n');

ok('the app never hardcodes its own vercel.app host',
   !/vercel\.app/.test(codeOnly(html)) && !/vercel\.app/.test(codeOnly(domestic)));

// The same card also listed "Blessing, Fatima, Patricia and Spiwe" — S&N's
// real cleaners, in a page every other agency on the platform loads. The
// cleaner-earnings report had the same four names again, as the keys of a
// colour map, so every other agency's staff fell through to one fallback
// accent. Same rule as the property list and the invoice branding: A
// DEFAULT THAT IS ONE TENANT'S REAL DATA IS NEVER A SAFE DEFAULT. Here it
// is people's names.
//
// Comments are excluded, deliberately — the reason these were wrong is
// worth keeping next to the code that no longer does it, and a rule that
// forbids writing down what went wrong gets satisfied by deleting the
// explanation.
const SN_STAFF = ['Blessing', 'Fatima', 'Patricia', 'Spiwe'];
const seeded = SN_STAFF.filter(n => new RegExp(`\\b${n}\\b`).test(codeOnly(html)));
ok('no real staff name survives outside a comment',
   seeded.length === 0 || (console.log('    found: ' + seeded.join(', ')), false));

// The same rule for the two people who own the business. The signup page is
// the sharpest case: it offered "e.g. Nicole Babczyk" as the example name to
// every prospective customer, right next to an invented example company.
const SN_OWNERS = ['Nicole', 'Babczyk', 'Silja', 'Faltin'];
const inSignup = SN_OWNERS.filter(n => new RegExp(`\\b${n}\\b`).test(codeOnly(welcome)));
const inPortal = SN_OWNERS.filter(n => new RegExp(`\\b${n}\\b`).test(codeOnly(domestic)));
ok('the public signup page names nobody real', inSignup.length === 0 ||
   (console.log('    found: ' + inSignup.join(', ')), false));
ok('the staff portal names nobody real', inPortal.length === 0 ||
   (console.log('    found: ' + inPortal.join(', ')), false));

// The task assignee list was the last instance of this and is now fixed —
// see scripts/tests/test_task_assignees.js, which covers it properly against
// the real production data. index_fixed.html still contains those names in
// comments explaining what was wrong, which is why the check above reads
// code only.

ok('the staff-portal card is populated at render time',
   /id="url-domestic"/.test(html) &&
   /id="url-domestic-open"/.test(html) &&
   /id="portal-share-with"/.test(html) &&
   /function renderStaffPortalCard\(\)/.test(html));

// A render function nothing calls is the failure this repo has already had
// once, with the Spending tab: present in the source, invisible in the app.
ok('renderSettingsPrefs calls it',
   /function renderSettingsPrefs\(\)[\s\S]{0,400}?renderStaffPortalCard\(\)/.test(html));

console.log(fail.length ? `\n${fail.length} FAILED\n` : '\nAll passed\n');
process.exit(fail.length ? 1 : 0);
