#!/usr/bin/env node
/**
 * Two plan tracks: agencies are priced per property, guesthouses per room.
 *
 * WHY THIS EXISTS. The owner's read, having seen guesthouse support land:
 * "Maybe it's a separate billing for guesthouses as the logic differs too?
 * We can do a toggle if people are interested in guesthouses or multiple
 * properties." Right — an agency has properties scattered across a city,
 * each with its own address, owner and cleaner. A guesthouse is one
 * building with rooms in it, daily servicing and staff on site. Same
 * software, different business, so different thing counted.
 *
 * WHAT THIS GUARDS. Prices live in three places that must agree, and they
 * had ALREADY DRIFTED before this was written — api/_lib/payfast.js said
 * Growth allowed 8 properties while the pricing page advertised 10. Three
 * copies exist for good reasons (the server must decide what is charged;
 * the page must render without a round trip; the dashboard must total
 * revenue in SQL), so the answer is a test that fails when they disagree
 * rather than a fourth abstraction nobody remembers to use.
 *
 * The banding itself was checked against the live database by walking one
 * agency from 2 flats through a 4-, 9- and 17-room guesthouse and back:
 * starter → gh_small → gh_medium → gh_large → starter, with the separate
 * flats included throughout.
 *
 * Run: node scripts/tests/test_plan_tracks.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const payfast = read('api', '_lib', 'payfast.js');
const app = read('demo', 'index_fixed.html');
const welcome = read('demo', 'welcome.html');
const mig = read('supabase', 'migrations', '910_two_plan_tracks.sql');

const fail = [];
const ok = (name, cond, detail) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name);
  if (!cond) { if (detail) console.log('      ' + detail); fail.push(name); }
};

// The prices, as this test understands them. Everything below is checked
// against this one list, so a deliberate price change fails here first and
// then tells you every place that needs updating.
const EXPECTED = {
  starter:   { rand: 350, track: 'property' },
  growth:    { rand: 550, track: 'property' },
  pro:       { rand: 750, track: 'property' },
  gh_small:  { rand: 400, track: 'guesthouse' },
  gh_medium: { rand: 600, track: 'guesthouse' },
  gh_large:  { rand: 900, track: 'guesthouse' },
};

// ══ THE SERVER DECIDES WHAT IS CHARGED ════════════════════════════
console.log('\n── api/_lib/payfast.js, the authority ──');
const plansBlock = payfast.slice(payfast.indexOf('export const PLANS'), payfast.indexOf('};', payfast.indexOf('export const PLANS')));
Object.entries(EXPECTED).forEach(([k, v]) => {
  const line = plansBlock.split('\n').find(l => l.trim().startsWith(k + ':'));
  ok(`${k} is R${v.rand}`, !!line && line.includes(String(v.rand * 100)), line ? line.trim() : 'plan missing');
  ok(`${k} is on the ${v.track} track`, !!line && line.includes(`'${v.track}'`));
});

// ══ THE PAGE MUST NOT ADVERTISE A DIFFERENT PRICE ═════════════════
console.log('\n── demo/index_fixed.html, what the customer clicks ──');
const hepBlock = app.slice(app.indexOf('const HEP_PLANS = ['), app.indexOf('];', app.indexOf('const HEP_PLANS = [')));
Object.entries(EXPECTED).forEach(([k, v]) => {
  const line = hepBlock.split('\n').find(l => l.includes(`'${k}'`));
  ok(`${k} shows R${v.rand}`, !!line && new RegExp(`rand:\\s*${v.rand}\\b`).test(line), line ? line.trim() : 'plan missing');
});
// Six tiers on one screen is a worse question than "which of these two
// things are you", and the customer has already answered by adding rooms.
ok('the app shows only the track that applies to this customer',
   /function hepPlansForMe\(\)/.test(app) && /hepPlanTrack\(\)/.test(app));
ok('the track is derived from whether they have rooms, not asked',
   /hasRooms[\s\S]{0,120}parent_id/.test(app));
ok('both plan pickers use it rather than the full list',
   (app.match(/hepPlansForMe\(\)/g) || []).length >= 4);

// ══ AND THE DASHBOARD MUST NOT REPORT A DIFFERENT ONE ═════════════
console.log('\n── migration 910, what the dashboard totals ──');
Object.entries(EXPECTED).forEach(([k, v]) => {
  ok(`plan_price_rand knows ${k} = R${v.rand}`,
     new RegExp(`WHEN '${k}'\\s+THEN ${v.rand}\\b`).test(mig));
});
// Before 910 the price list was written out longhand inside
// platform_summary(), so a guesthouse customer would have counted as R0 of
// monthly revenue — silently, on the one screen whose job is to say what
// the business earns.
ok('MRR is computed from plan_price_rand, not a second copy',
   /sum\(rand\)/.test(mig) && /public\.plan_price_rand\(c\.plan\)\s+AS rand/.test(mig));
ok('no longhand price CASE left in the summary',
   !/WHEN 'starter' THEN 350[\s\S]{0,200}FROM c\)/.test(mig.slice(mig.indexOf('CREATE FUNCTION public.platform_summary'))));

// ══ THE RULE ══════════════════════════════════════════════════════
console.log('\n── Which plan does an agency need ──');
const req = mig.slice(mig.indexOf('FUNCTION public.org_required_plan'), mig.indexOf('COMMENT ON FUNCTION public.org_required_plan'));
ok('a guesthouse moves them onto the room-priced track',
   /WHEN c\.guesthouses > 0 THEN[\s\S]{0,200}gh_small/.test(req));
ok('room bands are 6 and 15', /rooms <= 6 THEN 'gh_small'/.test(req) && /rooms <= 15 THEN 'gh_medium'/.test(req));
ok('property bands are 2 and 10', /units > 10 THEN 'pro'/.test(req) && /units > 2  THEN 'growth'/.test(req));
// The owner's call: a guesthouse plan covers separate flats too. Mixed
// customers are rare enough that the generosity costs almost nothing, and
// "you will be billed twice" is a bad first invoice.
ok('separate properties ride along on a guesthouse plan, not billed twice',
   /separate propert/.test(req) && !/units[\s\S]{0,80}\+[\s\S]{0,40}rooms[\s\S]{0,40}THEN 'pro'/.test(req));

// ══ UNDERPAYING IS MEASURED IN RANDS ══════════════════════════════
console.log('\n── Who has outgrown their tier ──');
// Rank does not survive two tracks: "Guesthouse at R400" is neither above
// nor below "Growth at R550" in any ordering that means anything. Rands
// always are.
ok('the comparison is by price, not by tier rank',
   /needs_rand > rand/.test(mig) && /const PLAN_RAND/.test(app) &&
   /PLAN_RAND\[r\.needs_plan\] \|\| 0\) > \(PLAN_RAND\[r\.plan\] \|\| 0\)/.test(app));
ok('the app price map matches the server',
   Object.entries(EXPECTED).every(([k, v]) => new RegExp(`${k}:${v.rand}\\b`).test(app.replace(/\s/g, ''))));
// A comped account is a decision, not an underpayment, and a trial has not
// chosen anything yet.
ok('comped accounts are never flagged as underpaying',
   /plan <> 'founder'/.test(mig) && /r\.plan !== 'founder'/.test(app));
ok('trialling accounts are never flagged either',
   /rand > 0 AND needs_rand > rand/.test(mig) && /PLAN_RAND\[r\.plan\] \|\| 0\) > 0/.test(app));
ok('HQ shows it as advice, not a block',
   /needs \$\{escHtml\(PLAN_NAME/.test(app) && /A conversation, not a cut-off/.test(app));

// ══ THE PRICING PAGE ══════════════════════════════════════════════
console.log('\n── demo/welcome.html, the toggle ──');
ok('there are two sets of plans', /id="plans-property"/.test(welcome) && /id="plans-guesthouse"/.test(welcome));
ok('the guesthouse set is hidden until chosen', /id="plans-guesthouse" style="display:none"/.test(welcome));
ok('the toggle asks which business you run, not which tier you want',
   /I manage properties/.test(welcome) && /I run a guesthouse/.test(welcome));
Object.entries(EXPECTED).forEach(([k, v]) => {
  ok(`the page advertises R${v.rand} for ${k}`, welcome.includes(`R${v.rand}<small> /month</small>`));
});
ok('room counts are on the guesthouse cards', /Up to 6 rooms/.test(welcome) && /Up to 15 rooms/.test(welcome));
ok('property counts are on the agency cards', /Up to 2 properties/.test(welcome) && /Up to 10 properties/.test(welcome));
// This was the drift the whole test exists to prevent, in its original form.
ok('the page no longer says Growth allows 8 properties', !/Up to 8 propert/.test(welcome) && !/properties: 8/.test(payfast));
ok('mixed customers are told they are billed once',
   /guesthouse plan covers your separate properties/.test(welcome));
ok('the choice survives leaving the page and coming back',
   /localStorage\.setItem\('hep_plan_track'/.test(welcome));
ok('a link can open straight onto the guesthouse prices',
   /plans=\(property\|guesthouse\)/.test(welcome));

// ── Result ────────────────────────────────────────────────────────
console.log('');
if (fail.length) {
  console.log(`✗ ${fail.length} check(s) failed:`);
  fail.forEach(f => console.log('   - ' + f));
  process.exit(1);
}
console.log('✓ plan tracks: all checks passed');
