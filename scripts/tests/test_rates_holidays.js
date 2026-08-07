#!/usr/bin/env node
/**
 * Public holiday rates: what a night costs, and why.
 *
 * WHY THIS EXISTS. The owner: "Considering public holiday rates, based on
 * the country the property is in. These should be higher rate nights."
 * Straightforward to ask for, and it turned out HEP had no concept of a
 * price at all — the only nightly rate in the whole system was hardcoded in
 * the booking site's data/listings.ts. So migration 915 is not really a
 * holiday feature; it is the pricing floor a holiday feature stands on.
 *
 * WHAT THIS GUARDS. Four things that are each wrong in a quiet way:
 *
 *   1. EASTER. Good Friday and Family Day move with the moon, so they are
 *      computed rather than typed. A computed date is only as good as its
 *      constants, and a single wrong one gives plausible answers that are a
 *      week out — the sort of bug you find in April. This test does not
 *      read the algorithm, it EXECUTES it: the SQL arithmetic is
 *      transliterated to JS and run against six known Easter Sundays.
 *
 *   2. THE SUNDAY RULE. Under the South African Public Holidays Act a
 *      holiday falling on a Sunday is observed on the Monday. Most calendar
 *      libraries skip it. Miss it and the busiest long weekends of the year
 *      are priced as ordinary Mondays.
 *
 *   3. UNPRICED IS NOT FREE. A property with no rate set must quote NULL,
 *      never 0. A quote missing three nights' price is a broken quote, not
 *      a cheap one, and only one of those should ever reach a guest.
 *
 *   4. THE CHECK-OUT NIGHT. Charging it is the classic off-by-one in every
 *      booking system, and it overcharges — which is the direction nobody
 *      reports and everybody remembers.
 *
 * The numbers were also checked against the live staging database when 915
 * was written: Easter 2027 as a five-night stay came to R6,960 (three
 * nights at R1,200, Good Friday and Family Day at R1,680), and Christmas
 * inside the Peak Summer season came to R2,520 (R1,800 + 40%).
 *
 * Run: node scripts/tests/test_rates_holidays.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const mig = read('supabase', 'migrations', '915_rates_and_holidays.sql');

const fail = [];
const ok = (name, cond, detail) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name);
  if (!cond) { if (detail) console.log('      ' + detail); fail.push(name); }
};

// ══ 1. EASTER, ACTUALLY RUN ═══════════════════════════════════════
//
// Lifting the arithmetic out of the migration and running it beats matching
// it with a regex: a regex tells you the text has not changed, which is not
// the question. The question is whether it gives the right date.
//
// Postgres integer division truncates and JS division does not, so every
// "<term> / <number>" has to be wrapped. Each division in the algorithm has
// a left side that is either an identifier or a parenthesised group sitting
// immediately before the slash, so walking backwards from the slash finds
// it without needing to parse anything.
function toIntegerDivision(expr) {
  let out = expr;
  let i;
  while ((i = out.indexOf('/')) !== -1) {
    const rhs = /^\s*(\d+)/.exec(out.slice(i + 1));
    if (!rhs) throw new Error('division by something that is not a literal: ' + out);
    const end = i + 1 + rhs[0].length;

    let j = i - 1;
    while (j >= 0 && /\s/.test(out[j])) j--;
    let start;
    if (out[j] === ')') {
      let depth = 0;
      for (; j >= 0; j--) {
        if (out[j] === ')') depth++;
        else if (out[j] === '(') { depth--; if (depth === 0) break; }
      }
      start = j;
    } else {
      while (j >= 0 && /[A-Za-z0-9_]/.test(out[j])) j--;
      start = j + 1;
    }
    out = out.slice(0, start) + 'idiv(' + out.slice(start, i) + ',' + rhs[1] + ')' + out.slice(end);
  }
  return out;
}

function easterFromMigration() {
  const body = mig.slice(mig.indexOf('a := p_year % 19'), mig.indexOf('RETURN make_date(p_year, mo, da)'));
  const steps = body.split('\n').map(l => l.trim())
    .filter(l => /^[a-z]{1,2} :=/.test(l))
    .map(l => {
      const m = /^([a-z]{1,2}) := (.+);$/.exec(l);
      if (!m) throw new Error('unreadable step: ' + l);
      return `const ${m[1]} = ${toIntegerDivision(m[2])};`;
    });
  // 14 assignments in the anonymous Gregorian algorithm. If the extraction
  // silently matched fewer, every date below would still "pass" against a
  // half-run algorithm, so the count is checked rather than assumed.
  if (steps.length !== 14) throw new Error(`expected 14 steps, extracted ${steps.length}`);
  const idiv = (a, b) => Math.trunc(a / b);
  const fn = new Function('p_year', 'idiv', steps.join('\n') + '\nreturn [mo, da];');
  return (year) => {
    const [m, d] = fn(year, idiv);
    return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  };
}

console.log('\n── Easter, computed rather than typed ──');
let easter;
try { easter = easterFromMigration(); }
catch (e) { ok('the algorithm can be lifted out of the migration and run', false, e.message); }

if (easter) {
  ok('the algorithm can be lifted out of the migration and run', true);
  // Western (Gregorian) Easter Sunday. 2038 is in here because it is past
  // the 32-bit date wall that breaks naive implementations.
  const KNOWN = {
    2024: '2024-03-31', 2025: '2025-04-20', 2026: '2026-04-05',
    2027: '2027-03-28', 2030: '2030-04-21', 2038: '2038-04-25',
  };
  Object.entries(KNOWN).forEach(([y, d]) => {
    let got;
    try { got = easter(Number(y)); } catch (e) { got = 'threw: ' + e.message; }
    ok(`Easter ${y} is ${d}`, got === d, `got ${got}`);
  });
  // Easter is a Sunday, always, by construction. Cheap to assert and it
  // catches a whole class of off-by-one that the six dates above might miss.
  const everySunday = [];
  for (let y = 2020; y <= 2060; y++) {
    const d = new Date(easter(y) + 'T00:00:00Z');
    if (d.getUTCDay() !== 0) everySunday.push(y);
  }
  ok('every Easter from 2020 to 2060 lands on a Sunday',
     everySunday.length === 0, 'not a Sunday in: ' + everySunday.join(', '));

  // Six anchor dates plus a Sunday check is thinner than it looks: several
  // of the constants only change the answer in rare years, so a typo can sit
  // between the anchors untouched. (Checked: swapping 451 for 452 alters
  // nothing between 1583 and 2500 — a mutation the anchors could never have
  // caught, and would not have needed to.) A second, independent copy of the
  // algorithm settles it. The copy is anchored by the same six known dates,
  // so it cannot drift into agreeing with a broken original.
  const reference = (y) => {
    const q = (a, b) => Math.floor(a / b);
    const a = y % 19, b = q(y, 100), c = y % 100;
    const d = q(b, 4), e = b % 4, f = q(b + 8, 25), g = q(b - f + 1, 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = q(c, 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = q(a + 11 * h + 22 * l, 451);
    const mo = q(h + l - 7 * m + 114, 31);
    const da = ((h + l - 7 * m + 114) % 31) + 1;
    return `${y}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`;
  };
  ok('the reference implementation agrees with the six known dates',
     Object.entries(KNOWN).every(([y, d]) => reference(Number(y)) === d));

  const drift = [];
  for (let y = 1900; y <= 2200; y++) if (easter(y) !== reference(y)) drift.push(y);
  ok('the migration matches it for every year from 1900 to 2200',
     drift.length === 0,
     drift.length ? `${drift.length} year(s) differ, first: ${drift[0]} → migration ${easter(drift[0])}, expected ${reference(drift[0])}` : '');
}

// ══ 2. THE SOUTH AFRICAN CALENDAR ═════════════════════════════════
console.log('\n── The holidays themselves ──');
const seed = mig.slice(mig.indexOf('FUNCTION public.seed_sa_holidays'), mig.indexOf('-- This year and the next three'));
const SA_FIXED = [
  ["1',  1", "New Year"], ["3, 21", 'Human Rights Day'], ["4, 27", 'Freedom Day'],
  ["5,  1", "Workers"], ["6, 16", 'Youth Day'], ["8,  9", "Women"],
  ["9, 24", 'Heritage Day'], ["12, 16", 'Day of Reconciliation'],
  ["12, 25", 'Christmas Day'], ["12, 26", 'Day of Goodwill'],
];
ok('all ten fixed South African public holidays are seeded',
   SA_FIXED.every(([, name]) => seed.includes(name)),
   'missing: ' + SA_FIXED.filter(([, n]) => !seed.includes(n)).map(([, n]) => n).join(', '));
ok('Good Friday is two days before Easter', /easter - 2, 'Good Friday'/.test(seed));
ok('Family Day is the day after Easter', /easter \+ 1, 'Family Day'/.test(seed));

// The rule most calendars get wrong.
ok('a holiday on a Sunday moves to the Monday',
   /EXTRACT\(DOW FROM d\) = 0 THEN d \+ 1/.test(seed));
ok('the moved one is labelled so nobody thinks the date is a typo',
   /\|\| ' \(observed\)'/.test(seed));
// Re-running a seed must not throw or duplicate — the holidays cron will
// call it over the same years repeatedly.
ok('re-seeding the same year is harmless',
   /ON CONFLICT \(country_code, holiday_date\) DO NOTHING/.test(seed));
ok('holidays are seeded for this year and the next three',
   /generate_series\(EXTRACT\(YEAR FROM CURRENT_DATE\)::int,[\s\S]{0,80}\+ 3\)/.test(mig));

// A holiday is a fact about a country, not about an agency — one shared
// row, or every agency in Cape Town keeps its own copy of Freedom Day.
console.log('\n── Holidays belong to a country, not to an agency ──');
const holTable = mig.slice(mig.indexOf('CREATE TABLE IF NOT EXISTS public.public_holidays'), mig.indexOf('COMMENT ON TABLE public.public_holidays'));
ok('public_holidays has no org_id', !/org_id/.test(holTable));
ok('it is keyed by country and date', /PRIMARY KEY \(country_code, holiday_date\)/.test(holTable));
ok('anyone may read it', /public_holidays_readable ON public\.public_holidays FOR SELECT USING \(true\)/.test(mig));
// The read policy is deliberately wide open, so the write side has to be
// shut by grant as well as by policy. Supabase hands anon ALL on every new
// public-schema table by default; a table nobody should write from a
// browser should not quietly arrive writable.
ok('nobody writes it from a browser',
   /REVOKE ALL ON public\.public_holidays FROM anon, authenticated;[\s\S]{0,120}GRANT SELECT ON public\.public_holidays TO anon, authenticated;/.test(mig));

// ══ 3. WHERE A PROPERTY IS ════════════════════════════════════════
console.log('\n── Which calendar applies ──');
ok('the agency sets a country once', /org_settings[\s\S]{0,120}country_code text NOT NULL DEFAULT 'ZA'/.test(mig));
ok('a property only overrides it when it sits somewhere else',
   /properties[\s\S]{0,80}ADD COLUMN IF NOT EXISTS country_code text;/.test(mig));
// The pre-existing properties.country is free text and empty on every row.
// Reusing it would mean guessing whether "RSA" and "South Africa" are the
// same country, which is not a migration's job.
ok('the property falls back to the agency, then to ZA',
   /COALESCE\(p\.country_code, s\.country_code, 'ZA'\)/.test(mig));

// ══ 4. WHAT A NIGHT COSTS ═════════════════════════════════════════
console.log('\n── nightly_rate ──');
const nightly = mig.slice(mig.indexOf('FUNCTION public.nightly_rate'), mig.indexOf('COMMENT ON FUNCTION public.nightly_rate'));
ok('a season beats the base rate', /COALESCE\(s\.rate, p\.base_rate\)/.test(nightly));
ok('the premium is a percentage on top, not a replacement rate',
   /\* \(1 \+ CASE WHEN hol\.name IS NOT NULL/.test(nightly) &&
   /holiday_premium_pct, 0\) \/ 100\.0/.test(nightly));
// The owner chose a percentage over a fixed amount precisely so it
// compounds with the season: a holiday in peak summer is worth more than
// one in winter, and nobody has to remember to set two numbers.
ok('season and holiday stack rather than one overriding the other',
   /COALESCE\(s\.rate, p\.base_rate\)\s*\n?\s*\* \(1 \+/.test(nightly));
ok('no premium on an ordinary night', /ELSE 0 END\), 2\)/.test(nightly));

// THE ONE THAT MATTERS. Unpriced must be NULL, and it must be NULL before
// the multiply — otherwise NULL * 1.4 is still NULL by luck rather than by
// decision, and the day somebody adds a COALESCE for tidiness it silently
// becomes R0.
ok('an unpriced property quotes NULL, never 0',
   /CASE WHEN COALESCE\(s\.rate, p\.base_rate\) IS NULL THEN NULL/.test(nightly));
ok('the reason is returned alongside the number',
   /RETURNS TABLE \(rate numeric, base numeric, season text, holiday text, premium_pct numeric\)/.test(nightly));

// The booking site quotes before anyone signs in, so the function reaches
// past RLS on purpose — which is only safe with search_path pinned.
ok('it is callable by a signed-out visitor', /GRANT EXECUTE ON FUNCTION public\.nightly_rate\(uuid, date\) TO anon, authenticated/.test(mig));
ok('SECURITY DEFINER comes with a pinned search_path',
   /nightly_rate[\s\S]{0,200}SECURITY DEFINER SET search_path = public, pg_temp/.test(mig));
ok('and PUBLIC is revoked first', /REVOKE ALL ON FUNCTION public\.nightly_rate\(uuid, date\) FROM PUBLIC/.test(mig));

// ══ 5. WHAT THE STAY COSTS ════════════════════════════════════════
console.log('\n── stay_quote ──');
const quote = mig.slice(mig.indexOf('FUNCTION public.stay_quote'), mig.indexOf('COMMENT ON FUNCTION public.stay_quote'));
// nights × rate is the wrong shape for this feature. An Easter weekend is
// not four identical nights, and a total that pretends otherwise is wrong
// in the guest's favour or yours, never neither.
ok('the stay is priced night by night, not nights × rate',
   /CROSS JOIN LATERAL public\.nightly_rate\(p_property, d\.night\)/.test(quote));
ok('check-out day is not charged', /generate_series\(p_check_in, p_check_out - 1, interval '1 day'\)/.test(quote));
ok('missing prices are counted and surfaced, not treated as zero',
   /count\(\*\) FILTER \(WHERE rate IS NULL\)::int/.test(quote) && /unpriced_nights int/.test(quote));
ok('holiday nights are counted so the total can be explained',
   /count\(\*\) FILTER \(WHERE holiday IS NOT NULL\)::int/.test(quote));
ok('a per-night breakdown comes back with the total',
   /jsonb_agg\(jsonb_build_object\(/.test(quote) && /ORDER BY night/.test(quote));
ok('it is callable by a signed-out visitor too',
   /GRANT EXECUTE ON FUNCTION public\.stay_quote\(uuid, date, date\) TO anon, authenticated/.test(mig));

// ══ 6. RATES ARE ONE AGENCY'S BUSINESS ════════════════════════════
console.log('\n── Tenant isolation on rates ──');
ok('rate_seasons is row-level secured to the owning agency',
   /rate_seasons_own_org ON public\.rate_seasons FOR ALL[\s\S]{0,140}USING \(org_id = public\.current_org_id\(\)\)/.test(mig));
ok('inserts are checked too, not just reads',
   /WITH CHECK \(org_id = public\.current_org_id\(\)\)/.test(mig.slice(mig.indexOf('rate_seasons_own_org'))));
// current_org_id() is NULL for a signed-out visitor, so a table grant to
// anon would return nothing while reading like a decision — and become a
// real hole the first time the policy was loosened.
ok('anon has no grant on rate_seasons at all',
   /REVOKE ALL ON public\.rate_seasons FROM anon;/.test(mig) &&
   !/GRANT[^\n]*ON public\.rate_seasons TO[^\n]*anon/.test(mig));
ok('deleting a property takes its seasons with it',
   /property_id uuid NOT NULL REFERENCES public\.properties\(id\) ON DELETE CASCADE/.test(mig));

// ══ 7. THE LIMIT, SAID OUT LOUD ═══════════════════════════════════
console.log('\n── What this cannot do ──');
// iCal is a one-way calendar feed. Setting a price on Airbnb, Booking.com
// or LekkeSlaap needs each platform's own API, and those are partner-gated.
// Holiday rates therefore govern direct bookings, and everywhere else they
// are a prompt to go and change it yourself. Worth building, not the whole
// win — and that difference should be obvious from the file rather than
// discovered by someone wondering why Airbnb still shows the old price.
ok('the migration says it cannot push rates to the platforms',
   /cannot change a price on Airbnb, Booking\.com or LekkeSlaap/.test(mig));
ok('and says which bookings it does govern',
   /govern[\s\S]{0,40}DIRECT bookings/.test(mig));

// ══ 8. NOTHING IS BACKFILLED ══════════════════════════════════════
console.log('\n── Existing properties ──');
// A default that invents a price for somebody's flat is worse than no
// price: it is a number they never chose, quoted to a guest.
ok('base_rate starts NULL rather than at some invented number',
   /ADD COLUMN IF NOT EXISTS base_rate numeric,/.test(mig) &&
   !/base_rate numeric NOT NULL DEFAULT/.test(mig));
ok('the premium starts at 0%, so nothing changes price on its own',
   /holiday_premium_pct numeric NOT NULL DEFAULT 0/.test(mig));
ok('there is no UPDATE backfilling rates onto existing rows',
   !/UPDATE public\.properties[\s\S]{0,120}SET[\s\S]{0,60}base_rate/.test(mig));

// ══ 9. THE SCREEN SOMEBODY TYPES A RATE INTO ══════════════════════
//
// The engine above shipped a day before this did, during which every
// property in the product read "no price set" and there was no way to
// change that. An engine with no form is a migration, not a feature.
console.log('\n── demo/index_fixed.html, entering rates ──');
const app = read('demo', 'index_fixed.html');
const mig916 = read('supabase', 'migrations', '916_set_rate_seasons.sql');

ok('a property has a nightly rate field', /id="pr-rate"/.test(app));
ok('and a public holiday premium field', /id="pr-holpct"/.test(app));
ok('and a country, for the holiday calendar', /id="pr-country"/.test(app));
ok('seasons can be added and removed', /id="pr-seasons-list"/.test(app) && /function addSeasonRow\(\)/.test(app));

// THE ONE THAT WOULD BE SILENT. JavaScript's Date.getMonth() is 0-11 and
// the booking site's hardcoded seasons are written that way; the database
// is 1-12. Mixing them shifts every season by a month, so Peak Summer
// becomes January-to-March and Christmas is priced at the shoulder rate —
// no error, no warning, just a year of slightly wrong prices.
const monthBtn = app.slice(app.indexOf('MONTH_LETTERS.map((L,i)=>'), app.indexOf('MONTH_LETTERS.map((L,i)=>') + 400);
ok('the month picker sends 1-12, not JavaScript 0-11',
   /data-m="\$\{i\+1\}"/.test(monthBtn), monthBtn.slice(0, 120));
ok('and the database refuses 0-11 if anything ever does send it',
   /months <@ ARRAY\[1,2,3,4,5,6,7,8,9,10,11,12\]/.test(mig916));
// array_length of an empty array is NULL, and a CHECK passes on NULL — so
// the obvious BETWEEN lets a season covering no months through, which
// never matches a date and looks like a season that is simply unused.
ok('a season covering no months is refused too',
   /COALESCE\(array_length\(months, 1\), 0\) BETWEEN 1 AND 12/.test(mig916));

// An empty rate box means "no price set". parseFloat('') is NaN and
// NaN || 0 is 0, so the ordinary idiom would price the property at free at
// the very last step — undoing the whole of section 4 above.
ok('a blank rate saves as NULL, not as zero',
   /base_rate: ratesFieldOrNull\('pr-rate'\)/.test(app) &&
   /function ratesFieldOrNull/.test(app) &&
   /String\(raw\)\.trim\(\) === ''\) return null/.test(app));

// Replacing the set from the browser is DELETE then INSERT, and a
// connection that drops between them leaves a property with no seasons —
// silently back on its base rate.
ok('saving seasons is one transaction, not delete-then-insert',
   /db\.rpc\('set_rate_seasons'/.test(app) &&
   !/from\('rate_seasons'\)\.delete\(\)/.test(app));
ok('the function checks the property belongs to the caller',
   /WHERE id = p_property AND org_id = v_org/.test(mig916) &&
   /RAISE EXCEPTION 'No such property'/.test(mig916));
ok('and does not reveal whether the property exists or is someone else\'s',
   /same message whether the property does not exist or/.test(mig916));

// The preview must not be a second implementation of the pricing rules —
// it would eventually disagree with the database and be confidently wrong
// about the one thing it exists to confirm.
console.log('\n── The preview ──');
ok('it prices against the real function', /db\.rpc\('stay_quote'/.test(app));
const prev = app.slice(app.indexOf('async function previewStayQuote'), app.indexOf('function fmtNightLabel'));
ok('it does not recompute the premium in JavaScript',
   !/premium_pct\s*\/\s*100/.test(prev) && !/\*\s*\(1\s*\+/.test(prev));
ok('each night shows the season and the holiday that moved it',
   /n\.season/.test(prev) && /n\.holiday/.test(prev) && /premium_pct/.test(prev));
ok('a night with no rate says so instead of showing R0',
   /n\.rate==null \? 'no rate set'/.test(prev));
ok('an incomplete total is called out, not quietly summed',
   /unpriced/.test(prev) && /this total is incomplete/.test(prev));
// The limit belongs on the screen, not only in the migration header —
// otherwise the first time somebody notices is when Airbnb still shows the
// old price over a long weekend.
ok('the preview repeats that the platforms are not updated from here',
   /Airbnb, Booking\.com and LekkeSlaap set their own prices/.test(prev));

// AND IT MUST NOT LIVE ONLY THERE. Owner: "As long as it's clear to
// everyone that it doesn't update the booking platforms, it's good with
// me." A note that only renders after somebody presses "Price it" is not
// clear to everyone — it is clear to the people who happened to press a
// button. So the same statement sits beside the rate fields themselves,
// and this checks it is outside the preview function rather than counting
// two copies of the same string in one place.
const form = app.slice(app.indexOf('function openPropertyModal'), app.indexOf('async function savePropertyRecord'));
ok('the rate form itself says so, without pressing anything',
   /These rates apply to direct bookings/.test(form) &&
   /Airbnb, Booking\.com and LekkeSlaap set their own prices/.test(form));
ok('and it sits with the rate fields, not below the fold in the preview',
   form.indexOf('These rates apply to direct bookings') < form.indexOf('id="pr-seasons-list"'));

// ══ 10. WHO CAN SEE AND CHANGE A RATE ═════════════════════════════
//
// Owner: "Also the rates are admin only viewed I hope." The screen was —
// Settings is roles:['owner','admin'] — and the database was not. 915 gave
// rate_seasons the simplest policy that works for a table everyone uses,
// org_id = current_org_id() FOR ALL, which in an org containing hosts and
// clients let a host read the entire pricing structure and rewrite it. Not
// through the interface, which never shows them the door; through the API,
// which is a fetch call away.
console.log('\n── Rates are owner and admin only ──');
const mig917 = read('supabase', 'migrations', '917_rates_admin_only.sql');

ok('the rates screen lives behind an owner/admin tab',
   /\{id:'settings',\s*label:'Settings',[^}]*roles:\['owner','admin'\]\}/.test(app));
ok('the permissive org-wide policy is gone',
   /DROP POLICY IF EXISTS rate_seasons_own_org/.test(mig917) &&
   !/CREATE POLICY rate_seasons_own_org/.test(mig917));
ok('reads and writes both require owner or admin',
   /CREATE POLICY rate_seasons_admin ON public\.rate_seasons FOR ALL[\s\S]{0,200}USING\s+\(auth\.role\(\) = 'authenticated' AND public\.is_org_admin\(org_id\)\)/.test(mig917));
ok('the WITH CHECK is there too, or a host could still insert',
   /WITH CHECK \(auth\.role\(\) = 'authenticated' AND public\.is_org_admin\(org_id\)\)/.test(mig917));

// A gate is worth nothing if the back door is a function call: the writer
// is SECURITY DEFINER, so the policy above does not apply inside it.
ok('the SECURITY DEFINER writer checks the role as well as the org',
   /IF NOT public\.is_org_admin\(v_org\) THEN[\s\S]{0,120}RAISE EXCEPTION 'Only an owner or admin can change rates'/.test(mig917));
ok('and it still checks the property belongs to them',
   /WHERE id = p_property AND org_id = v_org/.test(mig917));

// Deliberately still open, and the file has to say why — otherwise the
// next person to read it "fixes" the booking site's ability to quote.
ok('a signed-out guest can still be quoted a price',
   /GRANT EXECUTE ON FUNCTION public\.nightly_rate\(uuid, date\) TO anon, authenticated/.test(mig) &&
   /remain callable by anon, and that is not[\s\S]{0,60}an oversight/.test(mig917));
// properties.base_rate is NOT locked, because a column-level REVOKE makes
// PostgREST reject select=* for every host rather than blanking a column.
// Half-doing it silently would be worse than not doing it.
ok('the one gap left is written down rather than left looking accidental',
   /These two columns are NOT locked here/.test(mig917) &&
   /column-level REVOKE makes[\s\S]{0,80}reject `select=\*` outright/.test(mig917));

// ── Result ────────────────────────────────────────────────────────
console.log('');
if (fail.length) {
  console.log(`✗ ${fail.length} check(s) failed:`);
  fail.forEach(f => console.log('   - ' + f));
  process.exit(1);
}
console.log('✓ rates and holidays: all checks passed');
