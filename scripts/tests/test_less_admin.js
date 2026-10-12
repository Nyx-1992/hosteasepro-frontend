#!/usr/bin/env node
/**
 * Less admin, and a reminder only when it is true.
 *
 *   "it can be all very overwhelming. we don't get things done or the
 *    domestics fill out the stuff as it's too much admin … I want maybe a
 *    weekly whatsapp reminder … or is this too much and spam?"
 *
 * HALF OF IT WAS SPAM, AND THE NUMBERS SAID WHICH HALF.
 *
 * Inventory reports came back for 71%, 100%, 80% and 100% of completed cleans
 * across July to October 2026. The domestics were not failing to submit —
 * they were submitting almost every time. Reminding four people weekly to do
 * something they already do is how a number gets muted, and the message that
 * matters gets muted with it.
 *
 * WHAT THE FORM COLLECTED IS THE ACTUAL PROBLEM. Twenty reports: seventeen
 * "all OK" with nothing attached, one that used the checklist, two with a
 * free-text note. The checklist is 41 items at Speranta and 48 at TV House,
 * and in three months it produced a single finding. Both reports that were
 * genuinely useful — "no toilet paper, Domestoes, dish wash", "mould cleaner
 * it was finish" — came through the note box underneath it.
 *
 * Nobody was being lazy. "All fine" was the only answer the form made cheap.
 * So the list stops being the question: the screen asks one thing, and saying
 * something is wrong is now the easy path instead of the 45-tap one.
 *
 * AVAILABILITY IS THE REAL GAP, and it is the half worth a message: Fatima
 * last set hers on 21 July, Blessing on 10 August, while Spiwe and Patricia
 * are current. So the nudge is availability only, to whoever is actually
 * stale.
 *
 * Run: node scripts/tests/test_less_admin.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const app = read('demo', 'index_fixed.html');
const dom = read('demo', 'domestic.html');

const codeOnly = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:'"\\])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));

const fail = [];
const ok = (name, cond, detail) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name);
  if (!cond) { if (detail) console.log('      ' + detail); fail.push(name); }
};

// ══ 1. ONE QUESTION, NOT FORTY-FIVE ═══════════════════════════════════════
console.log('\nThe cleaner is asked one thing');

ok('the screen opens on a question', /id="inv-triage"/.test(dom) && /data-t="invAskTitle"/.test(dom));
ok('with an all-clear that finishes there', /onclick="invAllGood\(\)"/.test(dom));
ok('and a way to say something is wrong', /onclick="invSomethingWrong\(\)"/.test(dom));
ok('the 45-item list starts hidden',
   /<div id="inventory-form" style="display:none"><\/div>/.test(dom),
   'it used to be the first and only thing on the screen');
ok('opening a clean always lands on the question, not where the last one ended',
   /invBackToTriage\(\);\s*\n\s*showScreen\('inventory'\)/.test(codeOnly(dom)));

const allGood = (dom.match(/function invAllGood\(\)[\s\S]*?\n\}/) || [''])[0];
ok('"All good" submits immediately', /submitInventory\(\)/.test(allGood));
ok('  and submits a genuinely empty report',
   /inventoryState = \{\}/.test(allGood) && /n\.value = ''/.test(allGood),
   'a leftover flag would be filed as a real finding');

// all_ok is derived, so an empty report must actually come out as all_ok.
const submit = (dom.match(/async function submitInventory\(\)[\s\S]*?\n\}/) || [''])[0];
ok('all_ok still means "no flags and no note"',
   /all_ok:flagged\.length===0&&!generalNote/.test(submit));
{
  const allOk = (flaggedLen, note) => flaggedLen === 0 && !note;
  ok('  proof: the all-clear path files all_ok = true', allOk(0, '') === true);
  ok('  proof: a note alone is NOT all_ok', allOk(0, 'geyser leaking') === false,
     'the two most useful reports to date were note-only');
}

// ══ 2. THE NOTE COMES FIRST ═══════════════════════════════════════════════
console.log('\nThe box that has produced every useful report');

const detail = (dom.match(/<div id="inv-detail"[\s\S]*?<button class="submit-btn green"/) || [''])[0];
ok('the note box is above the checklist in the "something is wrong" flow',
   detail.indexOf('inv-note') > -1 &&
   (detail.indexOf('inv-note') < detail.indexOf('inventory-form')),
   'it used to sit underneath 45 rows');
ok('the checklist is opt-in, not a toll gate', /onclick="invToggleList\(\)"/.test(dom));
const wrong = (dom.match(/function invSomethingWrong\(\)[\s\S]*?\n\}/) || [''])[0];
ok('and the cursor goes straight into it', /n\.focus\(\)/.test(wrong));

const back = (dom.match(/function invBackToTriage\(\)[\s\S]*?\n\}/) || [''])[0];
ok('changing your mind clears every flag you ticked on the way',
   /inventoryState = \{\}/.test(back) &&
   /item-row\.flagged/.test(back) && /flag-input/.test(back),
   'otherwise "actually it is fine" files the flags anyway');

// ══ 3. FOUR LANGUAGES, OR IT IS NOT SHIPPED ═══════════════════════════════
console.log('\nEvery new word exists in every language');

const NEW_KEYS = ['invAskTitle','invAskSub','invAllGood','invWrong','invWhatsWrong',
                  'invShowList','invHideList','invNothingAfterAll'];
NEW_KEYS.forEach(k => {
  const n = (dom.match(new RegExp('\\b' + k + ':', 'g')) || []).length;
  ok('  ' + k + ' in all 4 languages', n === 4, 'found ' + n);
});
const used = [...new Set((dom.match(/data-t="(inv[A-Za-z]+)"/g) || [])
  .map(m => m.replace(/data-t="|"/g, '')))];
const missing = used.filter(u => !new RegExp('\\b' + u + ':').test(dom));
ok('no data-t on screen without a definition', missing.length === 0, missing.join(', '));

// ══ 4. THE REMINDER, AND WHO GETS IT ══════════════════════════════════════
console.log('\nA nudge only when it is true');

ok('staleness is measured on when they last SET availability',
   /const AVAIL_STALE_DAYS = 30/.test(app) && /function staleAvailabilityCleaners/.test(app));
ok('nothing is rendered when nobody is stale',
   /if \(!stale\.length\) \{ el\.innerHTML = ''; return; \}/.test(codeOnly(app)),
   'a card that is always there is wallpaper');
ok('there is no reminder about inventory reports at all',
   !/remind.{0,40}inventory report/i.test(codeOnly(app)),
   'compliance is 71-100%; nagging about it is what mutes the number');

// Run the selector over the real production shape.
const staleSrc = (app.match(/function staleAvailabilityCleaners\(\)[\s\S]*?\n\}/) || [''])[0];
const NOW = Date.parse('2026-10-12T00:00:00Z');
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString();
const rows = [
  { cleaner:'Spiwe',    created_at: daysAgo(8),  date:'2026-11-01', available:true },
  { cleaner:'Patricia', created_at: daysAgo(9),  date:'2026-11-02', available:true },
  { cleaner:'Blessing', created_at: daysAgo(63), date:'2026-11-03', available:true },
  { cleaner:'Fatima',   created_at: daysAgo(83), date:'2027-01-05', available:true },
];
// The real team_contacts rows. An earlier version of this file invented a
// Fatima with no number to exercise the "no number" branch, and that fiction
// was then repeated to the owner as a fact about her own data. Every cleaner
// here has BOTH a contact phone and a separate, already-normalised `wa`.
const staff = [
  { name:'Spiwe',    phone:'084 915 0894', wa:'27849150894' },
  { name:'Patricia', phone:'063 735 3892', wa:'27637353892' },
  { name:'Blessing', phone:'062 532 2932', wa:'27625322932' },
  { name:'Fatima',   phone:'063 175 8111', wa:'27631758111' },
  { name:'Newcomer', phone:'082 777 8888', wa:'' },   // phone only — must fall back
  { name:'Nobody',   phone:'',             wa:'' },   // genuinely unreachable
];
// Take the threshold from the source too, so the test cannot drift from it.
const STALE_DAYS = Number((app.match(/const AVAIL_STALE_DAYS = (\d+)/) || [])[1]);
ok('  the threshold is readable and sane', STALE_DAYS >= 14 && STALE_DAYS <= 60, String(STALE_DAYS));

const run = new Function('cleanerAvailability','getDomesticStaff','Date_now','AVAIL_STALE_DAYS',
  staleSrc.replace('Date.now()', 'Date_now') + '\nreturn staleAvailabilityCleaners();');
const stale = run(rows, () => staff, NOW, STALE_DAYS);
const names = stale.map(c => c.name);

ok('  Fatima (83 days) is flagged', names.includes('Fatima'));
ok('  Blessing (63 days) is flagged', names.includes('Blessing'));
ok('  Spiwe (8 days) is NOT', !names.includes('Spiwe'),
   'nudging someone who did it last week is the spam she was worried about');
ok('  Patricia (9 days) is NOT', !names.includes('Patricia'));
ok('  somebody who has never set any is flagged', names.includes('Newcomer'));
ok('  worst offender first', names[0] === 'Newcomer' || names[0] === 'Nobody', names.join(', '));

ok('a cleaner with no number is shown, not silently dropped',
   /No WhatsApp number on their staff record/.test(app),
   'dropping them would hide somebody who may be the furthest behind');

// ── The number we actually message ────────────────────────────────────────
// team_contacts stores a separate, already-normalised `wa` next to `phone`.
// getDomesticStaff() used to drop it, so every message re-derived WhatsApp
// from the contact phone. They match for all four cleaners today, which is
// why it went unnoticed — and is no reason to keep guessing.
ok('getDomesticStaff passes the saved WhatsApp number through',
   /wa: c\.wa \|\| '',/.test(app),
   'it returned phone only, so `wa` could never be used');

const waSrc = (app.match(/function cleanerWaNumber\(c\)[\s\S]*?\n\}/) || [''])[0];
ok('there is one place that decides which number to use', !!waSrc);
{
  const pick = new Function('c', 'normalizeZaPhone',
    waSrc + '\nreturn cleanerWaNumber(c);');
  const nz = (raw) => { let d = (raw||'').replace(/\D/g,''); if (!d) return '';
    if (d.startsWith('0')) d = '27' + d.slice(1); else if (!d.startsWith('27')) d = '27' + d; return d; };
  ok('  Fatima is reachable on the number in her record',
     pick(staff[3], nz) === '27631758111', pick(staff[3], nz));
  ok('  the saved WhatsApp number wins over the contact phone',
     pick({ phone:'021 555 0000', wa:'27631758111' }, nz) === '27631758111',
     'a work landline must never be messaged instead of their WhatsApp');
  ok('  and the phone is used when no WhatsApp number is saved',
     pick(staff[4], nz) === '27827778888', pick(staff[4], nz));
  ok('  somebody with neither is reported, not messaged', pick(staff[5], nz) === '');
}

const nudge = (app.match(/function nudgeAvailability\(name\)[\s\S]*?\n\}/) || [''])[0];
ok('the message goes through the one delivery point',
   /deliverWhatsAppMessage\(phone, text\)/.test(nudge),
   'so swapping in a real Business API later is one function');
// This required normalizeZaPhone(c.phone) at this call site, which pinned the
// bug: it could only ever pass if the contact phone was the number used.
// The property is "whatever reaches WhatsApp is international form", and that
// now lives in cleanerWaNumber() — exercised against real numbers above.
ok('the number comes from the one helper that decides it',
   /cleanerWaNumber\(c\)/.test(nudge));
ok('  which normalises anything not already in international form',
   /normalizeZaPhone\(c && c\.phone\)/.test(waSrc));
ok('it asks for one specific thing, not "do your admin"',
   /My Availability/.test(nudge) && !/inventory/i.test(nudge));
ok('it names the agency from brand settings, not a hardcoded one',
   /CLIENT_BRAND && CLIENT_BRAND\.name/.test(nudge) &&
   !/S&N|Nicole|Silja/.test(codeOnly(nudge)));
ok('sending stays a human tap, never automatic',
   !/setInterval|cron/.test(codeOnly(nudge)));

// ── Result ────────────────────────────────────────────────────────
console.log('');
if (fail.length) {
  console.log(`✗ ${fail.length} check(s) failed:`);
  fail.forEach(f => console.log('   - ' + f));
  process.exit(1);
}
console.log('✓ less admin: all checks passed');
