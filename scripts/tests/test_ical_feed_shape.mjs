#!/usr/bin/env node
/**
 * The outbound feed stays boring, because a feed that does not parse is worse
 * than a feed that is a bit stale.
 *
 *   "HostEase platform Link hasn't been updating anymore and I had to remove
 *    from the TV house (showed a wrong blocking) but checking for Speranta
 *    it's also not working there"
 *
 * LekkeSlaap reported "Failed to import" for the HEP calendar on BOTH
 * listings, while its Booking.com and Airbnb imports had succeeded minutes
 * earlier. api/_lib/icalFeed.js had not been touched in months until
 * 2026-10-09, when this repo started re-publishing cancelled bookings as
 * tombstones — same UID, SEQUENCE 1, STATUS:CANCELLED — inside a calendar
 * that declares METHOD:PUBLISH. Three days later, both feeds stopped
 * importing.
 *
 * iTIP (RFC 5546) treats cancellation as its own method, and importers built
 * on strict iTIP libraries reject a whole calendar that mixes a PUBLISH
 * method with cancellations. Not proven — the sandbox cannot reach
 * hosteasepro.com, and LekkeSlaap's parser is not ours to run — and it does
 * not need to be proven to be the wrong bet.
 *
 * THE ASYMMETRY IS THE ARGUMENT, and it is what this file exists to hold:
 *
 *   a rejected feed  → NO blocks reach the channel at all → every genuinely
 *                      booked night is on sale there → double bookings, on
 *                      real guests, on both properties
 *   a missing tombstone → a channel holds one date too long → one lost booking
 *
 * So this feed publishes exactly one thing: the dates that are taken. Anything
 * cleverer earns its way back in only with evidence from a channel whose feed
 * is importing cleanly, and then as a separate CANCEL-method calendar — never
 * smuggled into this one.
 *
 * Run: node scripts/tests/test_ical_feed_shape.mjs
 */
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const fail = [];
const ok = (name, cond, detail) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name);
  if (!cond) { if (detail) console.log('      ' + detail); fail.push(name); }
};

process.env.SUPABASE_URL = 'https://stub.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-key';

// Real TV House rows, 2026-10-12.
const LIVE = [
  { id:570, guest_name:'Booking.com Guest', check_in_date:'2026-11-04', check_out_date:'2026-11-06', status:'confirmed', platform:'booking' },
  { id:675, guest_name:'🔒 Blocked',        check_in_date:'2026-11-06', check_out_date:'2026-12-01', status:'blocked',   platform:'lekkeslaap' },
  { id:665, guest_name:'Booking.com Guest', check_in_date:'2026-12-01', check_out_date:'2026-12-07', status:'confirmed', platform:'booking' },
  { id:672, guest_name:'Booking.com Guest', check_in_date:'2026-12-09', check_out_date:'2026-12-15', status:'confirmed', platform:'booking' },
  { id:664, guest_name:'🔒 Blocked',        check_in_date:'2027-02-01', check_out_date:'2027-06-28', status:'blocked',   platform:'booking' },  // 147n
  { id:193, guest_name:'Tino Caretaker',    check_in_date:'2026-11-01', check_out_date:'2026-11-03', status:'confirmed', platform:'manual' },
  { id:900, guest_name:'Nicole',            check_in_date:'2027-03-01', check_out_date:'2027-03-05', status:'owner',     platform:'manual' },
];

let fetchCalls = 0;
globalThis.fetch = async () => { fetchCalls++; return { ok:true, status:200, json: async () => LIVE }; };

const { generateIcalFeed } = await import(path.join(ROOT, 'api', '_lib', 'icalFeed.js'));

const FEED_ID = '032033befd126a303fa3284ab36baccd';
const res = await generateIcalFeed('83b2a84a-5451-4be5-a84f-2efc0d2602d5', 'TV House', FEED_ID);
const ics = await res.text();
const lines = ics.split('\r\n');

// ══ 1. NOTHING A STRICT PARSER CAN REFUSE ═════════════════════════════════
console.log('\nThe calendar a channel has to accept');

ok('it is served as a calendar', res.status === 200 &&
   /text\/calendar/.test(res.headers.get('Content-Type') || ''));
ok('it declares METHOD:PUBLISH', lines.includes('METHOD:PUBLISH'));

// THE CHECK THIS FILE IS FOR.
const cancelled = lines.filter(l => l === 'STATUS:CANCELLED').length;
ok('NO booking is published as STATUS:CANCELLED', cancelled === 0,
   cancelled + ' cancellation(s) in a METHOD:PUBLISH calendar — the thing that '
   + 'coincided with both LekkeSlaap feeds failing');
ok('and no SEQUENCE bumping either', !/^SEQUENCE:[1-9]/m.test(ics));

ok('every event is closed', (ics.match(/BEGIN:VEVENT/g) || []).length ===
                            (ics.match(/END:VEVENT/g) || []).length);
ok('the calendar is closed', lines[lines.length - 1] === 'END:VCALENDAR' ||
   lines[lines.length - 2] === 'END:VCALENDAR');
ok('CRLF line endings, as the spec requires', ics.includes('\r\n') && !/[^\r]\n/.test(ics));

// RFC 5545 caps a content line at 75 octets unless folded, and nothing here folds.
const tooLong = lines.filter(l => Buffer.byteLength(l, 'utf8') > 75);
ok('no line exceeds 75 octets', tooLong.length === 0,
   tooLong.map(l => Buffer.byteLength(l) + ': ' + l).join(' | '));

// ══ 2. ONE QUERY, NOT TWO ═════════════════════════════════════════════════
console.log('\nOne question to the database');

ok('the feed makes exactly one fetch', fetchCalls === 1,
   fetchCalls + ' — the reverted version asked a second time for cancellations');

// ══ 3. WHAT IT DOES SAY ═══════════════════════════════════════════════════
console.log('\nThe dates that are taken');

const has = (ci, co) => new RegExp('DTSTART;VALUE=DATE:' + ci + '\\r\\nDTEND;VALUE=DATE:' + co).test(ics);
ok('a confirmed booking is published', has('20261104', '20261106'));
ok('a block is published', has('20261106', '20261201'));
ok('an owner stay is published', has('20270301', '20270305'));
ok('the owner stay is still marked as one', /SUMMARY:Owner Stay/.test(ics));
ok('a caretaker placeholder is not published', !/20261101/.test(ics),
   'the granny flat is not a bookable night');
ok('a 147-night glitch is not published', !/20270201/.test(ics),
   'publishing it would blank the calendar on every connected platform');

ok('no guest name ever leaves the building',
   !/Booking\.com Guest|Tino|Nicole/.test(ics),
   (ics.match(/SUMMARY:.*/g) || []).join(' | '));

// ══ 4. AN EMPTY CALENDAR IS STILL A CALENDAR ══════════════════════════════
console.log('\nA property with nothing booked');

globalThis.fetch = async () => ({ ok:true, status:200, json: async () => [] });
const res2 = await generateIcalFeed('x', 'Empty Place', 'abc123');
const ics2 = await res2.text();
ok('it still returns a valid calendar', res2.status === 200 &&
   ics2.startsWith('BEGIN:VCALENDAR') && ics2.trim().endsWith('END:VCALENDAR'));
ok('with a placeholder so a channel does not reject an empty file',
   /SUMMARY:Calendar Active/.test(ics2));
// Documented, not endorsed: this one cancelled event predates the tombstones
// by months and blocks nothing. Flipping it to CONFIRMED would publish a real
// block on today's date — a worse failure than the one being guessed at.
ok('  that placeholder blocks no night', /DTSTART;VALUE=DATE:(\d{8})\r\nDTEND;VALUE=DATE:\1/.test(ics2));

// ══ 5. THE FEED IS NOT ALLOWED TO DIE QUIETLY ═════════════════════════════
console.log('\nWhen the database will not answer');

globalThis.fetch = async () => ({ ok:false, status:500, json: async () => ({}) });
const res3 = await generateIcalFeed('x', 'Broken', 'abc123');
// ══ 5. TELLING ONE CHANNEL, AND ONLY ONE, TO LET A DATE GO ════════════════
//
// Airbnb held 14–17 December on Speranta a day after Frank Olyn's booking
// was deleted. Dropping an event is not a cancellation; the protocol's way
// to say "release this" is the same UID with STATUS:CANCELLED. That is the
// change that coincided with LekkeSlaap refusing the whole calendar on
// 9 October, so it is now per-channel and OFF unless the token asks.
console.log('\n── Cancellations, on an opt-in feed only ──');

// Removed rows: one ordinary, one caretaker, one 147-night glitch, one far
// older than the window the feed looks at.
const GONE = [
  { id:207, guest_name:'Frank Olyn',     check_in_date:'2026-12-14', check_out_date:'2026-12-17', notes:null },
  { id:193, guest_name:'Tino Caretaker', check_in_date:'2026-12-20', check_out_date:'2026-12-22', notes:null },
  { id:664, guest_name:'Blocked',        check_in_date:'2027-02-01', check_out_date:'2027-06-28', notes:null },
  { id:570, guest_name:'Booking.com Guest', check_in_date:'2026-11-04', check_out_date:'2026-11-06', notes:null },
];
let calls = [];
globalThis.fetch = async (url) => {
  calls.push(String(url));
  const gone = String(url).includes('is_active.eq.false');
  return { ok:true, status:200, json: async () => (gone ? GONE : LIVE) };
};

const resT = await generateIcalFeed('83b2a84a-5451-4be5-a84f-2efc0d2602d5', 'TV House', 'tvhouse',
                                    { tombstones: true });
const icsT = await resT.text();

ok('with tombstones on, cancellations are published',
   (icsT.match(/STATUS:CANCELLED/g) || []).length >= 1);
ok('  the UID matches the one the channel already imported',
   icsT.includes('UID:hep-tvhouse-207@snapartments.co.za'),
   'the UID comes from the SHORT KEY, not the token — that is what makes this work at all');
ok('  and the sequence is bumped so it is seen as an update',
   /UID:hep-tvhouse-207@snapartments\.co\.za[\s\S]*?SEQUENCE:1[\s\S]*?STATUS:CANCELLED/.test(icsT));
ok('  over the dates Airbnb is still holding',
   /DTSTART;VALUE=DATE:20261214\r\nDTEND;VALUE=DATE:20261217/.test(icsT));

ok('a caretaker row is NOT tombstoned', !icsT.includes('hep-tvhouse-193@'),
   'it was never published, so cancelling it says something that was never said');
ok('a 147-night glitch is NOT tombstoned', !icsT.includes('hep-tvhouse-664@'));
// Per EVENT, not across the document — a lazy match would happily run from
// one event's UID to a later event's STATUS line and report a bug that is
// not there.
const eventsOf = (txt) => txt.split('BEGIN:VEVENT').slice(1).map(e => e.split('END:VEVENT')[0]);
const cancelledUids = eventsOf(icsT)
  .filter(e => e.includes('STATUS:CANCELLED'))
  .map(e => (e.match(/UID:([^\r\n]+)/) || [])[1]);
ok('a row still live in the same feed is NOT tombstoned',
   !cancelledUids.includes('hep-tvhouse-570@snapartments.co.za'),
   'cancelling a booking we are still publishing would put a real stay back on sale: ' + cancelledUids.join(', '));
ok('  exactly one cancellation, the one that is genuinely gone',
   cancelledUids.length === 1 && cancelledUids[0] === 'hep-tvhouse-207@snapartments.co.za',
   cancelledUids.join(', ') || '(none)');
ok('the live bookings are still published',
   /DTSTART;VALUE=DATE:20261104/.test(icsT) && /DTSTART;VALUE=DATE:20261201/.test(icsT));

ok('the removed-rows query is bounded by age', calls.some(u => u.includes('updated_at=gte.')),
   'June left 150 dead placeholder rows; a feed mostly made of tombstones is the shape suspected of breaking LekkeSlaap');
ok('  and by count', calls.some(u => u.includes('limit=40')));
ok('  and asks only for future dates', calls.some(u => u.includes('is_active.eq.false') && u.includes('check_out_date=gte.')));

// The default feed must not have moved a single byte.
console.log('\n── And the shared feed is untouched ──');
calls = [];
globalThis.fetch = async (url) => { calls.push(String(url)); return { ok:true, status:200, json: async () => LIVE }; };
const resD = await generateIcalFeed('83b2a84a-5451-4be5-a84f-2efc0d2602d5', 'TV House', FEED_ID);
const icsD = await resD.text();
ok('no cancellations without the opt-in', !icsD.includes('STATUS:CANCELLED'));
ok('  and still exactly one fetch', calls.length === 1, String(calls.length));
ok('  byte-identical to the feed before this change',
   icsD.replace(/DTSTAMP:[0-9TZ]+/g, '') === ics.replace(/DTSTAMP:[0-9TZ]+/g, ''),
   'LekkeSlaap and Booking.com must see exactly what they saw yesterday');

// A failure fetching the removed rows must never break the calendar.
globalThis.fetch = async (url) => {
  if (String(url).includes('is_active.eq.false')) throw new Error('network');
  return { ok:true, status:200, json: async () => LIVE };
};
const resF = await generateIcalFeed('83b2a84a-5451-4be5-a84f-2efc0d2602d5', 'TV House', 'tvhouse',
                                    { tombstones: true });
const icsF = await resF.text();
ok('a failure fetching cancellations still yields a valid calendar',
   resF.status === 200 && icsF.includes('END:VCALENDAR') && icsF.includes('DTSTART;VALUE=DATE:20261104'),
   'a feed that holds a date too long loses one booking; one that fails to build puts every booked night on sale');

ok('a failed lookup is an error, not an empty calendar', res3.status === 500,
   'an empty 200 would tell every channel the property is completely free');

// ── Result ────────────────────────────────────────────────────────
console.log('');
if (fail.length) {
  console.log(`✗ ${fail.length} check(s) failed:`);
  fail.forEach(f => console.log('   - ' + f));
  process.exit(1);
}
console.log('✓ ical feed shape: all checks passed');
