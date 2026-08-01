#!/usr/bin/env node
/**
 * The staff portal serves whichever agency the link names — not S&N.
 *
 * WHY THIS EXISTS. demo/domestic.html had `const ORG_ID = '5966bc67-…'` and
 * a PROPS map holding S&N's two property UUIDs, and the three SECURITY
 * DEFINER functions it calls before anyone signs in had that same uuid in
 * their WHERE clause. HEP hands the portal link to every agency from its
 * Settings page, so every agency's cleaners would have seen S&N's roster
 * and filed their work into S&N's org. It blocked onboarding anyone who
 * employs cleaners, which is every agency HEP is sold to.
 *
 * The agency now comes from the path: /domestic/<portal_key>. It has to
 * come from outside a session, because the first thing the page draws is
 * that agency's staff to choose from, before anyone has authenticated.
 *
 * WHAT THIS FILE CAN AND CANNOT SEE. It reads source, so it catches a
 * hardcoded id creeping back in. It cannot prove the page behaves — that
 * was done separately in a real browser, loading /domestic/<key> by URL
 * with the RPCs answered by payloads captured from the real database:
 * one key loads its own agency, a different key loads a different one with
 * none of the first agency's staff, and an unknown key asks for a proper
 * link instead of failing.
 *
 * Run: node scripts/tests/test_staff_portal_tenant.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const portal = read('demo', 'domestic.html');
const app = read('demo', 'index_fixed.html');
const migration = read('supabase', 'migrations', '903_staff_portal_multi_tenant.sql');
const vercel = JSON.parse(read('vercel.json'));

const fail = [];
const ok = (name, cond) => { console.log((cond ? '  ✓ ' : '  ✗ ') + name); if (!cond) fail.push(name); };

// Comments explaining what was wrong are kept on purpose; a rule that
// forbids naming the old mistake gets satisfied by deleting the warning.
const codeOnly = (src) => src.split('\n').filter(l => !/^\s*(\/\/|\*|<!--)/.test(l)).join('\n');

// ── Nothing is hardcoded to one agency ────────────────────────────
console.log('\n── Nothing is hardcoded to one agency ──');
const SN_ORG = '5966bc67-5c2f-45ae-8519-9b7eaeee09f4';
const SN_PROPS = ['e9737638-d83a-4947-940a-8746789e4d9f', '83b2a84a-5451-4be5-a84f-2efc0d2602d5'];

ok("the portal does not name S&N's org", !codeOnly(portal).includes(SN_ORG));
// FALLBACK_INVENTORY is keyed by uuid, so it is inert for any other agency
// and is left as S&N's offline safety net. Nothing may SCOPE on those ids.
const scoping = SN_PROPS.filter(id => new RegExp(`(org_id|property_id|eq\\(|propIds|pidMap)[^\\n]*${id}`).test(codeOnly(portal)));
ok("no query or write is scoped to S&N's property ids",
   scoping.length === 0 || (console.log('    found: ' + scoping.join(', ')), false));

// ── The key drives everything ─────────────────────────────────────
console.log('\n── The key drives everything ──');
ok('the key is read from the path', /PORTAL_KEY[\s\S]{0,300}location\.pathname/.test(portal));
ok('org id and properties start empty, resolved at boot',
   /let ORG_ID\s*=\s*null/.test(portal) && /let PROPS\s*=\s*\{\}/.test(portal));
ok('boot resolves the agency before rendering',
   /staff_portal_bootstrap/.test(portal) &&
   /bootstrapPortal\(\)[\s\S]{0,200}showNoPortalKey\(\)/.test(portal));
for (const fn of ['get_staff_portal_logins', 'get_staff_portal_roster', 'staff_portal_login']) {
  ok(`${fn} is called with the key`,
     new RegExp(`rpc\\('${fn}',\\{p_portal_key:PORTAL_KEY`).test(portal));
}
ok('an unknown key gets guidance, not a broken screen', /showNoPortalKey/.test(portal));

// ── Routing ───────────────────────────────────────────────────────
console.log('\n── Routing ──');
const srcs = vercel.rewrites.map(r => r.source);
// Without this the keyed link falls through to `/(.*)`, which serves the
// ADMIN app — a cleaner would get the agency dashboard's login screen.
ok('/domestic/:key resolves before the catch-all',
   srcs.indexOf('/domestic/:key') >= 0 && srcs.indexOf('/domestic/:key') < srcs.indexOf('/(.*)'));
ok('the bare /domestic route still resolves', srcs.indexOf('/domestic') >= 0);

// ── The database ──────────────────────────────────────────────────
console.log('\n── The database ──');
ok('organizations carry a portal key', /ADD COLUMN IF NOT EXISTS portal_key/.test(migration));
ok('keys are unique', /CREATE UNIQUE INDEX[\s\S]{0,120}portal_key/.test(migration));
ok('new agencies get one automatically', /CREATE TRIGGER organizations_portal_key/.test(migration));
ok('the bootstrap is callable by a signed-out phone',
   /GRANT EXECUTE ON FUNCTION public\.staff_portal_bootstrap\(text\) TO anon/.test(migration));
// A cleaner with the portal installed keeps running the cached old page
// until the service worker turns over; dropping these signs them out.
ok('the old zero-argument functions are kept for cached phones',
   /CREATE OR REPLACE FUNCTION public\.get_staff_portal_logins\(\)/.test(migration) &&
   /DEPRECATED/.test(migration));

// ── The link HEP hands out ────────────────────────────────────────
console.log('\n── The link HEP hands out ──');
ok('Settings builds the link from the org\'s own key',
   /portal_key/.test(app) && /'\/domestic' \+ \(key \? '\/' \+ key : ''\)/.test(app));

console.log(fail.length ? `\n${fail.length} FAILED\n` : '\nAll passed\n');
process.exit(fail.length ? 1 : 0);
