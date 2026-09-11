#!/usr/bin/env node
/**
 * Holding nights back from sale.
 *
 *   "I want to Block the calendar for a day as our format is only cleaning
 *    a day later of the checkout. For the crystal Booking. How do I do that?"
 *
 * She couldn't. The New Booking form offered Confirmed, Pending, Cancelled
 * and Owner Stay, and Guest Name carried a `*`. Keeping the night after a
 * checkout free meant inventing a guest, and whatever name you invented, the
 * night still counted as occupied.
 *
 * THE TRAP THAT MAKES THIS MORE THAN A DROPDOWN. scripts/ics-import.js has a
 * blocked-event overlap fallback: when a feed sends a closure it cannot match
 * by UID or by exact dates, it claims any overlapping blocked row on the same
 * property AND platform and rewrites that row's dates to the feed's. Booking.com
 * re-issues its closures with a fresh UID and a window that shifts a day every
 * day, so it hits that path constantly. A hand-made block saved as platform
 * 'booking' would be adopted by the next closure and quietly dragged off the
 * night it existed to protect — and the block would still be there, still say
 * "Blocked", just over the wrong dates. 'manual' matches no feed, so no
 * importer's query can see it.
 *
 * AND THE OTHER HALF: a status the platforms never hear about protects
 * nothing. The outbound feed has to publish it, the daily-service generator
 * has to not send a cleaner to an empty flat, and Nina's checkout list has to
 * not show it as a departure.
 *
 * Run: node scripts/tests/test_calendar_blocking.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const app      = read('demo', 'index_fixed.html');
const domestic = read('demo', 'domestic.html');
const feed     = read('api', '_lib', 'icalFeed.js');
const importer = read('scripts', 'ics-import.js');
const mig      = read('supabase', 'migrations', '930_blocked_nights_need_no_cleaner.sql');

// Prose describing a bug contains the bug. Strip comments before asserting
// that something is ABSENT, or the explanation matches the check.
const codeOnly = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:'"\\])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
const sqlCode = (s) => s.split('\n').filter(l => !/^\s*--/.test(l)).join('\n');

const fail = [];
const ok = (name, cond, detail) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name);
  if (!cond) { if (detail) console.log('      ' + detail); fail.push(name); }
};

// ══ 1. THERE IS A WAY TO DO IT AT ALL ═════════════════════════════════════
console.log('\nThe control exists');

const statusSelect = (app.match(/<select id="b-status"[\s\S]*?<\/select>/) || [''])[0];
ok('the status list offers a block',
   /value="blocked"/.test(statusSelect),
   'New Booking status options: ' + (statusSelect.match(/value="[a-z]+"/g) || []).join(', '));
ok('and it says what it does, not just "Blocked"',
   /not bookable/i.test(statusSelect));
ok('choosing it reshapes the form',
   /id="b-status"[^>]*onchange="bmBlockMode\(\)"/.test(app));

// ══ 2. THE PLATFORM, WHICH IS THE WHOLE BALLGAME ══════════════════════════
console.log('\nA block the importer cannot reach');

const saveBooking = (app.match(/async function saveBooking\(\)[\s\S]*?\n\}/) || [''])[0];
ok('saveBooking knows whether it is saving a block',
   /const isBlock = document\.getElementById\('b-status'\)\.value === 'blocked'/.test(saveBooking));
ok('a block is stored as platform "manual", never the chosen feed',
   /platform:\s*isBlock \? 'manual' :/.test(codeOnly(saveBooking)),
   'platform line: ' + (codeOnly(saveBooking).match(/platform:.*/) || ['(none)'])[0].trim());

// Prove the danger is real rather than asserted: the importer's overlap
// fallback really does filter on platform and really does rewrite dates.
const overlapQuery = (importer.match(/if \(!existing && \(evt\.status === 'blocked'[\s\S]*?matchedByOverlap = true[\s\S]*?\}/) || [''])[0];
ok('the overlap fallback it is dodging is scoped by platform',
   /platform=eq\.' \+ evt\.platform/.test(overlapQuery),
   'so a block on platform "booking" would be a candidate for adoption');
ok('and adoption rewrites the row dates — which is the damage',
   /if \(matchedByOverlap\) \{[\s\S]*?updates\.check_in_date\s*=\s*evt\.check_in_date/.test(importer));

// The other importer path that touches existing rows: the stale sweep.
const sweep = (importer.match(/Stale-block \/ cancellation sweep[\s\S]*?staleRes = await supabaseRequest\([\s\S]*?null\);/) || [''])[0];
ok('the stale sweep only considers feed-born rows, so a manual block is invisible to it',
   /source_uid=not\.is\.null/.test(sweep));

// ══ 3. A BLOCK IS NOT A BOOKING WITH BLANKS ═══════════════════════════════
console.log('\nThe fields that mean nothing are gone, not just ignored');

const blockMode = (app.match(/function bmBlockMode\(\)[\s\S]*?\n\}/) || [''])[0];
['b-guest-field','b-platform-field','b-guests-field','b-email-field','b-phone-field','b-revenue-field']
  .forEach(id => ok('  hides ' + id, blockMode.includes(id)));
ok('the save button stops saying "Add Booking"',
   /btn\.textContent\s*=\s*blocked \?/.test(blockMode));
ok('nobody is checking in, so the date labels change',
   /First night blocked/.test(blockMode) && /Free again from/.test(blockMode));

ok('every hidden field is one the row no longer carries',
   /guest_first_name:\s*isBlock \? null/.test(saveBooking) &&
   /guest_email:\s*isBlock \? null/.test(saveBooking) &&
   /guest_phone:\s*isBlock \? null/.test(saveBooking) &&
   /revenue:\s+isBlock \? 0/.test(saveBooking),
   'hiding a field while still writing whatever it held is worse than showing it');

// ══ 4. THE NAME MUST STAY A PLACEHOLDER ═══════════════════════════════════
console.log('\nThe placeholder name, and why it cannot be a friendly one');

const placeholders = (app.match(/const BLOCK_PLACEHOLDERS = \[[^\]]*\]/) || [''])[0];
const savedName = (codeOnly(saveBooking).match(/const guest = isBlock \? '([^']+)'/) || [])[1];
ok('a block is saved under a placeholder name', !!savedName, 'got: ' + savedName);
ok('that exact name is in BLOCK_PLACEHOLDERS',
   !!savedName && placeholders.toLowerCase().includes("'" + savedName.toLowerCase() + "'"),
   savedName + ' vs ' + placeholders);

// nb()'s safety net promotes a 'blocked' row with a real-looking name to
// 'confirmed'. Run it: a block named "Cleaning day" would show as a guest
// and count as an occupied night.
const nbSrc = (app.match(/function nb\(b\) \{[\s\S]*?\n\}/) || [''])[0];
const netFn = new Function('BLOCK_PLACEHOLDERS', `
  function isRealGuestName(name) {
    return !!name && !BLOCK_PLACEHOLDERS.includes(name.trim().toLowerCase());
  }
  return function(status, gn) {
    if (status === 'blocked' && isRealGuestName(gn)) status = 'confirmed';
    return status;
  };
`)(['', 'blocked', '🔒 blocked', 'not available', 'guest']);
ok('  proof: the safety net would promote "Cleaning day" to a confirmed stay',
   netFn('blocked', 'Cleaning day') === 'confirmed');
ok('  and leaves the placeholder we actually save alone',
   netFn('blocked', savedName) === 'blocked');
ok('so the reason goes in Notes, which stays visible',
   /nL\.textContent\s*=\s*blocked \? 'Reason/.test(blockMode));
ok('nb() still carries its safety net for feed rows',
   /status === 'blocked' && isRealGuestName\(gn\)/.test(nbSrc));

// ══ 5. ONE NIGHT, TYPED ON A PHONE ════════════════════════════════════════
console.log('\n11/09 in both boxes must not silently block nothing');

// Execute the real function against a stub DOM.
const datesFn = (app.match(/function bmDatesChanged\(\)[\s\S]*?\n\}/) || [''])[0];
function runDates(status, checkin, checkout) {
  const els = {
    'b-status':   { value: status },
    'b-checkin':  { value: checkin },
    'b-checkout': { value: checkout },
  };
  const document = { getElementById: (id) => els[id] };
  new Function('document', datesFn + '\nbmDatesChanged();')(document);
  return els['b-checkout'].value;
}
ok('same day in both boxes becomes a real one-night block',
   runDates('blocked', '2026-09-11', '2026-09-11') === '2026-09-12',
   'got ' + runDates('blocked', '2026-09-11', '2026-09-11'));
ok('an empty check-out is filled in',
   runDates('blocked', '2026-09-11', '') === '2026-09-12');
ok('a longer block she typed herself is left alone',
   runDates('blocked', '2026-09-11', '2026-09-20') === '2026-09-20');
ok('and a normal booking is never touched',
   runDates('confirmed', '2026-09-11', '2026-09-11') === '2026-09-11');
ok('entering the block mode fills the date in too',
   /if \(blocked\) bmDatesChanged\(\)/.test(blockMode));

ok('a zero-night stay is refused outright',
   /if \(nights < 1\) \{/.test(saveBooking),
   'it used to save happily and block nothing');
ok('and the refusal is worded for whichever thing is being saved',
   /toast\(isBlock \?/.test(saveBooking));

// ══ 6. REOPENING THE FORM ═════════════════════════════════════════════════
console.log('\nThe form goes back to normal');

const reset = (app.match(/if \(id==='booking-modal' && !window\._editBookingId\) \{[\s\S]*?\n  \}/) || [''])[0];
ok('status resets to confirmed', /'b-status'\)\.value\s*=\s*'confirmed'/.test(reset));
ok('and the hidden fields come back with it',
   /bmBlockMode\(\)/.test(reset),
   'otherwise the next booking is typed into a form with no guest name');

// ══ 7. IT HAS TO LEAVE THE BUILDING ═══════════════════════════════════════
console.log('\nThe platforms have to hear about it');

ok('the outbound feed publishes blocked rows',
   /status=in\.\([^)]*blocked[^)]*\)/.test(feed));
ok('only active ones', /is_active=eq\.true/.test(feed));
ok('and they go out as "Not Available", not as a guest',
   /b\.status === 'blocked'\s*\?\s*'Not Available'/.test(feed));
ok('the form warns that the platforms are not instant',
   /not instant/i.test(app) && /extranet/i.test(app),
   'a block for tonight needs closing at the source as well');

// ══ 8. NOBODY IS SENT TO CLEAN AN EMPTY FLAT ══════════════════════════════
console.log('\nDownstream: cleaners and Nina');

ok('generate_daily_service skips blocked bookings',
   /COALESCE\(b\.status, ''\) <> 'blocked'/.test(sqlCode(mig)));
ok('and still skips cancelled and owner blocks',
   /<> 'cancelled'/.test(sqlCode(mig)) && /is_owner_block, false\) = false/.test(sqlCode(mig)),
   'the rewrite must not drop the filters it already had');
ok('the permission guard survived the rewrite',
   /service_role/.test(sqlCode(mig)) && /is_org_member\(p_org\)/.test(sqlCode(mig)));
ok('search_path is still pinned against pg_temp shadowing',
   /SET search_path TO 'public', 'pg_temp'/.test(sqlCode(mig)));

ok("Nina's checkout list does not show a block as a departure",
   /\.neq\('status','blocked'\)/.test(domestic));

// ══ 9. A SULKING FEED IS NOT A FAILED IMPORT ══════════════════════════════
console.log('\nThe ICS Import alarm');

// Reproduce the exit decision and run it over the real scenarios.
const exitSrc = (importer.match(/if \(errors > 0 && errors === FEEDS\.length\) \{[\s\S]*?\n  \}/) || [''])[0];
ok('the total-failure branch exists', !!exitSrc);
function exitCodeFor(errors, feeds) {
  let code = 0;
  new Function('errors', 'FEEDS', 'process', 'console',
    exitSrc)(errors, { length: feeds },
      { exit: (c) => { code = c; throw new Error('exited'); } },
      { error: () => {}, log: () => {} });
  return code;
}
const tryExit = (e, f) => { try { return exitCodeFor(e, f); } catch (_) { return 1; } };
ok('  2 of 6 feeds down → the run does not fail', tryExit(2, 6) === 0,
   'this is the exact run that mailed "All jobs have failed" after syncing 17 bookings');
ok('  1 of 6 down → does not fail', tryExit(1, 6) === 0);
ok('  6 of 6 down → fails', tryExit(6, 6) === 1,
   'nothing got through: that is ours, not theirs');
ok('  0 down → does not fail', tryExit(0, 6) === 0);
ok('a partial outage still annotates the run',
   /::warning::/.test(importer));
ok('and the dashboard is named as the place a dead feed shows up',
   /12 hours/.test(importer) && /amber\/red|dashboard/i.test(importer));
// The badge that claim depends on must actually exist and use that threshold.
ok('  that badge is real: sync health flags feeds stale over 12 hours',
   /hoursAgo > 12/.test(app) && /last_import_at/.test(app));
ok('  and last_import_at is only written after a successful parse',
   /events = parseICal\([\s\S]{0,400}?last_import_at/.test(importer),
   'otherwise a failing feed would look healthy and the warning really would bury it');

// ── Result ────────────────────────────────────────────────────────
console.log('');
if (fail.length) {
  console.log(`✗ ${fail.length} check(s) failed:`);
  fail.forEach(f => console.log('   - ' + f));
  process.exit(1);
}
console.log('✓ calendar blocking: all checks passed');
