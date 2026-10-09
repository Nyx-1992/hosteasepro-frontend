#!/usr/bin/env node
/**
 * Releasing dates a channel is still holding.
 *
 *   "I got the TV house blocked on LekkeSlaap and it states it's the hep
 *    platform but we have no bookings anymore in December."
 *
 * She was right, and so was HEP. An Airbnb reservation over Christmas —
 * 24 Dec → 1 Jan, with adjacent blocks on 23 Dec and 1 Jan — was imported,
 * published down this feed, then cancelled on Airbnb on 2-3 October. HEP
 * marked it cancelled and correctly stopped publishing it.
 *
 * AND STOPPING IS NOT THE SAME AS RELEASING. The event simply vanished from
 * the calendar. A consumer that re-reads the whole feed and replaces what it
 * held copes with that. A consumer that only adds what it sees does not: the
 * dates stay shut for ever, held by a booking that no longer exists.
 * Christmas and New Year — the most expensive nights of the year — closed on
 * a channel, and the channel honestly reporting that WE were the ones
 * holding them.
 *
 * RFC 5545's answer is to say it out loud: same UID, SEQUENCE one higher,
 * STATUS:CANCELLED. This test runs the real generator over the real
 * production rows and checks the words come out.
 *
 * Run: node scripts/tests/test_ical_release.mjs
 */
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const fail = [];
const ok = (name, cond, detail) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name);
  if (!cond) { if (detail) console.log('      ' + detail); fail.push(name); }
};

// The module reads these at import time.
process.env.SUPABASE_URL = 'https://stub.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-key';

const TODAY = new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

// ── Real TV House rows, 2026-10-08 ────────────────────────────────────────
const LIVE = [
  { id: 570, guest_name: 'Booking.com Guest', check_in_date: '2026-11-04', check_out_date: '2026-11-06', status: 'confirmed', platform: 'booking' },
  { id: 565, guest_name: 'Blocked',           check_in_date: '2026-11-21', check_out_date: '2026-12-01', status: 'blocked',   platform: 'airbnb'  },
  { id: 665, guest_name: 'Booking.com Guest', check_in_date: '2026-12-01', check_out_date: '2026-12-07', status: 'confirmed', platform: 'booking' },
  { id: 664, guest_name: '🔒 Blocked',        check_in_date: '2027-02-01', check_out_date: '2027-06-28', status: 'blocked',   platform: 'booking' }, // 147n — never published
  { id: 193, guest_name: 'Tino Caretaker',    check_in_date: '2026-11-01', check_out_date: '2026-11-03', status: 'confirmed', platform: 'manual'  },
];

// The Christmas booking and its neighbours, plus controls.
const WITHDRAWN = [
  { id: 667, guest_name: '🔒 Blocked',        check_in_date: '2026-12-23', check_out_date: '2026-12-24', status: 'blocked',   platform: 'airbnb', cancelled_at: daysAgo(7)   },
  { id: 666, guest_name: 'Guest',             check_in_date: '2026-12-24', check_out_date: '2027-01-01', status: 'cancelled', platform: 'airbnb', cancelled_at: daysAgo(6)   },
  { id: 668, guest_name: '🔒 Blocked',        check_in_date: '2027-01-01', check_out_date: '2027-01-02', status: 'blocked',   platform: 'airbnb', cancelled_at: daysAgo(6)   },
  { id: 670, guest_name: 'Booking.com Guest', check_in_date: '2027-01-12', check_out_date: '2027-01-16', status: 'cancelled', platform: 'booking', cancelled_at: daysAgo(2)  },
  // Controls — none of these may produce a tombstone:
  { id: 474, guest_name: 'Blocked',           check_in_date: '2026-12-01', check_out_date: '2027-02-18', status: 'blocked',   platform: 'booking', updated_at: daysAgo(200) }, // too old
  { id: 901, guest_name: 'Blocked',           check_in_date: '2027-03-01', check_out_date: '2027-09-30', status: 'blocked',   platform: 'booking', cancelled_at: daysAgo(3) }, // 213n — never published
  { id: 902, guest_name: 'Tino Caretaker',    check_in_date: '2026-12-05', check_out_date: '2026-12-09', status: 'cancelled', platform: 'manual',  cancelled_at: daysAgo(3) }, // caretaker
];

let goneRequested = 0;
let failWithdrawnFetch = false;

globalThis.fetch = async (url) => {
  const isWithdrawn = url.includes('or=(is_active.eq.false');
  if (isWithdrawn) {
    goneRequested++;
    if (failWithdrawnFetch) throw new Error('simulated outage');
    return { ok: true, status: 200, json: async () => WITHDRAWN };
  }
  return { ok: true, status: 200, json: async () => LIVE };
};

const { generateIcalFeed } = await import(path.join(ROOT, 'api', '_lib', 'icalFeed.js'));

const FEED_ID = '032033befd126a303fa3284ab36baccd';
const uidOf = (id) => `hep-${FEED_ID}-${id}@snapartments.co.za`;

function parse(ics) {
  const events = {};
  ics.split(/\r\n/).reduce((cur, line) => {
    if (line === 'BEGIN:VEVENT') return {};
    if (line === 'END:VEVENT') { if (cur && cur.UID) events[cur.UID] = cur; return null; }
    if (!cur) return cur;
    const i = line.indexOf(':');
    if (i > 0) cur[line.slice(0, i).split(';')[0]] = line.slice(i + 1);
    return cur;
  }, null);
  return events;
}

const res = await generateIcalFeed('83b2a84a-5451-4be5-a84f-2efc0d2602d5', 'TV House', FEED_ID);
const ics = await res.text();
const ev = parse(ics);

// ══ 1. CHRISTMAS COMES BACK ═══════════════════════════════════════════════
console.log('\nThe dates LekkeSlaap is holding');

ok('the feed asked for withdrawn bookings at all', goneRequested === 1);

[[667, '23 Dec'], [666, '24 Dec → 1 Jan'], [668, '1 Jan']].forEach(([id, label]) => {
  const e = ev[uidOf(id)];
  ok(`  ${label} (id ${id}) is published as CANCELLED`,
     !!e && e.STATUS === 'CANCELLED',
     e ? 'STATUS=' + e.STATUS : 'no event emitted at all — the channel is never told');
  ok(`    …and supersedes what the channel holds (SEQUENCE > 0)`,
     !!e && Number(e.SEQUENCE) > 0, e ? 'SEQUENCE=' + e.SEQUENCE : '');
});

ok('the cancelled January Booking.com stay is released too',
   ev[uidOf(670)] && ev[uidOf(670)].STATUS === 'CANCELLED');

// The dates must match what was originally published, or the channel
// releases the wrong nights.
ok('the tombstone carries the original dates',
   ev[uidOf(666)] && ev[uidOf(666)].DTSTART === '20261224' && ev[uidOf(666)].DTEND === '20270101',
   ev[uidOf(666)] ? ev[uidOf(666)].DTSTART + '→' + ev[uidOf(666)].DTEND : '');

// ══ 2. LIVE BOOKINGS ARE STILL LIVE ═══════════════════════════════════════
console.log('\nWhat is actually booked stays booked');

ok('the real December Booking.com stay is still CONFIRMED',
   ev[uidOf(665)] && ev[uidOf(665)].STATUS === 'CONFIRMED');
ok('and its SEQUENCE is below the cancellations',
   ev[uidOf(665)] && Number(ev[uidOf(665)].SEQUENCE) === 0);
ok('the November stay and block are still published',
   ev[uidOf(570)] && ev[uidOf(565)]);

// The nightmare: a live booking released by its own feed.
const liveReleased = [570, 565, 665].filter(id => ev[uidOf(id)] && ev[uidOf(id)].STATUS === 'CANCELLED');
ok('NO live booking is cancelled by this feed', liveReleased.length === 0,
   'released: ' + liveReleased.join(', '));
ok('no UID appears twice',
   (ics.match(/^UID:/gm) || []).length === new Set(ics.match(/^UID:.*/gm)).size);

// ══ 3. NEVER RELEASE WHAT WE NEVER CLOSED ═════════════════════════════════
console.log('\nA tombstone only for something we published');

ok('the 147-night glitch is still not published', !ev[uidOf(664)]);
ok('  and gets no tombstone either (we never closed those dates)', !ev[uidOf(901)]);
ok('a caretaker placeholder gets no tombstone', !ev[uidOf(902)]);
ok('a cancellation older than the window is not re-announced', !ev[uidOf(474)],
   'otherwise every feed read carries months of dead events');

// ══ 4. GUEST PRIVACY, STILL ═══════════════════════════════════════════════
console.log('\nNothing about the guest leaves the building');

ok('no guest name appears anywhere in the feed',
   !/Booking\.com Guest|Tino|Crystal/i.test(ics),
   (ics.match(/SUMMARY:.*/g) || []).join(' | '));

// ══ 5. THE REPAIR MUST NOT BREAK THE JOB ══════════════════════════════════
console.log('\nIf the release lookup fails');

failWithdrawnFetch = true;
const res2 = await generateIcalFeed('83b2a84a-5451-4be5-a84f-2efc0d2602d5', 'TV House', FEED_ID);
const ics2 = await res2.text();
const ev2 = parse(ics2);
ok('the feed still serves 200', res2.status === 200);
ok('live bookings are still published',
   ev2[uidOf(665)] && ev2[uidOf(665)].STATUS === 'CONFIRMED',
   'going quiet about real bookings to report cancellations would double-book the flat');
ok('and no tombstones are invented', !ev2[uidOf(666)]);

// ── Result ────────────────────────────────────────────────────────
console.log('');
if (fail.length) {
  console.log(`✗ ${fail.length} check(s) failed:`);
  fail.forEach(f => console.log('   - ' + f));
  process.exit(1);
}
console.log('✓ ical release: all checks passed');
