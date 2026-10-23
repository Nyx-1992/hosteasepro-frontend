#!/usr/bin/env node
/**
 * Saying what a blocked night is FOR — and being able to see it afterwards.
 *
 *   "I blocked the TV house for one day where the electrician is fixing the
 *    DB Board. I wasn't able to choose a category for blocking, only adding
 *    it for a guest booking."
 *
 * WHAT SHE ACTUALLY HAD TO DO. Booking 683 went in as a CONFIRMED guest
 * booking called "Maintenance", platform manual, 1 guest, R0. Nothing
 * downstream can tell that apart from a real arrival: it counts as an
 * upcoming stay, it becomes the property's "next" arrival on the lane
 * header, generate_daily_service books a turnover clean for the morning the
 * electrician leaves, and a zero-revenue night drags the average nightly
 * rate down.
 *
 * AND THE PROPER ROUTE WAS NO BETTER — WHICH IS THE REAL BUG. The status
 * list already offered "Blocked — not bookable". But renderLaneView filters
 * `status !== 'blocked'`, so a correctly-made block DISAPPEARED from the
 * Bookings tab altogether. Blocking a night properly meant blocking it
 * invisibly. A category dropdown alone would have shipped a label nobody
 * could read, on a card nobody could see.
 *
 * WHY THE CATEGORY CANNOT LIVE IN guest_name. nb() reads a blocked row
 * carrying a real-looking name as a misclassified booking and flips it to
 * 'confirmed' — correct for the feed quirk it was written for, and exactly
 * wrong for a block called "Maintenance". Hence its own column.
 *
 * Run: node scripts/tests/test_block_reasons.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const app  = read('demo', 'index_fixed.html');
const feed = read('api', '_lib', 'icalFeed.js');
const mig  = read('supabase', 'migrations', '934_block_reasons.sql');

const codeOnly = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:'"\\])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
const sqlCode = (s) => s.split('\n').filter(l => !/^\s*--/.test(l)).join('\n');

const fail = [];
const ok = (name, cond, detail) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name);
  if (!cond) { if (detail) console.log('      ' + detail); fail.push(name); }
};

// Pull the real definitions out of the app rather than restating them.
const reasonsSrc = (app.match(/const BLOCK_REASONS = \[[\s\S]*?\n\];/) || [''])[0];
const pickerSrc  = (app.match(/const blockReason = k =>[^\n]*\n/) || [''])[0];
const labelSrc   = (app.match(/function blockLabel\(b\) \{[\s\S]*?\n\}/) || [''])[0];
const shortSrc   = (app.match(/function blockShort\(b\) \{[\s\S]*?\n\}/) || [''])[0];
const PLAT_LABELS = { booking:'Booking.com', airbnb:'Airbnb', lekkeslaap:'LekkeSlaap', direct:'Direct (HEP page)' };
const runLabel = (b) => new Function('PLATFORM_LABELS', 'b',
  reasonsSrc + pickerSrc + labelSrc + '\nreturn blockLabel(b);')(PLAT_LABELS, b);
const runShort = (b) => new Function('b',
  reasonsSrc + pickerSrc + shortSrc + '\nreturn blockShort(b);')(b);
const KEYS = [...reasonsSrc.matchAll(/key:'([a-z]+)'/g)].map(m => m[1]);

// ══ 1. THERE IS SOMETHING TO CHOOSE ═══════════════════════════════════════
console.log('\nThe categories');

ok('a fixed set of reasons exists', KEYS.length >= 3, KEYS.join(', '));
ok('  maintenance is one of them — it is the case that prompted this',
   KEYS.includes('maintenance'));
ok('  and there is a neutral fallback for anything else',
   KEYS.includes('other'));
ok('the migration documents the same set it will receive',
   KEYS.every(k => mig.includes(k)),
   'the column comment is the only description the database has');

ok('the picker only appears when the status is a block',
   /id="b-block-reason-field"[^>]*style="display:none"/.test(app) &&
   /rf\.style\.display = blocked \? '' : 'none'/.test(app));
ok('it is one row of chips, not a dropdown',
   /function blockReasonChips\(selected, mkOnclick\)/.test(app),
   'on a phone, four visible taps beat a select that has to be opened');

// ══ 2. CHOOSING IS OPTIONAL ═══════════════════════════════════════════════
console.log('\nSkipping it still blocks the night');

const saveBooking = (app.match(/async function saveBooking\(\)[\s\S]*?\n\}/) || [''])[0];
ok('the label says so in the form', /What is it for\?[\s\S]{0,120}optional/i.test(app));
ok('no category saves as null, not as a placeholder string',
   /block_reason: isBlock \? \(_blockReason \|\| null\) : null/.test(codeOnly(saveBooking)));
ok('  and nothing refuses the save for want of one',
   !/_blockReason[\s\S]{0,80}toast\(/.test(codeOnly(saveBooking)),
   'holding a night back must stay one tap and two dates');
ok('tapping the chosen chip again clears it',
   /_blockReason = \(_blockReason === key\) \? null : key;/.test(app),
   'otherwise a mis-tap is permanent and needs a fifth "none" chip to undo');
ok('a guest booking never carries one',
   /: null,/.test((codeOnly(saveBooking).match(/block_reason:.*/) || [''])[0]));
ok('and the form forgets the last block when it reopens',
   /_blockReason = null;\s*\n\s*bmBlockMode\(\);/.test(app));

// ══ 3. THE CATEGORY MUST NOT TOUCH guest_name ═════════════════════════════
console.log('\nWhy it is its own column');

const nbSrc = (app.match(/function nb\(b\) \{[\s\S]*?\n\}/) || [''])[0];
const runNb = (b) => new Function('UUID_MAP','PROPS','propKeyOf','isRealGuestName','blockLabel','b',
  nbSrc + '\nreturn nb(b);')(
    {}, { tv:{ name:'TV House' } }, () => 'tv',
    (n) => !!n && !['', 'blocked', '🔒 blocked', 'not available', 'guest'].includes(n.trim().toLowerCase()),
    runLabel, b);

{
  // The workaround, run through the real normaliser.
  const asName = runNb({ status:'blocked', guest_name:'Maintenance', platform:'manual',
                         property_name:'TV House', check_in_date:'2026-10-27', check_out_date:'2026-10-28' });
  ok('  proof: a block NAMED "Maintenance" is promoted to a confirmed booking',
     asName.status === 'confirmed',
     'got ' + asName.status + ' — this is why the category needed a column of its own');

  const proper = runNb({ status:'blocked', guest_name:'🔒 Blocked', block_reason:'maintenance',
                         platform:'manual', property_name:'TV House',
                         check_in_date:'2026-10-27', check_out_date:'2026-10-28' });
  ok('  and the same block with the category in its own column stays blocked',
     proper.status === 'blocked', 'got ' + proper.status);
  ok('  while still reading "Maintenance" on screen',
     proper.display_name === '🔧 Maintenance', proper.display_name);

  const guest = runNb({ status:'confirmed', guest_name:'Kajsa Falasca', platform:'booking',
                        property_name:'TV House', check_in_date:'2027-01-01', check_out_date:'2027-01-07' });
  ok('  a real guest is still named after the guest',
     guest.display_name === 'Kajsa Falasca', guest.display_name);
}

ok('the free text still has somewhere to go',
   /nL\.textContent\s*=\s*blocked \? 'Detail/.test(app) &&
   /electrician — DB board/.test(app),
   'the chip is the category; notes is what makes it actionable');

// ══ 4. A BLOCK WITH NO CATEGORY ═══════════════════════════════════════════
console.log('\nBlocks that were never categorised');

ok('an old hand-made block reads plainly',
   runLabel({ status:'blocked', platform:'manual' }) === '🔒 Blocked',
   runLabel({ status:'blocked', platform:'manual' }));
ok('one mirrored from a feed says where it came from',
   runLabel({ status:'blocked', platform:'booking', source_uid:'abc@booking.com' }) === '🔒 Blocked on Booking.com',
   runLabel({ status:'blocked', platform:'booking', source_uid:'abc@booking.com' }));
ok('  which is read off source_uid, the thing that actually records it',
   /b\.source_uid/.test(labelSrc),
   'the importers set it and a hand-made block never has one');
ok('so the migration back-fills nothing',
   !/UPDATE\s+public\.bookings/i.test(sqlCode(mig)),
   'every existing blocked row is a feed mirror — a guessed category would replace a fact with an inference');
ok('the column is added and nothing else is touched',
   /ADD COLUMN IF NOT EXISTS block_reason text/.test(sqlCode(mig)) &&
   !/DROP|NOT NULL|CONSTRAINT/i.test(sqlCode(mig)));

// ══ 5. THE CALENDAR BAR ═══════════════════════════════════════════════════
console.log('\nThe label has to survive the calendar bar');

ok('the bar uses a short form for blocks',
   /isBlockRow\(b\) \? blockShort\(b\)/.test(app));
{
  // The bar takes the first word and cuts it to ten characters.
  const squeeze = (s) => s.split(' ')[0].slice(0, 10);
  ok('  proof: squeezing "🔧 Maintenance" that way leaves just the emoji',
     squeeze('🔧 Maintenance') !== 'Maintenance' && squeeze('🔧 Maintenance').length <= 2,
     JSON.stringify(squeeze('🔧 Maintenance')));
  ok('  the short form survives it intact',
     squeeze(runShort({ block_reason:'maintenance' })) === runShort({ block_reason:'maintenance' }),
     runShort({ block_reason:'maintenance' }));
  KEYS.forEach(k => {
    const s = runShort({ block_reason:k });
    ok('  ' + k + ' → "' + s + '"', s.length > 0 && s.length <= 10 && !/\s/.test(s));
  });
}

// ══ 6. A BLOCK IS VISIBLE ON THE BOOKINGS TAB ═════════════════════════════
console.log('\nThe half that makes the label worth having');

const lane = (app.match(/function renderLaneView\(\)[\s\S]*?\n\}\n\nfunction openBookingDetail/) || [''])[0];
ok('blocks are collected for the rail',
   /const blocksProp = bookings\.filter\([\s\S]{0,180}?b\.status==='blocked'/.test(lane));
{
  // Ours only. The TV House carries ten platform-mirrored blocks running
  // into 2028, including LekkeSlaap echo runs of 57, 95 and 182 nights —
  // listing those would bury the three real stays under rows nobody can
  // act on. They stay grey on the calendar, where the echo loop was found.
  const src = (lane.match(/const blocksProp = bookings\.filter\([\s\S]*?\);/) || [''])[0];
  const run = new Function('bookings','pid', src + '\nreturn blocksProp;');
  const rows = [
    { id:'mine', property_id:'tv', is_active:true, status:'blocked', block_reason:'maintenance', source_uid:null },
    { id:'echo', property_id:'tv', is_active:true, status:'blocked', source_uid:'1351565941@lekkeslaap.co.za' },
  ];
  ok('  only the ones made here, never a platform mirror',
     run(rows, 'tv').map(b => b.id).join(',') === 'mine',
     run(rows, 'tv').map(b => b.id).join(',') || '(none)');
}
ok('  and rendered beside the stays, in date order',
   /const rail = shown\.filter\([\s\S]{0,60}?\)\.concat\(shownBlocks\)/.test(lane));
ok('  with their own card',
   /if \(isBlockRow\(b\)\) return blockLaneCard\(b, today\)/.test(codeOnly(lane)));
ok('  and counted separately in the footer',
   /shownBlocks\.length\?`[^`]*blocked/.test(lane),
   'a held night is not a booking, so it must not inflate "3 bookings shown"');
ok('the empty state accounts for them too',
   /\$\{rail\.length===0&&!current \?/.test(lane),
   'a property with nothing but a block is not empty');

ok('but they stay OUT of the stay counters',
   /const allProp = bookings\.filter\([\s\S]{0,160}?b\.status!=='blocked'\)/.test(lane),
   'Pending / Upcoming / Next and the current-guest card count stays');
{
  // Upcoming / Next are both derived from allProp — prove the filter drops
  // a block before they are computed.
  const allPropSrc = (lane.match(/const allProp = bookings\.filter\([\s\S]*?\);/) || [''])[0];
  const run = new Function('bookings','pid','isOwnerStay',
    allPropSrc + '\nreturn allProp;');
  const rows = [
    { id:1, property_id:'tv', is_active:true, status:'confirmed', guest_name:'Kajsa Falasca' },
    { id:2, property_id:'tv', is_active:true, status:'blocked', guest_name:'🔒 Blocked', block_reason:'maintenance' },
  ];
  const got = run(rows, 'tv', (b) => (b.guest_name||'').toLowerCase().includes('owner'));
  ok('  proof: the maintenance day is not an upcoming arrival',
     got.length === 1 && got[0].id === 1, JSON.stringify(got.map(r => r.id)));
}

// The upcoming/past split for blocks: a block has no check-in to be
// "upcoming" from, so it splits on whether it is over.
{
  const src = (lane.match(/const shownBlocks = [\s\S]*?: true\);/) || [''])[0];
  ok('there is a filter rule for blocks', !!src);
  const run = (filter, blocks) => new Function('bookingFilter','today','blocksProp',
    src + '\nreturn shownBlocks;')(filter, '2026-10-23', blocks);
  const past    = { id:'p', check_in:'2026-10-01', check_out:'2026-10-02' };
  const running = { id:'r', check_in:'2026-10-22', check_out:'2026-10-24' };
  const future  = { id:'f', check_in:'2026-10-27', check_out:'2026-10-28' };
  const all = [past, running, future];
  const ids = (f) => run(f, all).map(b => b.id).sort().join(',');
  ok('  upcoming shows the one running today and the one to come', ids('upcoming') === 'f,r', ids('upcoming'));
  ok('  past shows only the finished one', ids('past') === 'p', ids('past'));
  ok('  all shows all three', ids('all') === 'f,p,r', ids('all'));
  ok('  every block lands in exactly one of upcoming/past',
     run('upcoming', all).length + run('past', all).length === all.length);
  ok('  and none of them are pending approval or cancelled',
     run('pending', all).length === 0 && run('cancelled', all).length === 0,
     'a held night cannot be approved, declined or cancelled');
}

// ══ 7. THE BLOCK CARD IS NOT A GUEST CARD ═════════════════════════════════
console.log('\nWhat the card does not show');

const card = (app.match(/function blockLaneCard\(b, today\)[\s\S]*?\n\}/) || [''])[0];
ok('the block card exists', !!card);
ok('  no head count', !/👥/.test(card), 'a held night has no guests');
ok('  no cleaning button', !/bookCleaningForGuest/.test(card),
   'nobody is sent to clean an empty flat — migration 930 already stops the automatic one');
ok('  no check-in/check-out lifecycle dots', !/ninaBTaskProgress/.test(card));
ok('  no approve/decline', !/approveBooking|declineBooking/.test(card));
ok('  it says plainly that the nights are held', /Not bookable/.test(card));
ok('  it shows the free-text detail', /b\.notes/.test(card));
ok('  and it can still be opened', /openBookingDetail/.test(card));
ok('the nights come off the dates, not the nights column',
   /Math\.round\(\(new Date\(b\.check_out\) - new Date\(b\.check_in\)\)/.test(card),
   'that column disagrees with its own dates on live rows');
ok('the detail is escaped before it reaches the page',
   /escHtml\(String\(b\.notes\)/.test(card));

// ══ 8. CHANGING IT AFTERWARDS ═════════════════════════════════════════════
console.log('\nCorrecting a mis-tap');

const setter = (app.match(/async function bdSetBlockReason\(bookingId, key\)[\s\S]*?\n\}/) || [''])[0];
ok('the booking detail offers the same chips', /id="bd-reasons-\$\{b\.id\}"/.test(app));
ok('  only on a block', /\$\{isBlockRow\(b\) \? `/.test(app));
ok('there is a handler', !!setter);
ok('  it refuses to run on anything that is not a block',
   /if \(!b \|\| !isBlockRow\(b\)\) return;/.test(setter));
ok('  tapping the current one clears it', /const next = \(b\.block_reason === key\) \? null : key;/.test(setter));
ok('  a failed write is reported, not swallowed', /Could not save that/.test(setter));
ok('  the in-memory row and its label are updated together',
   /b\.block_reason = next;\s*\n\s*b\.display_name = blockLabel\(b\);/.test(setter),
   'otherwise the card keeps the old category until the next reload');

// ══ 9. NONE OF THIS LEAVES THE BUILDING ═══════════════════════════════════
console.log('\nThe platforms are told nothing new');

ok('the outbound feed still publishes blocked rows',
   /status=in\.\([^)]*blocked[^)]*\)/.test(feed));
ok('and they still go out as "Not Available"',
   /b\.status === 'blocked'\s*\?\s*'Not Available'/.test(feed));
ok('the feed never reads block_reason',
   !/block_reason/.test(feed),
   'Booking.com needs to know the night is gone, not that our electrician is coming');

// ── Result ────────────────────────────────────────────────────────
console.log('');
if (fail.length) {
  console.log(`✗ ${fail.length} check(s) failed:`);
  fail.forEach(f => console.log('   - ' + f));
  process.exit(1);
}
console.log('✓ block reasons: all checks passed');
