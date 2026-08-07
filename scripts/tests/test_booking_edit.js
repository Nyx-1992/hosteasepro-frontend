#!/usr/bin/env node
/**
 * Editing a booking you made yourself, and the bug that hid HQ.
 *
 * TWO THINGS THE OWNER FOUND IN ONE MESSAGE:
 *
 *   "I am unable to EDIT a booking (a manual one for myself) — I feel
 *   manual bookings should be editable."
 *
 * The booking modal let you change the guest's name, phone and email and
 * nothing else. Property, dates and guest count were printed as text. So a
 * manual booking typed with the wrong date could only be deleted and
 * retyped, which loses the linked cleaning with it.
 *
 *   "The HQ page isn't loading, only the other two tabs."
 *
 * `const planLabel = PLAN_LABEL;` sat about twenty lines ABOVE
 * `const PLAN_LABEL = {...}`, in the same function scope. const is hoisted
 * but sits in the temporal dead zone until its declaration runs, so the
 * read threw ReferenceError rather than giving undefined. drawCustomers()
 * died on its first statement, nothing replaced the placeholder, and HQ
 * showed "Loading…" for ever — with the error in a console nobody had
 * open. Every RPC it needs was working perfectly.
 *
 * Run: node scripts/tests/test_booking_edit.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const app = fs.readFileSync(path.join(ROOT, 'demo', 'index_fixed.html'), 'utf8');
const checker = fs.readFileSync(path.join(ROOT, 'scripts', 'tests', 'check_html_js.js'), 'utf8');

const fail = [];
const ok = (name, cond, detail) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name);
  if (!cond) { if (detail) console.log('      ' + detail); fail.push(name); }
};

// ══ 1. WHOSE BOOKING IS IT ════════════════════════════════════════
//
// Run rather than read: this decides whether an edit box appears at all,
// and getting it wrong in either direction is bad — no box on a manual
// booking is the reported bug, a box on an Airbnb booking is an edit that
// silently reverts.
console.log('\n── Which bookings are ours to change ──');
let isOwnEntry;
try {
  const src = app.slice(app.indexOf('function isOwnEntry(b)'), app.indexOf('function bdEdit'));
  isOwnEntry = new Function(src + '\nreturn isOwnEntry;')();
  ok('isOwnEntry can be lifted out and run', true);
} catch (e) {
  ok('isOwnEntry can be lifted out and run', false, e.message);
}

if (isOwnEntry) {
  // The five platform values actually present in production, plus the
  // shapes a row can legitimately have.
  [['manual', true], ['direct', true], ['', true], [null, true], [undefined, true],
   ['airbnb', false], ['booking', false], ['lekkeslaap', false],
   ['Airbnb', false], ['MANUAL', true]].forEach(([p, want]) => {
    ok(`platform ${JSON.stringify(p)} → ${want ? 'editable' : 'read-only'}`,
       isOwnEntry({ platform: p }) === want);
  });
  // A row with no platform is likelier to be somebody's own entry than a
  // platform import that lost its label, and treating it as read-only
  // would reproduce the reported bug on exactly those rows.
  ok('a booking with no platform at all is treated as ours',
     isOwnEntry({}) === true && isOwnEntry() === false || isOwnEntry({}) === true);
}

// ══ 2. THE EDIT ITSELF ════════════════════════════════════════════
console.log('\n── What can be changed ──');
const modal = app.slice(app.indexOf('function openBookingDetail'), app.indexOf('async function saveGuestName'));
ok('the stay can be edited, not just the guest details',
   /id="bd-prop-\$\{b\.id\}"/.test(modal) && /id="bd-in-\$\{b\.id\}"/.test(modal) &&
   /id="bd-out-\$\{b\.id\}"/.test(modal) && /id="bd-guests-\$\{b\.id\}"/.test(modal));
ok('the edit is offered only on bookings we own',
   /\$\{isOwnEntry\(b\) && canManage \? `/.test(modal));
// An Airbnb booking is a copy of their calendar; the importer updates in
// place, so an edit here is reverted on the next sync with no error.
ok('platform bookings say why they cannot be edited here',
   /\$\{!isOwnEntry\(b\) && canManage \? `/.test(modal) &&
   /refreshed on every sync/.test(modal) &&
   /Change it on \$\{escHtml\(PLATFORM_LABELS/.test(modal));
ok('a host cannot edit a booking at all', /isOwnEntry\(b\) && canManage/.test(modal));
ok('the summary stays visible while editing, to compare against',
   /it is the thing being compared against/.test(app));

console.log('\n── Saving ──');
const save = app.slice(app.indexOf('async function bdSaveStay'), app.indexOf('async function saveGuestName'));
ok('check-out must be after check-in', /if \(co <= ci\)/.test(save));
ok('and the message says what to do, not which constraint failed',
   /Check-out has to be after check-in/.test(save));
// A double-booking found by a guest at the door is the worst way to find
// out. Warned rather than blocked: an owner blocking a room they are also
// staying in has a real reason to overlap.
ok('an overlapping stay in the same property is caught',
   /const clash = bookings\.find/.test(save) &&
   /String\(x\.check_in\)\.slice\(0,10\) < co && String\(x\.check_out\)\.slice\(0,10\) > ci/.test(save));
ok('the clash is a warning, not a block',
   /confirm\(/.test(save) && /Save anyway\?/.test(save) && /Warned, not blocked/.test(save));
ok('the clash check ignores the booking being edited',
   /String\(x\.id\) !== String\(bookingId\)/.test(save));
ok('and ignores cancelled bookings', /\(x\.status \|\| ''\) !== 'cancelled'/.test(save));
// Both column pairs, or the calendar and the list disagree about a date.
ok('both date columns are written', /check_in: ci, check_out: co/.test(save) &&
   /check_in_date: ci, check_out_date: co/.test(save));
ok('a blank revenue saves as NULL, not zero',
   /raw === '' \? null/.test(save) && /different from zero/.test(save));
ok('the screens redraw so the change is visible immediately',
   /renderCalendar\(\); renderBookings\(\); renderDashboard\(\);/.test(save));
// Deleting and retyping is what the owner had to do before, and it loses
// the linked clean. Moving the checkout should say so rather than silently
// leaving a cleaner booked for the old day.
ok('it warns that a booked cleaning does not move with the checkout',
   /does not move a cleaning that is already booked/.test(modal));

// ══ 3. THE BUG THAT HID HQ ════════════════════════════════════════
console.log('\n── HQ loads again ──');
// Checked as CODE, not as text. The comment left at the declaration
// quotes the broken line verbatim — "`const planLabel = PLAN_LABEL;` sat
// twenty lines earlier" — so a plain indexOf finds the explanation and
// reports the bug as still present. Match only a line whose own content
// is the statement.
ok('PLAN_LABEL is no longer read above its declaration',
   !app.split('\n').some(l => l.trim().startsWith('const planLabel = PLAN_LABEL;')));
ok('and the reason is written down where the declaration is',
   /THERE WAS AN ALIAS ABOVE THIS LINE and it broke the whole screen/.test(app));

// THE CHECK THAT SHOULD HAVE CAUGHT IT. check_html_js.js runs the script
// and catches a temporal dead zone at LOAD — which misses the far likelier
// version, a const read before its declaration inside a function that only
// runs when somebody opens that screen.
ok('the checker now looks inside function bodies too',
   /function tdzInFunctionBodies/.test(checker));
ok('it explains the failure it exists to catch',
   /nothing throws until somebody opens that screen/i.test(checker));
// Prose describing this bug contains "PLAN_LABEL;" and would otherwise
// match the scan — which it did, on the first run.
ok('and it strips comments first, or it flags its own explanation',
   /COMMENTS OUT FIRST/.test(checker));

// ── Result ────────────────────────────────────────────────────────
console.log('');
if (fail.length) {
  console.log(`✗ ${fail.length} check(s) failed:`);
  fail.forEach(f => console.log('   - ' + f));
  process.exit(1);
}
console.log('✓ booking edit: all checks passed');
