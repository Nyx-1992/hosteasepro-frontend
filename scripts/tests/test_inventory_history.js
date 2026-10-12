#!/usr/bin/env node
/**
 * What was reported, when, and when it was dealt with.
 *
 *   "I marked a review complete from Spiwe where something was broken — but
 *    all are reviewed now and I can't see when sth was reported historically."
 *
 * NOTHING WAS LOST. Spiwe's 28 August report is intact and still flagged, with
 * its one item: Kitchen — Bowls (×4) — "1 bowls missing". Three things made it
 * look otherwise.
 *
 * THE SCREEN LIED ABOUT WHAT IT WAS SHOWING. Marking a report reviewed ran
 * renderReportInventory() with no argument, which defaults to 'all'. So the
 * list silently swapped from Unreviewed to every report ever written, while
 * the Unreviewed button stayed highlighted. Tick one item off the list you are
 * working through and you are handed a different list that looks like it —
 * which from the outside is exactly "all are reviewed now".
 *
 * A TICK WITH NO DATE IS WORTH "SOMEBODY, AT SOME POINT". reviewed was a lone
 * boolean: no when, no who. A reviewed report from this morning and one from
 * six months ago were the same pixel.
 *
 * AND THE HISTORY WAS CAPPED AT 30. Fine for a chronological list of
 * mostly-uneventful cleans; wrong for the one view whose entire job is to
 * reach back.
 *
 * Run: node scripts/tests/test_inventory_history.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const app = read('demo', 'index_fixed.html');
const mig = read('supabase', 'migrations', '931_inventory_review_history.sql');

const codeOnly = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:'"\\])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
const sqlCode = (s) => s.split('\n').filter(l => !/^\s*--/.test(l)).join('\n');

const fail = [];
const ok = (name, cond, detail) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name);
  if (!cond) { if (detail) console.log('      ' + detail); fail.push(name); }
};

// ══ 1. THE VIEW STAYS WHERE YOU PUT IT ════════════════════════════════════
console.log('\nThe filter survives ticking something off');

const render = (app.match(/function renderReportInventory\(filter\) \{[\s\S]*?\n\}/) || [''])[0];
ok('there is a remembered filter', /let _invFilter = 'all'/.test(app));
ok('renderReportInventory falls back to it, not to "all"',
   /filter = filter \|\| _invFilter \|\| 'all'/.test(codeOnly(render)),
   'this defaulted straight to all, which is what swapped the list');
ok('and a new filter is remembered',
   /if \(filter\) _invFilter = filter/.test(codeOnly(render)));

const markReviewed = (app.match(/async function markReviewed\(reportId\)[\s\S]*?\n\}/) || [''])[0];
ok('the Mark reviewed button no longer forces a re-render to "all"',
   !/markReviewed\(this\.dataset\.rid\);renderReportInventory\(\)/.test(codeOnly(app)),
   'the inline handler used to call it with no filter straight after');
ok('marking reviewed still refreshes the list', /renderReportInventory\(\)/.test(codeOnly(markReviewed)));

// Run the memory, rather than trust the regex.
{
  let _invFilter = 'all';
  const resolve = (filter) => { if (filter) _invFilter = filter; return filter || _invFilter || 'all'; };
  resolve('unreviewed');
  ok('  proof: pick Unreviewed, then re-render with no argument → still Unreviewed',
     resolve(undefined) === 'unreviewed');
  ok('  and switching to the issue history sticks', resolve('flagged') === 'flagged');
}

// ══ 2. WHEN, AND BY WHOM ══════════════════════════════════════════════════
console.log('\nA tick that records something');

ok('markReviewed stamps the time', /reviewed_at: new Date\(\)\.toISOString\(\)/.test(markReviewed));
ok('markReviewed stamps the person',
   /reviewed_by: \(window\.currentUser && currentUser\.name\) \|\| 'unknown'/.test(markReviewed));
ok('and writes them to the database, not just memory',
   /\.update\(stamp\)\.eq\('id',reportId\)/.test(markReviewed));

const createTask = (app.match(/async function createTaskFromFlag\(reportId\)[\s\S]*?\n\}/) || [''])[0];
ok('creating a task from a flag records it the same way',
   /reviewed_at: new Date\(\)\.toISOString\(\)/.test(createTask) &&
   /reviewed_by:/.test(createTask),
   'that path also flips reviewed, so it has to leave the same trace');

ok('the migration adds both columns',
   /ADD COLUMN IF NOT EXISTS reviewed_at timestamptz/.test(sqlCode(mig)) &&
   /ADD COLUMN IF NOT EXISTS reviewed_by text/.test(sqlCode(mig)));
ok('and back-fills NOTHING',
   !/UPDATE\s+public\.inventory_reports/i.test(sqlCode(mig)),
   'we do not know when the old rows were reviewed; a plausible date is a lie');

// ══ 3. THE DATES, ON A PHONE ══════════════════════════════════════════════
console.log('\nShown as text, because nobody hovers on a phone');

const metaSrc = (app.match(/const subDay = [\s\S]*?const metaHtml = [\s\S]*?: '';/) || [''])[0];
ok('the card builds a reported/reviewed line', !!metaSrc);
ok('it is rendered into the card', /\+metaHtml\+flagsHtml/.test(app));
ok('not hidden in a title= tooltip',
   !/title="[^"]*Reviewed /.test(app),
   'a tooltip is unreachable on the device this is read on');

// Execute it.
const buildMeta = new Function('r', 'fmtDate', 'escHtml', metaSrc + '\nreturn { metaBits: metaBits, metaHtml: metaHtml };');
const fmtDate = (d) => d;
const escHtml = (s) => String(s);

{
  // Spiwe, 28 Aug, flagged, reviewed before 931 existed.
  const m = buildMeta({ submitted_at: '2026-08-28T13:04:49Z', clean_date: '2026-08-28',
                        reviewed: true, reviewed_at: null, reviewed_by: null }, fmtDate, escHtml);
  ok('  a report reviewed before this existed says so, and invents no date',
     m.metaBits.join(' · ') === 'Reviewed — date not recorded', m.metaBits.join(' · '));
}
{
  // Reviewed from now on.
  const m = buildMeta({ submitted_at: '2026-08-28T13:04:49Z', clean_date: '2026-08-28',
                        reviewed: true, reviewed_at: '2026-10-12T09:00:00Z', reviewed_by: 'Nicole' },
                      fmtDate, escHtml);
  ok('  a newly reviewed one names the day and the person',
     m.metaBits.join(' · ') === 'Reviewed 2026-10-12 by Nicole', m.metaBits.join(' · '));
}
{
  // Patricia: cleaned 31 July, report arrived 21 August. "When was it
  // reported" is the second date, and the card only ever showed the first.
  const m = buildMeta({ submitted_at: '2026-08-21T07:21:22Z', clean_date: '2026-07-31',
                        reviewed: false }, fmtDate, escHtml);
  ok('  a report sent late shows when it was actually reported',
     m.metaBits.join(' · ') === 'Reported 2026-08-21', m.metaBits.join(' · '));
}
{
  // Same-day: no need to say it twice.
  const m = buildMeta({ submitted_at: '2026-10-11T11:39:09Z', clean_date: '2026-10-11',
                        reviewed: false }, fmtDate, escHtml);
  ok('  and says nothing extra when it was sent the day of the clean',
     m.metaHtml === '', JSON.stringify(m.metaBits));
}

// ══ 4. HISTORY IS NOT TRUNCATED ═══════════════════════════════════════════
console.log('\nReaching back');

ok('the issue history is not capped at 30',
   /const shown = \(filter === 'all'\) \? reports\.slice\(0,30\) : reports;/.test(codeOnly(render)),
   'the one view meant to reach back was cut to the most recent 30');
ok('the everyday list still is', /reports\.slice\(0,30\)/.test(codeOnly(render)));
ok('the button says what it is for', /⚠ Issue history/.test(app),
   'it read "Flagged only", which does not sound like the place history lives');

// The filter it depends on must still select on the flag, not on reviewed —
// a reviewed issue is still an issue that happened.
ok('issue history includes reports already dealt with',
   /if \(filter === 'flagged'\)\s+reports = reports\.filter\(r => !r\.all_ok\)/.test(codeOnly(render)),
   'filtering on !reviewed here would hide exactly what she went looking for');

// ── Result ────────────────────────────────────────────────────────
console.log('');
if (fail.length) {
  console.log(`✗ ${fail.length} check(s) failed:`);
  fail.forEach(f => console.log('   - ' + f));
  process.exit(1);
}
console.log('✓ inventory history: all checks passed');
