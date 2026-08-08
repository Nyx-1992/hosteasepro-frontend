#!/usr/bin/env node
/**
 * The next unprotected table, caught before it ships.
 *
 * WHY THIS EXISTS. The security sweep found seven real holes on a database
 * where all 49 tables already had RLS switched on. RLS being on was never
 * the problem. The problem was:
 *
 *   - policies named "org members can view inspections" that contained no
 *     membership test at all, only a hardcoded org id — so the answer for
 *     every authenticated user of every agency was yes;
 *   - a guard reading `IF auth.uid() IS NOT NULL AND ...` which, for a
 *     signed-out caller, evaluated to false and checked nothing;
 *   - a view without security_invoker, quietly ignoring the RLS beneath it;
 *   - SECURITY DEFINER functions whose search_path left pg_temp implicitly
 *     first, including current_org_id and is_org_admin.
 *
 * None of those look wrong when you read them. That is the point — every
 * one was written by somebody who believed they had secured the table. So
 * this test does not ask "is RLS on". It asks whether the specific shapes
 * that fooled us last time have appeared again.
 *
 * SCOPE. It reads migrations numbered 922 and up — the sweep and
 * everything after it. Earlier migrations contain the very patterns it
 * bans, which is why the sweep existed; rewriting history to please a
 * linter would change nothing about the database. What matters is that new
 * work cannot reintroduce them.
 *
 * WHAT IT CANNOT DO. A file cannot tell you what the database will
 * actually answer. Every finding in the sweep was confirmed by connecting
 * as the anon role and as a signed-in stranger and trying it, and that
 * remains the only way to know. The method, for the next sweep:
 *
 *     BEGIN;
 *     SET LOCAL ROLE anon;                        -- or authenticated
 *     SET LOCAL request.jwt.claims TO '{"role":"anon"}';
 *     SELECT count(*) FROM public.<table>;        -- 0 or 42501 is the pass
 *     ROLLBACK;
 *
 * Use a `sub` that belongs to no profile row to play a stranger; that is
 * what proved the inspections hole.
 *
 * Run: node scripts/tests/test_rls_guards.js
 */
const fs = require('fs');
const path = require('path');

const MIG_DIR = path.join(__dirname, '..', '..', 'supabase', 'migrations');
const FROM    = 922;

// ── Comments must go before anything is matched ───────────────────
//
// 922's own commentary quotes every anti-pattern below verbatim, because
// explaining a bug means writing it down. Scanning raw text would make
// this test fail on the migration that fixed the problem — and that exact
// mistake (a check matching the prose that describes it) has now happened
// four times in this codebase. Blanked rather than deleted so line numbers
// still point at the real thing.
const codeOnly = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
  .replace(/--[^\n]*/g, m => ' '.repeat(m.length));

const files = fs.readdirSync(MIG_DIR)
  .filter(f => f.endsWith('.sql') && parseInt(f, 10) >= FROM)
  .sort()
  .map(f => ({ name: f, sql: codeOnly(fs.readFileSync(path.join(MIG_DIR, f), 'utf8')) }));

const fail = [];
const ok = (name, cond, detail) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name);
  if (!cond) { if (detail) console.log('      ' + detail); fail.push(name); }
};
const hits = [];
const scan = (re, why) => {
  files.forEach(f => {
    const m = f.sql.match(re);
    if (m) hits.push(`${f.name}: ${why} — ${m[0].replace(/\s+/g, ' ').slice(0, 90)}`);
  });
};

console.log(`\n── Scanning ${files.length} migration(s) from ${FROM} up ──`);

// ══ 1. NO TENANT ID MAY BE WRITTEN INTO A RULE ════════════════════
//
// A hardcoded org id in a policy is one tenant's real data serving as the
// default answer, which is never safe. It is also invisible in review: the
// policy has a sensible NAME, and the name is what people read.
console.log('\n── Hardcoded tenants ──');
hits.length = 0;
scan(/CREATE\s+POLICY[\s\S]{0,600}?'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/i,
     'policy contains a literal uuid');
ok('no policy hardcodes an org id', hits.length === 0, hits.join('\n      '));

// ══ 2. A GUARD THAT SKIPS ITSELF WHEN NOBODY IS SIGNED IN ═════════
//
// `IF auth.uid() IS NOT NULL AND <not allowed> THEN refuse` reads like a
// check and is one, for signed-in callers only. anon walks straight past
// it. That is how generate_daily_service ended up letting a stranger
// schedule cleaning work in any agency on the platform.
//
// The shape to write instead is positive: refuse unless the caller has
// proven they belong.
console.log('\n── Guards that exempt the signed-out ──');
hits.length = 0;
scan(/IF\s+auth\.uid\(\)\s+IS\s+NOT\s+NULL\s+AND[\s\S]{0,400}?RAISE\s+EXCEPTION/i,
     'refusal gated on being signed in');
ok('no refusal is conditional on auth.uid() being present', hits.length === 0, hits.join('\n      '));

// ══ 3. VIEWS RUN AS THEIR OWNER UNLESS TOLD OTHERWISE ═════════════
//
// spend_owed had no security_invoker, so it read finance_transactions with
// RLS skipped entirely. It returned nothing in the probe only because that
// table is empty today — the leak would have started with the first
// expense anybody recorded, silently.
console.log('\n── Views ──');
hits.length = 0;
files.forEach(f => {
  const views = f.sql.match(/CREATE\s+(?:OR\s+REPLACE\s+)?VIEW[\s\S]*?;/gi) || [];
  views.filter(v => !/security_invoker/i.test(v))
       .forEach(v => hits.push(`${f.name}: view without security_invoker — ${v.replace(/\s+/g,' ').slice(0,80)}`));
});
ok('every new view sets security_invoker', hits.length === 0, hits.join('\n      '));

// ══ 4. SECURITY DEFINER MEANS THE search_path IS PART OF THE LOCK ═
//
// Postgres searches the temp schema FIRST for table names unless pg_temp
// is named explicitly. A SECURITY DEFINER function set to
// `search_path = public` can therefore be pointed at a caller's temp table
// while running as the owner. current_org_id and is_org_admin were both
// in that state; between them they decide nearly every policy here.
console.log('\n── SECURITY DEFINER search_path ──');
hits.length = 0;
files.forEach(f => {
  const fns = f.sql.match(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION[\s\S]*?(?:AS\s+\$)/gi) || [];
  fns.filter(fn => /SECURITY\s+DEFINER/i.test(fn))
     .forEach(fn => {
       const sp = fn.match(/SET\s+search_path\s*(?:=|TO)\s*([^\n]*)/i);
       const name = (fn.match(/FUNCTION\s+(?:public\.)?(\w+)/i) || [])[1] || '?';
       if (!sp)                          hits.push(`${f.name}: ${name}() sets no search_path`);
       else if (!/pg_temp/i.test(sp[1])) hits.push(`${f.name}: ${name}() search_path omits pg_temp — ${sp[1].trim()}`);
     });
});
ok('every SECURITY DEFINER function pins search_path with pg_temp', hits.length === 0, hits.join('\n      '));

// ══ 5. WRITES HANDED TO THE SIGNED-OUT ════════════════════════════
//
// Supabase grants anon ALL on every new public table by default, so a new
// table is open until somebody revokes. An explicit write grant to anon is
// occasionally right — the staff portal is signed-out by design — but it
// is never right by accident, so it has to be argued for in the file.
console.log('\n── Write grants to anon ──');
hits.length = 0;
scan(/GRANT\s+(?:ALL|[^;]*\b(?:INSERT|UPDATE|DELETE)\b)[^;]*\bON\s+(?:TABLE\s+)?public\.[^;]*\bTO\b[^;]*\banon\b/i,
     'table write granted to anon');
ok('no table write is granted to anon', hits.length === 0, hits.join('\n      '));

// ══ 6. NEW TABLES ARRIVE LOCKED ═══════════════════════════════════
console.log('\n── New tables ──');
hits.length = 0;
files.forEach(f => {
  const created = [...f.sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.(\w+)/gi)].map(m => m[1]);
  created.forEach(t => {
    if (!new RegExp(`ALTER\\s+TABLE\\s+public\\.${t}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i').test(f.sql))
      hits.push(`${f.name}: ${t} created without ENABLE ROW LEVEL SECURITY`);
    if (!new RegExp(`REVOKE\\s+[^;]*ON\\s+(?:TABLE\\s+)?public\\.${t}\\b[^;]*anon`, 'i').test(f.sql))
      hits.push(`${f.name}: ${t} created without revoking anon's default grants`);
  });
});
ok('every new table enables RLS and revokes the default anon grants',
   hits.length === 0, hits.join('\n      '));

// ══ 7. THE SWEEP ITSELF STAYS DONE ════════════════════════════════
//
// Cheap insurance against a later migration quietly restoring one of
// these. Each line is a hole that was open on production.
console.log('\n── The sweep has not been undone ──');
const sweep = files.find(f => f.name.startsWith('922'));
ok('922 is present', !!sweep);
if (sweep) {
  const s = sweep.sql;
  ok('the two hardcoded inspection policies are dropped',
     /DROP POLICY IF EXISTS "org members can view inspections"/i.test(s) &&
     /DROP POLICY IF EXISTS "org members can insert inspections"/i.test(s));
  ok('the unscoped anon booking insert is dropped',
     /DROP POLICY IF EXISTS "Allow direct booking inserts"/i.test(s));
  ok('generate_daily_service refuses anyone who cannot prove membership',
     /NOT \(auth\.uid\(\) IS NOT NULL AND public\.is_org_member\(p_org\)\)/.test(s) &&
     /REVOKE ALL ON FUNCTION public\.generate_daily_service[^;]*anon/i.test(s));
  ok('platform_ensure_sub is no longer reachable from a browser',
     /REVOKE ALL ON FUNCTION public\.platform_ensure_sub\(uuid\) FROM PUBLIC, anon, authenticated/i.test(s));
  ok('spend_owed respects the caller\'s own permissions',
     /ALTER VIEW public\.spend_owed SET \(security_invoker = true\)/i.test(s));
  ok('platform_settings is owner-only, with a function for the two public values',
     /CREATE POLICY platform_settings_owner_read[\s\S]{0,120}is_platform_owner\(\)/i.test(s) &&
     /REVOKE ALL ON public\.platform_settings FROM anon/i.test(s) &&
     /CREATE OR REPLACE FUNCTION public\.platform_public_settings\(\)/i.test(s));
  ok('the hardcoded-tenant staff portal functions are gone',
     /DROP FUNCTION IF EXISTS public\.get_staff_portal_logins\(\);/i.test(s) &&
     /DROP FUNCTION IF EXISTS public\.get_staff_portal_roster\(\);/i.test(s));
  ok('user_profiles no longer carries anon grants',
     /REVOKE ALL ON public\.user_profiles FROM anon, authenticated/i.test(s));
  ok('the four functions every policy depends on pin pg_temp',
     ['current_org_id\\(\\)', 'is_org_admin\\(uuid\\)', 'is_org_member\\(uuid\\)', 'has_permission\\(uuid, text\\)']
       .every(fn => new RegExp(`ALTER FUNCTION public\\.${fn}\\s+SET search_path = public, pg_temp`, 'i').test(s)));
}

// ══ 8. THE PART THAT IS STILL OPEN ════════════════════════════════
//
// The staff portal reads bookings, domestics, cleaner_availability,
// inventory_reports and property_inspections directly with the anon key,
// so anon can read S&N's guest names and rewrite all 58 domestics rows.
// Closing that means moving demo/domestic.html onto portal-key RPCs, which
// is p2-63 and is not something to half-do inside a migration.
//
// This asserts the exposure is written down, so it cannot quietly become
// the way things have always been.
console.log('\n── What is knowingly still open ──');
ok('922 records the staff portal exposure it does not close',
   !!sweep && /demo\/domestic\.html reads those tables directly/i.test(
     fs.readFileSync(path.join(MIG_DIR, '922_security_sweep.sql'), 'utf8')));

console.log('');
if (fail.length) {
  console.log(`✗ ${fail.length} check(s) failed:`);
  fail.forEach(f => console.log('   - ' + f));
  process.exit(1);
}
console.log('✓ RLS guards: all checks passed');
