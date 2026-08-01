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
ok('both are absolute https URLs with no trailing slash',
   /^https:\/\/[^/]+$/.test(apiUrl || '') && /^https:\/\/[^/]+$/.test(siteUrl || ''));

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

console.log(fail.length ? `\n${fail.length} FAILED\n` : '\nAll passed\n');
process.exit(fail.length ? 1 : 0);
