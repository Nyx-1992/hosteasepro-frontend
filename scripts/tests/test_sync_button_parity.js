#!/usr/bin/env node
/**
 * The Sync button and the cron must agree about deleted bookings.
 *
 * WHY THIS EXISTS. Owner, 23 November: "Again a cancelled booking which is
 * not removed... we got a new reservation around this time frame now (old
 * is Frank, new is Edward)."
 *
 * Frank Olyn was deleted on 11 November. On 23 November he was back in
 * Upcoming on Speranta Flat, with a real new Booking.com guest reserved
 * over the top of the same nights. Nothing had un-deleted him: the cron
 * importer skips a row whose is_active is false, but the in-app Sync
 * button carried `const updates = { is_active: true }` and re-opened
 * whatever it matched. Delete worked, and then the next Sync undid it.
 *
 * TWO IMPORTERS, ONE SET OF RULES. The repository has a server importer
 * (api/_lib/icalImport.js, run by cron) and a browser one (the Sync
 * button in demo/index_fixed.html). They read the same feeds and write
 * the same table, so a rule fixed in one is a bug still live in the
 * other until it is fixed in both. These checks pin the two rules that
 * had already drifted; they are textual because the browser importer is
 * not loadable outside a page.
 *
 * Run: node scripts/tests/test_sync_button_parity.js
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

const html = read('demo', 'index_fixed.html');
const cron = read('api', '_lib', 'icalImport.js');

// Comments are prose and say the opposite of the code they warn about, so
// an "absence" check has to read code only.
const codeOnly = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
  .replace(/^[ \t]*\/\/.*$/gm, '');

const htmlCode = codeOnly(html);
const cronCode = codeOnly(cron);

console.log('\nDeleted means deleted, in both importers\n');

ok('cron skips a row that was deleted here',
   /is_active\s*===\s*false\s*\)\s*\{[^}]*continue/.test(cronCode),
   'the server importer lost its delete guard');

ok('Sync button skips a row that was deleted here',
   /is_active\s*===\s*false\s*\)\s*\{[^}]*continue/.test(htmlCode),
   'Sync would resurrect a deleted booking — this is the Frank Olyn bug');

ok('Sync button never force-opens is_active on a match',
   !/const\s+updates\s*=\s*\{\s*is_active:\s*true\s*\}/.test(htmlCode),
   'found `const updates = { is_active: true }` — every match re-opens the row');

ok('the skip is counted, not silent',
   /totalSkipped\s*\+\+/.test(htmlCode) && /totalSkipped\s*\?/.test(htmlCode),
   'a deleted booking still in the feed must be reported in the sync summary');

console.log('\nTouching is not overlapping\n');

// A stay ending the day another begins shares no night with it. lte/gte
// are both true in that case, so the overlap fallback matched the
// outgoing booking and overwrote it, losing the changeover clean.
const overlapBlock = (htmlCode.match(/byOverlap[\s\S]{0,700}?limit\(1\)/) || [''])[0];

ok('browser overlap fallback found',
   overlapBlock.length > 0,
   'could not locate the byOverlap query — update this test');

ok('browser overlap fallback uses strict inequalities',
   /\.lt\(\s*'check_in_date'/.test(overlapBlock) &&
   /\.gt\(\s*'check_out_date'/.test(overlapBlock),
   'lte/gte collapses a same-day turnover into one booking');

ok('browser overlap fallback no longer uses lte/gte',
   !/\.lte\(\s*'check_in_date'/.test(overlapBlock) &&
   !/\.gte\(\s*'check_out_date'/.test(overlapBlock),
   'the inclusive comparison is still there');

ok('cron overlap fallback uses strict inequalities',
   /check_in_date=lt\./.test(cronCode) && /check_out_date=gt\./.test(cronCode),
   'the server importer regressed to an inclusive overlap');

console.log('');
if (fail.length) {
  console.log(`${fail.length} failing:`);
  fail.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
console.log('All sync-parity checks passed.\n');
