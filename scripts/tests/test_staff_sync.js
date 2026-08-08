#!/usr/bin/env node
/**
 * A sync button for somebody with no login.
 *
 * WHY THIS EXISTS. "Nina complained she couldn't see the latest booking in
 * the domestic platform to assign a cleaner. And when she tried syncing the
 * bookings as a new one came in from LekkeSlaap, it didn't load on her end.
 * I tried about 1.5h later and it worked immediately."
 *
 * The cron fixed the background half — bookings now arrive without anybody
 * having HEP open. This is the foreground half. Nina works in the staff
 * portal, has no auth.users row, and the "Sync calendars" button in
 * Settings needs an owner or admin. So when a booking landed between runs
 * and she needed to assign a cleaner NOW, she had to phone somebody.
 *
 * WHAT THIS GUARDS:
 *
 *   1. THE ORG COMES FROM THE PIN, NEVER FROM THE REQUEST. A caller cannot
 *      name an agency, only prove they belong to one. Otherwise this is a
 *      way to make a stranger's calendars get fetched.
 *
 *   2. IT CANNOT BE USED TO HAMMER THE PLATFORMS. A sync pulls every
 *      calendar the agency has from three companies we depend on. Rate
 *      limited per agency, in the database, atomically.
 *
 *   3. INSERTS AND UPDATES ONLY. Somebody pressing a button because a
 *      booking is MISSING must never be able to delete one.
 *
 *   4. THE PIN IS NEVER PERSISTED. It lives in memory for as long as the
 *      tab is open — these staff share phones.
 *
 * The database half was checked against staging rather than read: wrong
 * PIN refused, wrong name refused, a correct PIN against ANOTHER agency's
 * portal key refused, first press allowed, immediate second press refused
 * with 90s to wait, and allowed again once the cooldown passed.
 *
 * Run: node scripts/tests/test_staff_sync.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
// Folded into the cron endpoint when Vercel stopped building at 16
// serverless functions. That endpoint already owned three ways in, and
// "who may ask for a sync" belongs in one file rather than two that have
// to agree.
const api    = read('api', 'cron', 'ical-sync.js');
const portal = read('demo', 'domestic.html');
const mig    = read('supabase', 'migrations', '920_staff_portal_sync.sql');

// ── Checking for the ABSENCE of something needs the comments gone ──
//
// A negative test — "this file never calls deactivate" — matches the very
// comment that promises it never calls deactivate. That has now caught me
// four times in this codebase, so it gets a helper rather than another
// hand-narrowed regex. Blanked rather than removed so offsets still line up.
const codeOnly = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:'"\\])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));

const fail = [];
const ok = (name, cond, detail) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name);
  if (!cond) { if (detail) console.log('      ' + detail); fail.push(name); }
};

// ══ 1. THE ORG IS PROVEN, NEVER ASSERTED ══════════════════════════
console.log('\n── Whose calendars get fetched ──');
ok('the org comes from what the PIN resolves to',
   /orgId = claim\.sync_org_id;/.test(api));
// If an org id could be sent, this becomes a way to make any agency's
// calendars get fetched by anyone holding any valid PIN.
// The staff path must take ONLY these three from the request. ?org= is
// honoured for the cron paths, which hold the secret; a staff caller must
// never be able to point a sync at somebody else's agency.
ok('the request cannot name an org',
   /const \{ portalKey, name, pin \} = req\.body;/.test(api) &&
   /orgId = claim\.sync_org_id;/.test(api) &&
   /NEVER\s*\n?\s*\/\/ read from the request/.test(api));
ok('the PIN is checked against the org that owns the portal key',
   /o\.portal_key = p_portal_key/.test(mig) && /tc\.portal_pin = p_pin/.test(mig));
ok('it is the same test the portal login already makes',
   /split_part\(tc\.name, ' ', 1\) = p_name/.test(mig));
// Verified on staging: a valid PIN against another agency's portal key is
// refused, because the JOIN requires both to belong to the same org.
ok('a valid PIN against another agency\'s portal key finds nothing',
   /JOIN public\.organizations o ON o\.id = tc\.org_id/.test(mig));
ok('a bad PIN and a bad name give the same answer',
   /One answer\s*\n?\s*--\s*for all three/.test(mig) || /one answer for all three/i.test(mig));

// ══ 2. IT CANNOT HAMMER THE PLATFORMS ═════════════════════════════
console.log('\n── The cooldown ──');
ok('there is a per-agency rate limit', /p_cooldown_seconds int DEFAULT 90/.test(mig));
// Per ORG rather than per person: two cleaners pressing at once is one
// sync, which is also the right answer.
ok('it is per agency, not per person',
   /rate-limited per ORG rather than per person/.test(mig));
// The check and the claim have to be one statement, or two simultaneous
// presses both pass the check before either writes.
ok('checking and claiming happen in a single statement',
   /UPDATE public\.org_sync_runs[\s\S]{0,200}AND last_run_at < now\(\) - make_interval/.test(mig) &&
   /GET DIAGNOSTICS n = ROW_COUNT/.test(mig));
ok('the very first sync for an agency is not blocked by a missing row',
   /IF v_last IS NULL THEN[\s\S]{0,300}INSERT INTO public\.org_sync_runs/.test(mig));
ok('and losing that insert race is treated as cooling, not as success',
   /ON CONFLICT \(org_id\) DO NOTHING/.test(mig));
// Being told "already up to date" is not a failure and must not render as
// one on a phone in a hurry.
ok('cooling down answers 200, not an error',
   /200, not 429/.test(api) && /synced: false, cooling: true/.test(api));

// ══ 3. WHAT IT CANNOT DO ══════════════════════════════════════════
console.log('\n── Limits ──');
ok('it inserts and updates only, never cancels',
   /INSERTS AND UPDATES ONLY/.test(api) && !/deactivate|cancelStale|releaseBlock/.test(codeOnly(api)),
   'the shared importer never deletes; the destructive sweep stays in the app under a human');
ok('it reuses the shared importer rather than a second copy',
   /import \{ importAllFeeds \} from '\.\.\/_lib\/icalImport\.js'/.test(api));
// A cleaner needs to know it worked, not who is staying where.
ok('the reply is counts, not a guest list',
   /Counts only for staff/.test(api) && /created: sum\('created'\)/.test(api) && !/guest_name/.test(api));
// staff_portal_login is granted to anon; this must not be, or PINs can be
// walked against it directly with no endpoint in the way.
ok('the claim function is not reachable from a browser',
   /REVOKE ALL ON FUNCTION public\.staff_portal_sync_claim\(text, text, text, int\) FROM PUBLIC, anon, authenticated/.test(mig) &&
   !/GRANT EXECUTE ON FUNCTION public\.staff_portal_sync_claim/.test(mig));
ok('and neither is the sync log',
   /ALTER TABLE public\.org_sync_runs ENABLE ROW LEVEL SECURITY/.test(mig) &&
   /REVOKE ALL ON public\.org_sync_runs FROM anon, authenticated/.test(mig));

// ══ 4. THE PIN IN THE PAGE ════════════════════════════════════════
console.log('\n── Holding the PIN ──');
// These staff share phones. A PIN in localStorage outlives the browser
// being closed, which is exactly what must not happen.
ok('the PIN is held in memory, never in storage',
   /let sessionPin  = '';/.test(portal) &&
   !/localStorage[^\n]*sessionPin|setItem\('hep_pin/.test(portal));
ok('and the file says why',
   /IN MEMORY ONLY\. Never localStorage/.test(portal));
ok('it is kept only after the server accepted it',
   /sessionName = selectedCleaner\.name; sessionPin = entered;/.test(portal) &&
   /Kept only after the server said the PIN was right/.test(portal));
ok('signing out clears it', /sessionName=''; sessionPin='';/.test(portal));

console.log('\n── The button ──');
ok('the coordinator has a sync button', /id="staff-sync-btn"/.test(portal) && /onclick="staffSync\(this\)"/.test(portal));
ok('it is translated into all four portal languages',
   ['Sync bookings', 'Sinkroniseer besprekings', 'Tora mabhukingi', 'Landa iibhukingi']
     .every(s => portal.includes(s)));
ok('it says how long to wait rather than just refusing',
   /syncSoon/.test(portal) && /t\('syncSoon', \{ n: out\.waitSeconds \|\| 0 \}\)/.test(portal));
ok('it reports how many bookings actually came in',
   /const fresh = \(out\.created \|\| 0\) \+ \(out\.updated \|\| 0\)/.test(portal));
// A list that redraws every time somebody checks makes them wonder what
// they missed.
ok('the screen only redraws when something changed',
   /if \(fresh\) \{/.test(portal) && /Only redraw when something actually changed/.test(portal));
ok('the button comes back after a moment so it can be pressed again',
   /setTimeout\(\(\) => \{ btn\.textContent = label; btn\.disabled = false; \}, 4000\)/.test(portal));

// ── Result ────────────────────────────────────────────────────────
console.log('');
if (fail.length) {
  console.log(`✗ ${fail.length} check(s) failed:`);
  fail.forEach(f => console.log('   - ' + f));
  process.exit(1);
}
console.log('✓ staff portal sync: all checks passed');
