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

// ── THE FIELD EXISTED AND THE FEATURE DID NOT WORK ────────────────
//
// Everything above passed while editing a booking was impossible for
// everybody, on every property:
//
//     Could not save: invalid input syntax for type uuid: "speranta"
//
// The picker built its option values from `UUID_MAP[k] || k`. UUID_MAP
// goes uuid -> short key, so looking a SHORT KEY up in it is always
// undefined, and every option quietly fell back to `|| k` — the short key
// — which then went into a uuid column.
//
// Checking that an input exists says nothing about what it submits. So
// this runs the real expression out of the file against properties shaped
// the way loadProperties() builds them, and asserts the value is a uuid.
console.log('\n── What the property picker actually submits ──');
{
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  // Exactly as loadProperties() populates them: PROPS keyed by short key
  // and carrying .uuid; UUID_MAP the reverse.
  const PROPS = {
    speranta: { name: 'Speranta Flat', uuid: 'e9737638-d83a-4947-940a-8746789e4d9f' },
    tvhouse:  { name: 'TV House',      uuid: '83b2a84a-5451-4be5-a84f-2efc0d2602d5' },
    broken:   { name: 'No uuid yet',   uuid: null },
  };
  const UUID_MAP = {};
  Object.keys(PROPS).forEach(k => { if (PROPS[k].uuid) UUID_MAP[PROPS[k].uuid] = k; });

  const line = (modal.match(/\$\{Object\.keys\(PROPS\)[\s\S]*?\.join\(''\)\}/) || [])[0];
  ok('the option list is built from PROPS', !!line, 'could not find the picker expression');

  if (line) {
    const b = { id: 1, property_id: PROPS.speranta.uuid };
    const escAttr = (s) => String(s);
    const escHtml = (s) => String(s);
    // Evaluate the real template expression from the shipped file.
    const html = new Function('PROPS', 'UUID_MAP', 'b', 'escAttr', 'escHtml',
      'return `' + line + '`;')(PROPS, UUID_MAP, b, escAttr, escHtml);

    const values = [...html.matchAll(/value="([^"]*)"/g)].map(m => m[1]);
    ok('every option submits a uuid, never a short key',
       values.length > 0 && values.every(v => UUID_RE.test(v)),
       'got: ' + JSON.stringify(values));
    ok('a property with no uuid is left out rather than offered',
       !values.includes('') && !html.includes('No uuid yet'));
    ok('the booking\'s current property comes up selected',
       /value="e9737638-d83a-4947-940a-8746789e4d9f" selected/.test(html));
  }
}

// And the same value is checked again before it reaches the database, so
// a future mistake in the picker is reported in words somebody can act on
// rather than as a Postgres type error.
ok('a non-uuid is refused before the update is sent',
   /\^\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}\$/.test(app) &&
   /not set up properly/.test(app));

// ── SENT AS A UUID, KEPT AS A SHORT KEY ───────────────────────────
//
// Fixing the picker created a second bug. The database stores property_id
// as a uuid, but in memory every booking carries the SHORT KEY, normalised
// through UUID_MAP on load. Assigning the update straight onto the row put
// a uuid back, so one booking spoke a different language from all the
// others: the lane view filters `b.property_id === pid` against PROPS
// keys, and an edited booking matched no property and disappeared from the
// list — while the calendar, which resolves it differently, still showed
// it. Reported as "I updated my booking and now it seems gone? It shows in
// the calendar."
console.log('\n── After saving, the row still speaks the app\'s language ──');
ok('the in-memory booking keeps the short key, not the uuid',
   /Object\.assign\(b, updates, \{ property_id: UUID_MAP\[propId\] \|\| propId \}\)/.test(app));
ok('and the uuid is still what gets sent to the database',
   /property_id: propId,/.test(app));

// ══ OWNER STAYS ═══════════════════════════════════════════════════
//
// Owner: "How do I change it to an owner stay? It shows as direct/manual
// for now."
console.log('\n── Marking a stay as the owner\'s ──');
ok('there is a button to say so', /bdToggleOwnerStay\('\$\{b\.id\}'\)/.test(app));
ok('it toggles both ways', /\$\{b\.status === 'owner' \? '↩️ Not an owner stay' : '🏡 Mark as owner stay'\}/.test(app));
ok('it writes a status rather than a name',
   /const next = makeOwner \? 'owner' : 'confirmed';/.test(app) &&
   /db\.from\('bookings'\)\.update\(\{ status: next \}\)/.test(app));
// A platform booking's status is refreshed from its feed, so setting it
// here would be undone within the hour.
ok('only bookings we own can be marked',
   /if \(!isOwnEntry\(b\)\) \{ toast\('Only bookings you entered can be marked as an owner stay'/.test(app));

// ── THE NAME-MATCHING TRAP, WHICH LOOKED LIKE THE FIX ─────────────
//
// isOwnerStay hardcoded S&N's family names, which is the multi-tenant
// fault this codebase keeps having to correct. The obvious repair was to
// read org_settings.owner_stay_names, as the iCal importer does.
//
// Checked against the real data first: S&N's list is
// ["mirka","antonin","nicole","silja"], which matches Nicole van Aswegen
// (Booking.com), Nicole Phiri (Airbnb) and Nicole Babczyk. Two paying
// guests erased from income and occupancy, and the owner's own booking
// hidden again — the very thing being fixed.
//
// A per-agency list only makes a bad guess configurable. The app has an
// explicit status; it should use it.
{
  // The function body only — cut at its closing brace rather than by a
  // character count. A fixed window used to reach past the end and pick up
  // whatever comment followed, which is how this check started failing on
  // the note explaining it.
  const fnStart = app.indexOf('function isOwnerStay(b)');
  const fn = app.slice(fnStart, app.indexOf('\n}', fnStart) + 2);
  ok('no person\'s name decides whether a stay is the owner\'s',
     !/mirka|antonin|silja|nicole/i.test(fn), fn.replace(/\s+/g, ' ').slice(0, 140));
  ok('an explicit status does', /b\.status === 'owner'/.test(fn));
  // "Owner" is a label, not a name — it keeps every existing owner stay
  // classified exactly as before, which is why no data migration was needed.
  ok('and the literal word "owner" still counts', /includes\('owner'\)/.test(fn));
  // The names list is not banned from the app — the iCal importer inside
  // it genuinely needs one, because a calendar SUMMARY is all it has to go
  // on. What must never happen is isOwnerStay() consulting it: by then the
  // booking carries an explicit status, and matching "nicole" against
  // stored rows swallows two real paying guests.
  //
  // Same column, opposite conclusions, because they answer the question at
  // different moments. This pins that the reader of the list is the
  // importer and not the classifier.
  ok('isOwnerStay does not consult the names list',
     !/IMPORT_OWNER_NAMES|owner_stay_names/.test(fn));
  ok('but the importer does, and says why it may',
     /IMPORT_OWNER_NAMES = Array\.isArray\(s\.owner_stay_names\)/.test(app) &&
     /WHY THE IMPORTER MAY MATCH NAMES AND isOwnerStay\(\) ABOVE MAY NOT/.test(app));
}
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
