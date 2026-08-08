#!/usr/bin/env node
/**
 * Weekend pricing, and what happens when a weekend is also a holiday.
 *
 * Owner: "Weekend pricing - yes." And on the collision: "yes the higher of
 * the two" — 30% + 20% compounding to 56% is too much for one night.
 *
 * WHY IT IS WORTH MORE THAN THE HOLIDAY PREMIUM. Roughly 104 Friday and
 * Saturday nights a year against 12 public holidays. At the same
 * percentage the weekend is about nine times the money. The holiday
 * premium only shipped first because that was the question being asked.
 *
 * ══ THIS TEST READS THE NEWEST DEFINITION, NOT A FIXED FILE ══════
 *
 * test_rates_holidays.js reads 915 by name, and 917 and 924 have since
 * replaced two of the things it checks. It still passes — it is asserting
 * against a file, and files do not change. One of its green ticks says
 * "rate_seasons is row-level secured to the owning agency" and describes a
 * policy that was FOUND TO BE A HOLE and dropped, because a host could
 * rewrite every price through it.
 *
 * A test that cannot fail is worse than no test: it is a claim nobody
 * rechecks. So this one searches every migration for the last one that
 * defines each function and reads that. Supersede nightly_rate in 950 and
 * these checks follow it there.
 *
 * Verified against staging before shipping, with Christmas Day 2026 —
 * which falls on a Friday, so it is both at once:
 *
 *   holiday 30 / weekend 20   Fri 25 Dec  R1500 → R1950  +30% holiday
 *   holiday 10 / weekend 25   Fri 25 Dec  R1500 → R1875  +25% weekend
 *   holiday 30 / weekend  0   Fri 25 Dec  R1500 → R1950  +30% holiday
 *   holiday 30 / weekend 20   Fri 18 Dec  R1500 → R1800  +20% weekend
 *   holiday 30 / weekend 20   Sun 20 Dec  R1500 → R1500  no premium
 *
 * Note the second line: the weekend can win. And the third: with the
 * weekend premium at 0 the answer is identical to before this existed.
 *
 * Run: node scripts/tests/test_weekend_rates.js
 */
const fs = require('fs');
const path = require('path');

const ROOT    = path.join(__dirname, '..', '..');
const MIG_DIR = path.join(ROOT, 'supabase', 'migrations');
const read    = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const fail = [];
const ok = (name, cond, detail) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name);
  if (!cond) { if (detail) console.log('      ' + detail); fail.push(name); }
};

// ── Find the migration that has the last word on a function ───────
const migrations = fs.readdirSync(MIG_DIR).filter(f => f.endsWith('.sql')).sort();
function latestDefining(fnName) {
  const re = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.${fnName}\\s*\\(`, 'i');
  for (let i = migrations.length - 1; i >= 0; i--) {
    const sql = fs.readFileSync(path.join(MIG_DIR, migrations[i]), 'utf8');
    if (re.test(sql)) return { file: migrations[i], sql };
  }
  return null;
}

const nr = latestDefining('nightly_rate');
const sq = latestDefining('stay_quote');
const ps = latestDefining('public_stay_quote');

console.log('\n── Which migration currently defines each function ──');
ok('nightly_rate is defined somewhere',      !!nr, 'no migration defines it');
ok('stay_quote is defined somewhere',        !!sq);
ok('public_stay_quote is defined somewhere', !!ps);
if (!nr || !sq || !ps) { console.log('\n✗ cannot continue'); process.exit(1); }
console.log(`      nightly_rate → ${nr.file}`);
console.log(`      stay_quote → ${sq.file}`);
console.log(`      public_stay_quote → ${ps.file}`);

// Body only, so the surrounding commentary cannot satisfy a check. This
// has caught me four times in this codebase.
const body = (src, fn) => {
  const start = src.search(new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.${fn}\\s*\\(`, 'i'));
  return src.slice(start).replace(/--[^\n]*/g, ' ');
};
const nightly = body(nr.sql, 'nightly_rate');
const quote   = body(sq.sql, 'stay_quote');
const pquote  = body(ps.sql, 'public_stay_quote');

// ══ 1. THE HIGHER OF THE TWO, NOT BOTH ════════════════════════════
console.log('\n── The rule she chose ──');
ok('the two premiums are compared, not multiplied',
   /GREATEST\(hol_pct, wk_pct\)/.test(nightly),
   'a night that is both a weekend and a holiday must take the larger premium once');
// 1.30 × 1.20 = 1.56. The shape that would produce it.
ok('nothing compounds them',
   !/\(1 \+ [^)]*hol[^)]*\)\s*\*\s*\(1 \+/.test(nightly) &&
   !/hol_pct\s*\+\s*wk_pct/.test(nightly),
   'found an expression that would add or compound the two');
ok('the rate applies that single premium to the base',
   /round\(base_rate \* \(1 \+ GREATEST\(hol_pct, wk_pct\) \/ 100\.0\), 2\)/.test(nightly));
// Ties go to the holiday: "Good Friday" explains a price to a guest;
// "Weekend" does not.
ok('a tie is reported as the holiday',
   /WHEN hol_pct >= wk_pct\s*THEN 'holiday'/.test(nightly));
ok('and the caller is told which one applied',
   /premium_kind text/.test(nightly) && /ELSE\s*'weekend' END/.test(nightly));
ok('no premium means no premium_kind, rather than a misleading label',
   /WHEN GREATEST\(hol_pct, wk_pct\) = 0 THEN NULL/.test(nightly));

// ══ 2. WHICH NIGHTS ARE THE WEEKEND ═══════════════════════════════
console.log('\n── Friday and Saturday, and where that is written down ──');
ok('weekend days come from org_settings, not from the function',
   /COALESCE\(s\.weekend_days, '\{5,6\}'::smallint\[\]\)/.test(nightly),
   'hardcoding Fri/Sat would be wrong for an agency outside South Africa');
ok('the night is matched on ISO day-of-week',
   /EXTRACT\(ISODOW FROM p_date\)::smallint = ANY \(p\.wdays\)/.test(nightly));

// THE CHECK THAT ISO 5 AND 6 REALLY ARE FRIDAY AND SATURDAY.
//
// The form tells her "Friday and Saturday nights" and the default says
// {5,6}. If those disagree — if somebody read ISO as Sunday-first and
// wrote {6,7} — every weekend price would land a day late and nothing
// would report an error. Computed here rather than trusted.
const isoDow = (y, m, d) => (((new Date(Date.UTC(y, m - 1, d)).getUTCDay()) + 6) % 7) + 1;
const namedDays = [
  [2026, 12, 18, 5, 'Friday'], [2026, 12, 19, 6, 'Saturday'],
  [2026, 12, 20, 7, 'Sunday'], [2026, 12, 21, 1, 'Monday'],
  [2027,  1,  1, 5, 'Friday'], [2026,  3, 21, 6, 'Saturday'],
];
const dowWrong = namedDays.filter(([y, m, d, want]) => isoDow(y, m, d) !== want);
ok('ISO 5 and 6 are in fact Friday and Saturday',
   dowWrong.length === 0,
   dowWrong.map(([y,m,d,want,name]) => `${y}-${m}-${d} is ${name}, ISO should be ${want}, got ${isoDow(y,m,d)}`).join('; '));
ok('and the form says the same thing to her',
   /Friday and Saturday nights/.test(read('demo', 'index_fixed.html')));

// A weekend_days of {} would mean "no night is a weekend", which is what a
// premium of 0 already says, and reads as a mistake. array_length on an
// empty array returns NULL and a CHECK PASSES on NULL — the same hole that
// let an empty months array through in 916, found by testing the
// constraint rather than reading it.
const mig924 = read('supabase', 'migrations', '924_weekend_rates.sql');
console.log('\n── The setting cannot be set to nonsense ──');
ok('an empty weekend_days is refused',
   /COALESCE\(array_length\(weekend_days, 1\), 0\) BETWEEN 1 AND 7/.test(mig924));
ok('and so is a day number that is not a day',
   /weekend_days <@ ARRAY\[1,2,3,4,5,6,7\]::smallint\[\]/.test(mig924));

// ══ 3. NOTHING CHANGES PRICE ON ITS OWN ═══════════════════════════
console.log('\n── Existing properties ──');
ok('the weekend premium starts at 0',
   /weekend_premium_pct numeric NOT NULL DEFAULT 0/.test(mig924));
ok('nothing backfills a weekend premium onto anybody',
   !/UPDATE public\.properties[\s\S]{0,160}weekend_premium_pct\s*=\s*[1-9]/.test(mig924));

// ══ 4. THE GRANTS THE DROP TOOK AWAY ══════════════════════════════
//
// Changing a return type needs DROP and CREATE, and DROP FUNCTION
// discards every privilege on it. Miss the re-GRANT and the booking site's
// quote route answers 503 for every guest and falls back to its own
// hardcoded table — silently, which is the precise failure 921 was written
// to prevent, arriving through a different door.
console.log('\n── Grants survive the drop ──');
['nightly_rate\\(uuid, date\\)',
 'stay_quote\\(uuid, date, date\\)',
 'public_stay_quote\\(text, text, date, date\\)'].forEach(sig => {
  const name = sig.split('\\(')[0];
  ok(`${name} is still callable by a signed-out visitor`,
     new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${sig} TO anon, authenticated`).test(mig924));
  ok(`${name} revokes PUBLIC first`,
     new RegExp(`REVOKE ALL ON FUNCTION public\\.${sig} FROM PUBLIC`).test(mig924));
});

// ══ 5. THE STAY, AND WHAT IT REPORTS ══════════════════════════════
console.log('\n── stay_quote ──');
ok('weekend nights are counted alongside holiday nights',
   /count\(\*\) FILTER \(WHERE weekend\)::int/.test(quote) && /weekend_nights integer/.test(quote));
ok('a Saturday that lost to a holiday still counts as a weekend night',
   /'weekend', weekend/.test(quote),
   'weekend is the plain fact; premium_kind is which rule won — they are separate');
ok('the per-night breakdown carries the reason',
   /'premium_kind', premium_kind/.test(quote));
ok('check-out day is still not charged',
   /generate_series\(p_check_in, p_check_out - 1, interval '1 day'\)/.test(quote));
ok('unpriced nights are still counted rather than treated as free',
   /count\(\*\) FILTER \(WHERE rate IS NULL\)::int/.test(quote));

console.log('\n── public_stay_quote ──');
ok('it still resolves the property inside the database',
   /o\.portal_key = p_portal_key/.test(pquote) && /p\.short_key = p_property_key/.test(pquote),
   'anon cannot read public.properties; a lookup in the route would 404 every request');
ok('it passes the weekend count through to the booking site',
   /q\.weekend_nights/.test(pquote));
ok('an unknown property returns nothing rather than raising',
   /IF v_prop IS NULL THEN RETURN; END IF;/.test(pquote));

// ══ 6. THE SCREEN SHE TYPES IT INTO ═══════════════════════════════
console.log('\n── demo/index_fixed.html ──');
const app = read('demo', 'index_fixed.html');
ok('there is a weekend premium field', /id="pr-wkndpct"/.test(app));
ok('it is saved', /weekend_premium_pct: parseFloat\(document\.getElementById\('pr-wkndpct'\)\.value\) \|\| 0/.test(app));
ok('the form explains the collision rule',
   /the higher of the two applies[\s\S]{0,40}never both/i.test(app));

// The old preview line assumed a night carrying a holiday name was priced
// BY the holiday. Once a weekend premium can beat it, a Christmas Day that
// is also a Friday would have read "Christmas Day +25%" and blamed the
// wrong rule.
ok('the preview names the rule that actually applied',
   /function premiumLabel\(n\)/.test(app) &&
   /n\.premium_kind === 'weekend'/.test(app));
ok('a holiday that lost is still named, without a percentage',
   /if \(!pct\) \{[\s\S]{0,120}hol \? `<span style="color:var\(--muted\)"> · \$\{hol\}<\/span>`/.test(app));
ok('the total line counts weekend nights',
   /q\.weekend_nights \? ` · \$\{q\.weekend_nights\} weekend`/.test(app));

console.log('');
if (fail.length) {
  console.log(`✗ ${fail.length} check(s) failed:`);
  fail.forEach(f => console.log('   - ' + f));
  process.exit(1);
}
console.log('✓ weekend rates: all checks passed');
