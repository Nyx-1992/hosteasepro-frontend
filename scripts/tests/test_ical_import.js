#!/usr/bin/env node
/**
 * Server-side booking import: the parser, against real feed shapes.
 *
 * WHY THIS EXISTS. Reported from production: "Nina complained she couldn't
 * see the latest booking in the domestic platform to assign a cleaner...
 * I tried about 1.5h later and it worked immediately."
 *
 * The booking was not hidden from her — it was not in the database. The
 * only importer was client-side, firing when an ADMIN signs in and every
 * thirty minutes while they leave the tab open. The staff portal has no
 * sync at all, so Nina could not cause one. An hour and a half later the
 * owner opened HEP and it synced on login.
 *
 * WHAT THIS FILE CAN AND CANNOT SEE. It exercises the PARSER, which is
 * pure and is where a feed gets silently misread — a real guest turned
 * into a block, an owner stay counted as revenue, a folded line truncated.
 * It cannot prove the reconcile half writes correctly against a live
 * database; that is what the endpoint's ?dry=1 mode is for, and it must be
 * run against staging and read before the cron is trusted to write.
 *
 * Run: node scripts/tests/test_ical_import.js
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const fail = [];
const ok = (name, cond, detail) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name);
  if (!cond) { if (detail) console.log('      ' + detail); fail.push(name); }
};

// The module is ESM; this test is CJS like its siblings. Rather than add a
// build step for four functions, evaluate the parsing half directly — it
// has no imports and no side effects.
const src = read('api', '_lib', 'icalImport.js');
const parseSrc = src.slice(src.indexOf('export function parseICalDate'),
                           src.indexOf('// ── DATA ACCESS'));
const parse = new Function(
  parseSrc.replace(/export function/g, 'function') +
  '\nreturn { parseICalDate, unfoldIcal, parseICalSummaryFields, parseICalText };'
)();

const feed = (platform) => ({ property_id: 'p1', property_name: 'Test', platform });
const cal = (body) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}\r\nEND:VCALENDAR`;
const ev = (fields) => `BEGIN:VEVENT\r\n${fields}\r\nEND:VEVENT`;

// ══ DATES ═════════════════════════════════════════════════════════
console.log('\n── Dates ──');
ok('all-day form', parse.parseICalDate('20260815') === '2026-08-15');
ok('UTC timestamp form', parse.parseICalDate('20260815T140000Z') === '2026-08-15');
ok('offset form', parse.parseICalDate('20260815T140000+0200') === '2026-08-15');
ok('nothing in, nothing out', parse.parseICalDate('') === '');

// RFC 5545 folds long lines. Miss it and a LekkeSlaap SUMMARY carrying the
// guest's name silently truncates to the reference.
console.log('\n── Folded lines (RFC 5545) ──');
ok('CRLF + space unfolds', parse.unfoldIcal('SUMMARY:Cust\r\n omer: Anna') === 'SUMMARY:Customer: Anna');
ok('LF + tab unfolds', parse.unfoldIcal('SUMMARY:Cust\n\tomer: Anna') === 'SUMMARY:Customer: Anna');
ok('a real newline is left alone', parse.unfoldIcal('A:1\r\nB:2') === 'A:1\r\nB:2');

// ══ LEKKESLAAP ════════════════════════════════════════════════════
// The platform in the actual bug report. It packs guest details into
// SUMMARY delimited by a literal backslash-n.
console.log('\n── LekkeSlaap ──');
const lsSummary = 'Reference: LS-5W38B2\\nCustomer: Anna Botha\\nEmail: anna@example.co.za\\nGuests: 3';
const lsFields = parse.parseICalSummaryFields(lsSummary);
ok('reference read', lsFields.externalRef === 'LS-5W38B2');
ok('customer name read', lsFields.customerName === 'Anna Botha');
ok('email read', lsFields.guestEmail === 'anna@example.co.za');
ok('guest count read', lsFields.guestCount === 3);

const lsEvents = parse.parseICalText(cal(ev(
  `UID:ls-1\r\nDTSTART;VALUE=DATE:20260810\r\nDTEND;VALUE=DATE:20260814\r\nSUMMARY:${lsSummary}`
)), feed('lekkeslaap'));
ok('one event parsed', lsEvents.length === 1);
ok('the guest is named, not left as "Guest"', lsEvents[0] && lsEvents[0].guest_name === 'Anna Botha');
ok('counted as a real booking', lsEvents[0] && lsEvents[0].status === 'confirmed');
ok('nights computed', lsEvents[0] && lsEvents[0].nights === 4);
ok('guest count carried', lsEvents[0] && lsEvents[0].number_of_guests === 3);
ok('reference kept for reconciliation', lsEvents[0] && lsEvents[0].external_ref === 'LS-5W38B2');

// A reference with no customer line still beats "Guest" — it is at least
// something the office can look up.
const lsBare = parse.parseICalText(cal(ev(
  'UID:ls-2\r\nDTSTART;VALUE=DATE:20260901\r\nDTEND;VALUE=DATE:20260903\r\nSUMMARY:LS-ABC123'
)), feed('lekkeslaap'));
ok('a bare reference is used as the name', lsBare[0] && lsBare[0].guest_name === 'LS-ABC123');

// ══ THE "RESERVED" TRAP ═══════════════════════════════════════════
// Booking.com anonymises GENUINE reservations as a bare "Reserved".
// Airbnb uses the same word for a block. Treating them alike either
// invents bookings or loses them.
console.log('\n── "Reserved" means different things on different platforms ──');
const reservedOn = (platform) => parse.parseICalText(cal(ev(
  `UID:r-1\r\nDTSTART;VALUE=DATE:20260901\r\nDTEND;VALUE=DATE:20260905\r\nSUMMARY:Reserved`
)), feed(platform))[0];
ok('Booking.com "Reserved" is a real guest', reservedOn('booking').status === 'confirmed');
ok('...and is labelled as one', reservedOn('booking').guest_name === 'Booking.com Guest');
ok('Airbnb "Reserved" is a block', reservedOn('airbnb').status === 'blocked');

// ══ BLOCKS, OWNERS, CANCELLATIONS ═════════════════════════════════
console.log('\n── Everything that is not a paying guest ──');
const one = (summary, platform = 'airbnb', extra = '') => parse.parseICalText(cal(ev(
  `UID:x\r\nDTSTART;VALUE=DATE:20260901\r\nDTEND;VALUE=DATE:20260903\r\nSUMMARY:${summary}${extra}`
)), feed(platform))[0];
['Not available', 'CLOSED', 'Unavailable', 'blocked', '-'].forEach(s =>
  ok(`"${s}" is a block`, one(s).status === 'blocked'));
ok('an empty summary is a block', one('').status === 'blocked');
ok('STATUS:CANCELLED wins over everything',
   one('Anna Botha', 'booking', '\r\nSTATUS:CANCELLED').status === 'cancelled');

// THE MULTI-TENANCY FIX. The browser copy hardcodes four first names —
// S&N's owners — so on another agency's calendar a guest called Nicole
// becomes an owner stay and drops out of their revenue.
console.log('\n── No agency inherits another agency\'s family ──');
ok('a guest named Nicole is a guest, not an owner stay',
   one('Nicole Smith', 'booking').status === 'confirmed');
ok('a guest named Silja is a guest', one('Silja Berg', 'booking').status === 'confirmed');
ok('the generic word still works', one('Owner stay').status === 'owner');
ok('and it can be in the description',
   parse.parseICalText(cal(ev(
     'UID:o\r\nDTSTART;VALUE=DATE:20260901\r\nDTEND;VALUE=DATE:20260903\r\nSUMMARY:Private\r\nDESCRIPTION:Owner using the flat'
   )), feed('airbnb'))[0].status === 'owner');
ok('an org CAN name its own owners',
   parse.parseICalText(cal(ev(
     'UID:o2\r\nDTSTART;VALUE=DATE:20260901\r\nDTEND;VALUE=DATE:20260903\r\nSUMMARY:Mirka'
   )), feed('airbnb'), ['Mirka'])[0].status === 'owner');
ok('the source has no hardcoded tenant names',
   !/sumLower\.includes\('mirka'\)|includes\('silja'\)/.test(src));

// ══ RUBBISH IN ════════════════════════════════════════════════════
console.log('\n── Malformed events are skipped, not guessed at ──');
ok('missing DTEND is skipped',
   parse.parseICalText(cal(ev('UID:b\r\nDTSTART;VALUE=DATE:20260901\r\nSUMMARY:X')), feed('airbnb')).length === 0);
ok('check-out before check-in is skipped',
   parse.parseICalText(cal(ev('UID:b\r\nDTSTART;VALUE=DATE:20260905\r\nDTEND;VALUE=DATE:20260901\r\nSUMMARY:X')), feed('airbnb')).length === 0);
ok('a zero-night stay is skipped',
   parse.parseICalText(cal(ev('UID:b\r\nDTSTART;VALUE=DATE:20260901\r\nDTEND;VALUE=DATE:20260901\r\nSUMMARY:X')), feed('airbnb')).length === 0);
ok('an empty calendar yields nothing', parse.parseICalText(cal(''), feed('airbnb')).length === 0);
ok('several events all come through',
   parse.parseICalText(cal([
     ev('UID:1\r\nDTSTART;VALUE=DATE:20260901\r\nDTEND;VALUE=DATE:20260903\r\nSUMMARY:A'),
     ev('UID:2\r\nDTSTART;VALUE=DATE:20260905\r\nDTEND;VALUE=DATE:20260907\r\nSUMMARY:B'),
   ].join('\r\n')), feed('booking')).length === 2);

// ══ WHAT THE IMPORTER IS ALLOWED TO DO ════════════════════════════
console.log('\n── It cannot delete anything ──');
const cron = read('api', 'cron', 'ical-sync.js');
// The browser's stale sweep deactivates and cancels rows that vanish from
// a feed. It has incident history — an active stay was once wrongly
// auto-cancelled — and it is not coming to an unattended job yet.
ok('no deactivation', !/is_active:\s*false/.test(src));
ok('nothing is set to cancelled except by the feed saying so',
   (src.match(/status:\s*'cancelled'/g) || []).length === 0 &&
   /updates\.status = 'cancelled'/.test(src));
ok('no DELETE anywhere', !/method:\s*'DELETE'/.test(src));
ok('the boundary is written down',
   /NEVER CANCELS, RELEASES OR DEACTIVATES/.test(src) && /INSERTS AND UPDATES ONLY/.test(cron));

console.log('\n── The guards that were learned the hard way ──');
ok('a human\'s status is not overruled by a feed',
   /\['checked-out', 'checked-in', 'owner'\]/.test(src));
ok('a real guest name is never overwritten',
   /storedIsPlaceholder/.test(src) && /NEVER overwrite a real name/.test(src));
// Without this a long closure re-issued with a new UID inserts a duplicate
// every run — and this runs every 15 minutes now, not on login.
ok('re-issued blocks match by overlap instead of duplicating',
   /matchedByOverlap/.test(src) && /status=eq\.blocked/.test(src));
ok('one bad event does not abandon the feed',
   /out\.errors\.push\(`\$\{evt\.check_in_date\}/.test(src));
ok('an unchanged booking is not rewritten',
   /if \(Object\.keys\(updates\)\.length === 1\) \{ out\.skipped\+\+; continue; \}/.test(src));

console.log('\n── Reachability and safety ──');
// Comments stripped first: this file EXPLAINS that the browser relays
// through allorigins and that the server does not need to, and an earlier
// version of this check read that explanation and called it a proxy. The
// claim is about the code.
const code = src.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
ok('server-side fetch goes straight to the platform, no relay',
   !/allorigins|codetabs|ical-proxy/.test(code) && /fetch\(feed\.feed_url/.test(code));
ok('a CRON_SECRET is honoured when set', /auth !== `Bearer \$\{secret\}`/.test(cron));
ok('Vercel\'s cron header is the only other way in',
   /x-vercel-cron/.test(cron) && (cron.match(/401/g) || []).length === 2);
ok('there is a dry run that writes nothing',
   /dry = String/.test(cron) && /if \(!dry\) await patch/.test(src) && /if \(!dry\) \{\s*\n\s*await insert/.test(src));
const vercel = JSON.parse(read('vercel.json'));
const job = (vercel.crons || []).find(c => c.path === '/api/cron/ical-sync');
ok('it is actually scheduled', !!job, JSON.stringify(vercel.crons));
ok('often enough that a cleaner can be assigned the same morning',
   !!job && /^\*\/(5|10|15|20|30) \* \* \* \*$/.test(job.schedule), job && job.schedule);

console.log('');
if (fail.length) {
  console.log(`✗ ${fail.length} check(s) failed:`);
  fail.forEach(f => console.log('   - ' + f));
  process.exit(1);
}
console.log('✓ ical import: all checks passed');
