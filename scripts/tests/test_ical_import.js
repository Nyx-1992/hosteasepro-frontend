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

// ══ THE "RESERVED" TRAP, WHICH THIS TEST GOT WRONG ════════════════
//
// This section used to assert `Airbnb "Reserved" is a block`, on the
// belief that Airbnb reuses the word for closures. It does not, and the
// assertion protected a bug that hid a guest arriving that afternoon:
// Nina, "Still missing Tiago booking 😢".
//
// Read off S&N's real feeds rather than believed:
//
//   Airbnb reservation   "Reserved"                DESCRIPTION has
//                                                  "Reservation URL: …/HM…"
//   Airbnb block         "Airbnb (Not available)"  DESCRIPTION empty
//   Booking.com, BOTH    "CLOSED - Not available"  DESCRIPTION empty
//
// Airbnb blocks say "Not available", which the generic test already
// catches, so the airbnb-specific 'reserved' rule could only ever fire on
// a genuine reservation.
console.log('\n── What the platforms actually mean ──');
const evt1 = (platform, summary, desc) => parse.parseICalText(cal(ev(
  `UID:r-1\r\nDTSTART;VALUE=DATE:20260901\r\nDTEND;VALUE=DATE:20260905\r\n` +
  `SUMMARY:${summary}` + (desc ? `\r\nDESCRIPTION:${desc}` : '')
)), feed(platform))[0];

const AIRBNB_RES_DESC = 'Reservation URL: https://www.airbnb.com/hosting/reservations/details/HMQYBA2F88\\nPhone Number (Last 4 Digits): 2152';

ok('Airbnb "Reserved" with a reservation URL is a real guest',
   evt1('airbnb', 'Reserved', AIRBNB_RES_DESC).status === 'confirmed');
ok('Airbnb "(Not available)" is still a block',
   evt1('airbnb', 'Airbnb (Not available)', '').status === 'blocked');
ok('Airbnb "Blocked" is still a block',
   evt1('airbnb', 'Blocked', '').status === 'blocked');

// Booking.com sends the identical string for a reservation and a closure,
// so this is a choice, not a deduction: show the arrival. Of 19 rows filed
// as blocks on production, 12 already carried a real guest name Nicole had
// typed off Booking.com's emails.
ok('Booking.com "CLOSED - Not available" is treated as a guest',
   evt1('booking', 'CLOSED - Not available', '').status === 'confirmed');
ok('...and is given a name Nina can act on',
   evt1('booking', 'CLOSED - Not available', '').guest_name === 'Booking.com Guest');
ok('Booking.com "Reserved" is a real guest', evt1('booking', 'Reserved', '').status === 'confirmed');

// A closure with nothing in it stays a closure on every platform, or a
// cleaner gets sent to an empty flat.
ok('an empty summary is still a block', evt1('booking', '', '').status === 'blocked');
ok('a dash is still a block', evt1('airbnb', '-', '').status === 'blocked');

// ── THE LIMIT, LEARNED BY OVERSHOOTING ────────────────────────────
//
// The first version of the Booking.com rule lifted three TV House rows
// that were genuine closures — 2, 88 and 183 nights. Nobody books a house
// for six months through Booking.com. The threshold is not a round number
// chosen for comfort: the longest real reservation in this data is 20
// nights and the closures begin at 88, so a month sits comfortably
// between them.
console.log('\n── A Booking.com "CLOSED" too long to be a stay ──');
const span = (nights) => {
  const start = new Date(Date.UTC(2026, 8, 1));
  const end = new Date(start.getTime() + nights * 86400000);
  const f = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
  return parse.parseICalText(cal(ev(
    `UID:s-${nights}\r\nDTSTART;VALUE=DATE:${f(start)}\r\nDTEND;VALUE=DATE:${f(end)}\r\n` +
    `SUMMARY:CLOSED - Not available`)), feed('booking'))[0];
};
ok('4 nights is a stay (Tiago)',            span(4).status === 'confirmed');
ok('20 nights is a stay (the longest real one here)', span(20).status === 'confirmed');
ok('31 nights is still a stay',             span(31).status === 'confirmed');
ok('32 nights is a closed house',           span(32).status === 'blocked');
ok('88 nights is a closed house',           span(88).status === 'blocked');
ok('183 nights is a closed house',          span(183).status === 'blocked');

// ── AN EMPTY OPINION MUST NOT OVERWRITE A DECISION ────────────────
//
// "CLOSED - Not available" means a reservation AND a closure, so it knows
// nothing. Guessing 'confirmed' is right for a row nobody has classified
// — Nina needs to see an arrival — and wrong for one already decided.
//
// TV House id 570, a 2-night CLOSED period, oscillated on exactly this:
// the repair blocked it, the next sync guessed 'confirmed' and flipped it
// back, every run. Visible in the data as rows all rewritten at :07 past
// by the cron. Same shape as the Tiago bug — something that knows nothing
// overruling something that knows more.
console.log('\n── An ambiguous feed does not get a vote on an existing row ──');
ok('Booking.com CLOSED is marked ambiguous',
   /const ambiguousStatus = bookingComClosed/.test(src));
ok('it is carried on the event but stripped before insert',
   /ambiguousStatus,/.test(src) &&
   /const \{ uid: _drop, ambiguousStatus: _drop2, \.\.\.row \} = evt;/.test(src),
   'leaving it in would make PostgREST reject the whole insert');
ok('an ambiguous event leaves an existing status alone',
   /\} else if \(evt\.ambiguousStatus\) \{/.test(src));
ok('Airbnb is unaffected — its feed actually distinguishes the two',
   !/ambiguousStatus[^\n]*airbnb/i.test(src));
// The parse still has to propose something, or a brand new Booking.com
// reservation would arrive with no status at all.
ok('a brand new ambiguous row still arrives as a guest',
   evt1('booking', 'CLOSED - Not available', '').status === 'confirmed' &&
   evt1('booking', 'CLOSED - Not available', '').ambiguousStatus === true);

// ── AND THE DUPLICATE GUARD HAD TO FOLLOW IT ──────────────────────
//
// The overlap fallback keyed on evt.status === 'blocked'. The moment
// Booking.com's CLOSED started arriving as 'confirmed', these events fell
// past it — and Booking.com is exactly the platform that re-issues a
// period under a fresh UID, which is why the fallback exists. Changing
// the classification would have reinstated the duplicate flood from the
// other side.
//
// Checked by simulation, not by reading: three syncs where Booking.com
// re-issues the same period under UIDs A, B, C. With the widened
// condition one row; with the old narrow one, two by the second sync.
ok('the overlap guard covers ambiguous events too',
   /if \(!existing && \(evt\.status === 'blocked' \|\| evt\.ambiguousStatus\)\) \{/.test(src));

// ── "THIS CANNOT BE UNDONE", UNDONE EVERY FIFTEEN MINUTES ─────────
//
// The delete button in the app says "Permanently delete this booking?
// This cannot be undone." It sets is_active = false. This importer opened
// its update with `{ is_active: true }` on every match — so any platform
// booking she deleted came back on the next sync, and the deduplication
// in 929 was reversed within the hour.
//
// Nothing in the cron ever deactivates a row (inserts and updates only, by
// design), so is_active = false can only have come from a person or a
// repair. Both meant it.
console.log('\n── A deleted booking stays deleted ──');
ok('the update no longer forces is_active back on',
   !/const updates = \{ is_active: true \};/.test(src) &&
   /const updates = \{\};/.test(src));
ok('a deactivated row is skipped outright',
   /if \(existing\.is_active === false\) \{ out\.skipped\+\+; continue; \}/.test(src));
ok('and the lookups fetch is_active so that check has something to read',
   (src.match(/select=id,status,guest_name,number_of_guests,source_uid,is_active/g) || []).length === 3);
// Finding `existing` is what stops a deleted row being re-inserted as a
// fresh duplicate instead — skipping only works because the match happened.
ok('skipping happens after the match, so no duplicate replaces it',
   src.indexOf('if (existing.is_active === false)') > src.indexOf('let matchedByOverlap = false;'));
ok('the no-op check was corrected for the removed is_active touch',
   /if \(Object\.keys\(updates\)\.length === 0\) \{ out\.skipped\+\+; continue; \}/.test(src));
ok('and drops the status filter only for those',
   /evt\.ambiguousStatus \? `&status=in\.\(blocked,confirmed\)` : `&status=eq\.blocked`/.test(src),
   'safe only because one property cannot hold two overlapping Booking.com stays');

// ── TOUCHING IS NOT OVERLAPPING ───────────────────────────────────
//
// Owner: "I need to know if it's individual guests as we need cleaning in
// between. I don't think two bookings come at once, so each feed should be
// an individual booking."
//
// The overlap query used lte/gte, which are BOTH true when two stays merely
// touch. One guest leaving on the 21st and the next arriving on the 21st
// matched, so the second event overwrote the first row: two bookings became
// one and the changeover clean between them disappeared — on a same-day
// turnover, the one nobody can afford to miss.
//
// Simulated rather than read. With lte/gte, feeding two back-to-back stays
// leaves a single row (2026-08-21 → 2026-08-28) and the first stay is gone
// entirely. With lt/gt both survive, a repeat sync adds nothing, and a
// genuinely re-issued period still merges instead of duplicating.
console.log('\n── Back-to-back guests stay two bookings ──');
ok('the overlap test excludes stays that merely touch',
   /check_in_date=lt\.\$\{evt\.check_out_date\}&check_out_date=gt\.\$\{evt\.check_in_date\}/.test(src),
   'lte/gte here merges a checkout into the next check-in');
ok('and the reason is written down where the query is',
   /TOUCHING IS NOT OVERLAPPING/.test(src) &&
   /changeover clean between them disappeared/.test(src));

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
   /nameIsHuman/.test(src) && /NEVER overwrite a real name/.test(src));

// ── THE TWO RULES THAT CONTRADICTED EACH OTHER ────────────────────
//
// The name rule said a human's name always wins. The status rule listed
// 'checked-out', 'checked-in' and 'owner' — not 'confirmed' — so a feed
// was free to demote a confirmed booking to 'blocked' while keeping the
// name. The row then carried a guest name only a person could have known
// and a status saying nobody was coming, and the cron redid it every run.
//
// Both now ask the same helper, which is the actual fix: one definition
// of "did a human decide this", not two that drift apart.
ok('a feed cannot demote a booking that carries a human name',
   /feedWouldDemote/.test(src) &&
   /evt\.status === 'blocked' && nameIsHuman/.test(src) &&
   /&& !feedWouldDemote/.test(src));
ok('both rules share one definition of a real name',
   /export function isPlaceholderName/.test(src) &&
   (src.match(/isPlaceholderName\(/g) || []).length >= 3);
ok('the placeholders the importer itself writes all count as placeholders',
   ['Guest', 'Booking.com Guest'].every(p => new RegExp(`'${p.replace('.', '\\.')}'`).test(src)) &&
   /includes\('🔒'\)/.test(src));
// Without this a long closure re-issued with a new UID inserts a duplicate
// every run — and this runs every 15 minutes now, not on login.
ok('re-issued blocks match by overlap instead of duplicating',
   /matchedByOverlap/.test(src) && /status=eq\.blocked/.test(src));
ok('one bad event does not abandon the feed',
   /out\.errors\.push\(`\$\{evt\.check_in_date\}/.test(src));
// Was `=== 1`, allowing for the unconditional is_active touch. That touch
// was the bug that resurrected deleted bookings, so the no-op threshold is
// now zero.
ok('an unchanged booking is not rewritten',
   /if \(Object\.keys\(updates\)\.length === 0\) \{ out\.skipped\+\+; continue; \}/.test(src));

console.log('\n── Reachability and safety ──');
// Comments stripped first: this file EXPLAINS that the browser relays
// through allorigins and that the server does not need to, and an earlier
// version of this check read that explanation and called it a proxy. The
// claim is about the code.
const code = src.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
ok('server-side fetch goes straight to the platform, no relay',
   !/allorigins|codetabs|ical-proxy/.test(code) && /fetch\(feed\.feed_url/.test(code));
ok('a CRON_SECRET is honoured when set', /bearer === secret/.test(cron));
ok('Vercel\'s cron header is the other scheduled path', /x-vercel-cron/.test(cron));
// The third path is a signed-in owner pressing a button — without it the
// only way to run the dry run is to have the secret, which the owner would
// then be pasting into a browser bar.
ok('a signed-in owner or admin may run it', /\['owner', 'admin'\]\.includes\(me\.role\)/.test(cron));
// THE check that makes exposing it safe.
ok('...but only ever for their own org, never the one they ask for',
   /orgId = me\.org_id;\s*\/\/ never their choice/.test(cron));
ok('the token is verified with Supabase, not trusted',
   /auth\/v1\/user/.test(cron) && /function whoIs/.test(cron));
ok('anything else is refused', /return res\.status\(401\)\.json\(\{ error: 'Not authorised' \}\);\s*\n\s*\}/.test(cron));
ok('there is a dry run that writes nothing',
   /dry = String/.test(cron) && /if \(!dry\) await patch/.test(src) && /if \(!dry\) \{\s*\n\s*await insert/.test(src));
const vercel = JSON.parse(read('vercel.json'));
const job = (vercel.crons || []).find(c => c.path === '/api/cron/ical-sync');
ok('it is actually scheduled', !!job, JSON.stringify(vercel.crons));
// It WANTS to be */15. Vercel's Hobby tier allows daily cron only, and an
// invalid schedule does not warn — it fails the whole deployment, which is
// exactly what happened: two commits sat unbuilt for a day. So the file
// holds a schedule that deploys, and the note in the handler says how to
// get the fifteen minutes back (Pro, or any external scheduler).
ok('the schedule is one Vercel will actually accept',
   !!job && /^0 \d{1,2} \* \* \*$/.test(job.schedule), job && job.schedule);
ok('and how to make it more frequent is written down',
   /TWO WAYS TO GET THE FIFTEEN MINUTES BACK/.test(cron));
// A daily cron alone would leave Nina waiting until tomorrow, which is the
// complaint. The button is what makes the daily schedule survivable.
ok('a person can run it without waiting for the schedule',
   /serverSync/.test(read('demo', 'index_fixed.html')));

// ══ THE RELAY THE BROWSER USES ════════════════════════════════════
//
// The browser's proxy list has always had OUR path first and public
// services as fallback — but the file did not exist, so every sync the
// product ever did was relayed by api.allorigins.win, a free service run
// by strangers, carrying guest names and dates.
console.log('\n── The browser no longer relays through strangers ──');
const proxy = read('api', 'ical-proxy.js');
ok('our own relay exists now', proxy.length > 200);
ok('the browser tries it first',
   /\$\{BOOKING_API_URL\}\/api\/ical-proxy/.test(read('demo', 'index_fixed.html')));
// An open relay is a real liability: it can be used to reach inside our
// own network, or to launder somebody else's traffic through our server.
ok('only calendar hosts we actually sync from', /ALLOWED_HOSTS/.test(proxy) && /hostAllowed/.test(proxy));
ok('https only', /protocol !== 'https:'/.test(proxy));
// "includes" would let airbnb.com.evil.example through.
ok('host matching is a suffix match, not a substring one',
   /h === a \|\| h\.endsWith\('\.' \+ a\)/.test(proxy));
ok('an unknown host is refused, and says which', /Not a calendar host we sync from/.test(proxy));
ok('there is a timeout', /AbortSignal\.timeout/.test(proxy));

console.log('');
if (fail.length) {
  console.log(`✗ ${fail.length} check(s) failed:`);
  fail.forEach(f => console.log('   - ' + f));
  process.exit(1);
}
console.log('✓ ical import: all checks passed');
