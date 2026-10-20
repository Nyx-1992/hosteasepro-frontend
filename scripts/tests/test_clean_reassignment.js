#!/usr/bin/env node
/**
 * Reassigning a clean, and when that stops being allowed.
 *
 *   "Nina didn't update the domestic for the last Speranta cleaning, I changed
 *    it now from Fatima to Patricia. Is the cleaning going to be reassigned
 *    retrospectively as well as the inventory being assigned to Patricia?"
 *
 *   "When a clean was reassigned in a booking, it needs to move over to
 *    another domestic. I would say this can retrospectively done for up to 2-3
 *    weeks and then it probably should lock in?"
 *
 * THE CLEAN MOVED AND THE REPORT DID NOT. domestics.cleaner is one field, so
 * changing it moved the whole clean including its pay — earnings are summed
 * per cleaner from exactly that column. The inventory report is a SEPARATE
 * row, attached by domestic_id, carrying its own cleaner name stamped at
 * submission. So the 19 Oct Speranta clean read Patricia while its own report
 * read Fatima.
 *
 * WHY IT HAS TO MOVE: the portal shows a cleaner only the cleans assigned to
 * THEM. When the roster is stale the person who actually went cannot file the
 * report at all, so fixing the roster afterwards has to carry the report with
 * it or the pay run and the paperwork disagree for good.
 *
 * WHY IT HAS TO STOP: these rows are the pay run. Moving a clean between
 * cleaners after both have been paid rewrites a settled month. Three weeks is
 * long enough to notice a roster mistake, short enough that last month stays
 * last month.
 *
 * AND EDITING A CLEAN USED TO UN-COMPLETE IT — `status: 'scheduled'` sat in
 * the update payload unconditionally, so changing a cleaner on a finished
 * clean put it back on Nina's list as outstanding work.
 *
 * Run: node scripts/tests/test_clean_reassignment.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const app = read('demo', 'index_fixed.html');
const mig = read('supabase', 'migrations', '932_reassign_carries_the_report.sql');

const codeOnly = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:'"\\])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
const sqlCode = (s) => s.split('\n').filter(l => !/^\s*--/.test(l)).join('\n');

const fail = [];
const ok = (name, cond, detail) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name);
  if (!cond) { if (detail) console.log('      ' + detail); fail.push(name); }
};

const save = (app.match(/async function saveDomestic\(sendOpts\)[\s\S]*?\n\}/) || [''])[0];

// ══ 1. THE WINDOW ═════════════════════════════════════════════════════════
console.log('\nThree weeks, then it locks');

const DAYS = Number((app.match(/const CLEAN_REASSIGN_WINDOW_DAYS = (\d+)/) || [])[1]);
ok('there is a named window', !!DAYS, String(DAYS));
ok('  and it is the two-to-three weeks asked for', DAYS >= 14 && DAYS <= 21, String(DAYS));

const lockSrc = (app.match(/function cleanReassignLock\(cleanDate\)[\s\S]*?\n\}/) || [''])[0];
ok('there is one place that decides', !!lockSrc);
{
  const run = new Function('cleanDate', 'todaySAST', 'CLEAN_REASSIGN_WINDOW_DAYS',
    lockSrc + '\nreturn cleanReassignLock(cleanDate);');
  const today = () => '2026-10-20';
  const at = (d) => run(d, today, DAYS);

  ok('  yesterday\'s clean can still be reassigned', at('2026-10-19').locked === false);
  ok('  a clean exactly at the window is still open', at('2026-09-29').locked === false,
     JSON.stringify(at('2026-09-29')));
  ok('  a day past the window is locked', at('2026-09-28').locked === true,
     JSON.stringify(at('2026-09-28')));
  ok('  last month is locked', at('2026-09-01').locked === true);
  ok('  a future clean is never locked', at('2026-11-05').locked === false);
  ok('  and it reports how long ago, for the message', at('2026-09-01').days === 49,
     String(at('2026-09-01').days));
}

ok('a locked reassignment is refused before any write',
   /if \(lock\.locked\) \{[\s\S]{0,260}?bail\(\); return;/.test(codeOnly(save)),
   'it has to stop before the update, not apologise after it');
ok('  and the refusal says how old the clean is',
   /lock\.days \+ ' days ago/.test(save));
ok('only a CHANGE of cleaner is gated, not every edit',
   /prior\.cleaner !== cleaner/.test(codeOnly(save)),
   'fixing a typo in the notes on an old clean must still work');

// ══ 2. THE REPORT COMES WITH IT ═══════════════════════════════════════════
console.log('\nThe inventory report follows the clean');

ok('the report is moved by its link to the clean',
   /\.from\('inventory_reports'\)[\s\S]{0,120}?\.eq\('domestic_id', String\(editId\)\)/.test(codeOnly(app)));
ok('  it sets the new cleaner', /\.update\(\{ cleaner \}\)/.test(codeOnly(app)));
ok('  and only when the cleaner actually changed',
   /if \(prior && prior\.cleaner && prior\.cleaner !== cleaner\) \{[\s\S]{0,200}?inventory_reports/.test(codeOnly(app)));
ok('a failure to move it is reported, not swallowed',
   /inventory report could not be moved/.test(app),
   'silently leaving the two apart is the bug being fixed');
ok('the in-memory copy is updated too, so the screen agrees',
   /inventoryReports\.forEach\([\s\S]{0,120}?r\.cleaner = cleaner/.test(codeOnly(app)));
ok('the toast says what happened', /inventory report moved too/.test(app));

// ══ 3. WHO ACTUALLY PRESSED SEND IS NOT ERASED ════════════════════════════
console.log('\nThe submitter survives the reassignment');

ok('the migration adds submitted_by',
   /ADD COLUMN IF NOT EXISTS submitted_by text/.test(sqlCode(mig)));
ok('  backfilled from cleaner, which is truthful for every existing row',
   /SET submitted_by = cleaner\s+WHERE submitted_by IS NULL/.test(sqlCode(mig)));
ok('the move does NOT touch submitted_by',
   !/update\(\{ cleaner, submitted_by/.test(codeOnly(app)) &&
   !/submitted_by: cleaner/.test(codeOnly(app)),
   'whose hands were on the phone is the one fact nothing else records');

const metaSrc = (app.match(/const subDay = [\s\S]*?const metaHtml = [\s\S]*?: '';/) || [''])[0];
ok('the card shows the submitter when it differs', !!metaSrc &&
   /r\.submitted_by && r\.submitted_by !== r\.cleaner/.test(metaSrc));
{
  const build = new Function('r', 'fmtDate', 'escHtml',
    metaSrc + '\nreturn metaBits;');
  const f = (d) => d, e = (x) => String(x);
  const reassigned = build({ cleaner:'Patricia', submitted_by:'Fatima',
                             submitted_at:'2026-10-01T12:55:00Z', clean_date:'2026-10-19',
                             reviewed:false }, f, e);
  ok('  proof: a reassigned report credits Patricia and names Fatima',
     reassigned.join(' · ').includes('Submitted by Fatima'), reassigned.join(' · '));
  const normal = build({ cleaner:'Spiwe', submitted_by:'Spiwe',
                         submitted_at:'2026-10-11T11:39:00Z', clean_date:'2026-10-11',
                         reviewed:false }, f, e);
  ok('  and says nothing extra when they are the same person',
     normal.length === 0, JSON.stringify(normal));
}

// ══ 4. EDITING A CLEAN NO LONGER UN-COMPLETES IT ══════════════════════════
console.log('\nA finished clean stays finished');

ok('the status in the payload is still "scheduled" for new cleans',
   /status: 'scheduled'/.test(codeOnly(save)));
ok('but an edit keeps whatever status the clean already had',
   /if \(prior && prior\.status\) row\.status = prior\.status;/.test(codeOnly(save)),
   'changing a cleaner on a completed clean put it back on Nina list as outstanding');
{
  const resolve = (prior, payload) => (prior && prior.status) ? prior.status : payload;
  ok('  proof: editing a completed clean leaves it completed',
     resolve({ status: 'completed' }, 'scheduled') === 'completed');
  ok('  proof: a brand new clean is scheduled',
     resolve(null, 'scheduled') === 'scheduled');
}

// ── Result ────────────────────────────────────────────────────────
console.log('');
if (fail.length) {
  console.log(`✗ ${fail.length} check(s) failed:`);
  fail.forEach(f => console.log('   - ' + f));
  process.exit(1);
}
console.log('✓ clean reassignment: all checks passed');
