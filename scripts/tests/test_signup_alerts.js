#!/usr/bin/env node
/**
 * Telling the owner somebody signed up.
 *
 * WHY THIS EXISTS. "I am missing that I am not being informed if there is
 * a new customer! I am scared someone finds the website and tries it out
 * and I never realise it without logging into the platform."
 *
 * She was right, and it was worse than a missing feature. Signup has been
 * open since the marketing page shipped. api/signup.js creates the org,
 * the login, the trial and the settings row, then emails a welcome TO THE
 * CUSTOMER — and told nobody here. The only way to discover a new agency
 * was to open HQ and count. A trial is seven days; lose the first three
 * and most of it is gone, on exactly the customer who arrived unaided.
 *
 * WHAT THIS GUARDS, and it is mostly about the ways silence can happen:
 *
 *   1. THE ALERT MUST NOT BE ABLE TO BREAK SIGNUP. A customer's account
 *      must never be rolled back because our notification failed — the
 *      signup handler deletes a half-made org on error, and a bounced
 *      email must not reach that path.
 *
 *   2. A FAILED EMAIL MUST NOT LOOK LIKE A QUIET WEEK. That is the whole
 *      point. The attempt is recorded whether it worked or not, a daily
 *      sweep re-sends anything with no successful row, and HQ shows the
 *      count that never got out — a fallback needing no mail provider.
 *
 *   3. NO DOUBLE SENDS. Claim-then-send, so a serverless retry cannot
 *      email twice.
 *
 *   4. EXISTING ORGS ARE NOT ANNOUNCED. Without the backfill the first
 *      sweep would email an alert for every agency that ever signed up,
 *      including S&N and the test accounts.
 *
 * Run: node scripts/tests/test_signup_alerts.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const alert  = read('api', '_lib', 'ownerAlert.js');
const signup = read('api', 'signup.js');
const cron   = read('api', 'cron', 'trial-reminders.js');
const mig    = read('supabase', 'migrations', '918_signup_alerts.sql');
const app    = read('demo', 'index_fixed.html');
// The handler only, so an import line at the top of the file cannot
// satisfy an ordering check that is really about the call sites.
const body   = signup.slice(signup.indexOf('export default async function handler'));

const fail = [];
const ok = (name, cond, detail) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name);
  if (!cond) { if (detail) console.log('      ' + detail); fail.push(name); }
};

// ══ 1. THE ALERT GOES OUT AT ALL ══════════════════════════════════
console.log('\n── Somebody signs up ──');
ok('signup sends an alert to the owner', /sendSignupAlert/.test(signup));
ok('it goes to a separate address from the customer-facing one',
   /OWNER_ALERT_EMAIL/.test(alert),
   'a personal or phone-notified inbox should not change what customers see in a From line');
ok('the alert carries who, what and how long is left',
   /row\('Business'/.test(alert) && /row\('Person'/.test(alert) &&
   /row\('Email'/.test(alert) && /Trial ends/.test(alert));
ok('and a link straight into HQ', /Open HQ/.test(alert));

// ══ 2. IT CANNOT BREAK A SIGNUP ═══════════════════════════════════
console.log('\n── It must never cost somebody their account ──');
// signup.js deletes a half-made org in its catch. An alert failure
// reaching that path would roll back a real customer's account for a
// reason that has nothing to do with them.
const alertBlock = signup.slice(signup.indexOf('// 6. TELL THE OWNER'), signup.indexOf('return res.status(200)'));
ok('the whole alert is wrapped so it cannot reach the rollback',
   /try \{[\s\S]*\} catch \(e\) \{[\s\S]{0,120}owner alert failed/.test(alertBlock));
// Ordering is checked inside the HANDLER, not the whole file: the import
// at the top would otherwise satisfy every "comes after" test trivially.
ok('it runs after everything the customer came for',
   body.indexOf('sendSignupAlert') > body.indexOf('org_subscriptions') &&
   body.indexOf('sendSignupAlert') > body.indexOf('sendWelcomeEmail'));
ok('the mailer never throws', /never throws and never rejects/i.test(alert) &&
   /catch \(e\) \{\s*return \{ error:/.test(alert));
ok('it is inert until a key exists rather than erroring',
   /if \(!RESEND_API_KEY\) return \{ skipped: true/.test(alert));
ok('and a signup failure still deletes the half-made org',
   /if \(orgId\) \{[\s\S]{0,400}organizations\?id=eq\.\$\{orgId\}`, \{ method: 'DELETE'/.test(signup));

// ══ 3. SILENCE IS NEVER MISTAKEN FOR "NOBODY CAME" ════════════════
console.log('\n── A failed email must not look like a quiet week ──');
ok('every attempt is recorded, not just the successful ones',
   /mark_platform_alert/.test(signup) && /p_ok: !!\(alert && alert\.ok\)/.test(signup));
ok('the record keeps why it failed', /detail  text/.test(mig) && /p_detail/.test(signup));
ok('a daily sweep finds signups with no successful alert',
   /signups_needing_alert/.test(cron) && /FUNCTION public\.signups_needing_alert/.test(mig));
// 24 hours would leave a week of outage invisible forever.
ok('the sweep looks back 30 days, not 24 hours',
   /p_days: 30/.test(cron) && /Thirty days, not one/.test(cron));
ok('the sweep cannot disturb the customer-facing reminders',
   /runs LAST and cannot affect the trial reminders/.test(cron) &&
   cron.indexOf('signups_needing_alert') > cron.indexOf('sendTrialEmail'));
// The fallback that needs no mail provider at all.
ok('HQ says out loud when an alert never got out',
   /function drawAlertHealth/.test(app) && /platform_alert_health/.test(app) &&
   /you were never told about/.test(app));
ok('and it stays silent when everything is fine',
   /if \(!un && !bad\) \{ el\.innerHTML = ''; return; \}/.test(app));
ok('it reassures that the customer is safe, only the notice failed',
   /The customers are safe/.test(app));

// ══ 4. NEVER TWICE ════════════════════════════════════════════════
console.log('\n── No double sends ──');
ok('the alert is claimed before it is sent',
   body.indexOf('claim_platform_alert') < body.indexOf('sendSignupAlert'));
ok('a second claim for the same org returns false',
   /ON CONFLICT \(kind, ref\) DO NOTHING/.test(mig) && /RETURN n = 1/.test(mig));
ok('the claim is keyed on the org, so one org is announced once',
   /PRIMARY KEY \(kind, ref\)/.test(mig));

// ══ 5. THE BACKFILL ═══════════════════════════════════════════════
console.log('\n── Existing agencies are not announced ──');
ok('every org that already existed is marked as known',
   /INSERT INTO public\.platform_alerts[\s\S]{0,200}FROM public\.organizations/.test(mig));
ok('and the migration says why',
   /the first sweep would email an alert for every agency/i.test(mig));

// ══ 6. IT IS THE PLATFORM OWNER'S DATA, NOBODY ELSE'S ═════════════
console.log('\n── Who can read the alert log ──');
// Signup emails and org names across every tenant. RLS on with no policy
// denies every browser; only the service key reaches it.
ok('RLS is on with no policy, so no browser can read the table',
   /ALTER TABLE public\.platform_alerts ENABLE ROW LEVEL SECURITY/.test(mig) &&
   !/CREATE POLICY[^\n]*platform_alerts/.test(mig));
ok('and the grants are revoked as well as the policy withheld',
   /REVOKE ALL ON public\.platform_alerts FROM anon, authenticated/.test(mig));
ok('the cross-tenant functions are service-key only',
   /REVOKE ALL ON FUNCTION public\.claim_platform_alert\(text, text\) FROM PUBLIC, anon, authenticated/.test(mig) &&
   /REVOKE ALL ON FUNCTION public\.signups_needing_alert\(int\) FROM PUBLIC, anon, authenticated/.test(mig));
// The one function a browser may call is the health count — and it must
// still check who is asking, because SECURITY DEFINER steps past RLS.
ok('the HQ health check is gated on being the platform owner',
   /platform_alert_health[\s\S]{0,600}WHERE public\.is_platform_owner\(\)/.test(mig));
ok('it returns counts, never a customer list',
   /RETURNS TABLE \(unannounced int, failed int, last_sent timestamptz\)/.test(mig));

// ══ 7. THE DRY RUN DOES NOT LEAK ADDRESSES ════════════════════════
console.log('\n── Diagnostics ──');
// The existing rule in this cron: a diagnostic that prints customer email
// addresses into a browser tab and a server log is one that leaks them.
const dryBlock = cron.slice(cron.indexOf('if (dry) {', cron.indexOf('signups_needing_alert')));
ok('the dry run reports names and dates, not email addresses',
   /org: m\.org_name, created: m\.created_at/.test(dryBlock) && !/owner_email/.test(dryBlock.slice(0, 400)));

// ══ 8. THE EMAIL ITSELF ═══════════════════════════════════════════
console.log('\n── The message ──');
ok('customer-supplied text is escaped before it lands in HTML',
   /const esc = \(s\)/.test(alert) && /esc\(p\.business\)|row\(/.test(alert) &&
   /replace\(\/</.test(alert));
ok('it tells her the trial is short and to act today',
   /seven days<\/strong>/.test(alert) && /by day four most of the trial is gone/.test(alert));
ok('the digest reads correctly for a single signup',
   /list\.length === 1 \? '1 signup you were not told about'/.test(alert));
ok('the request decides the origin, so links are right on every deployment',
   /origin/.test(signup) && /x-forwarded-host/.test(signup));

// ══ 9. PROVING THE CHANNEL WORKS ══════════════════════════════════
//
// The welcome email and the trial reminders are self-checking: a customer
// eventually notices those going missing. The signup alert is not — a
// broken mailer and a quiet week look identical from the inbox. So there
// has to be a way to ask "does this reach me?" that does not involve
// signing a fake agency up on production and then DELETING AN ORG from a
// live database for the sake of a drill.
console.log('\n── The test button ──');
const test = read('api', 'test-alert.js');

ok('there is a way to prove the alert arrives', /hqTestAlert/.test(app) && /Send me a test alert/.test(app));

// THE FIRST VERSION OF THIS ENDPOINT ANSWERED "Server not configured" —
// nothing to do with the mailer. It called is_platform_owner() as the
// caller, which is the more elegant shape, but that needs an anon key to
// send as the apikey header and there is no anon key in the server
// environment. Every other endpoint in api/ uses SUPABASE_URL plus
// SUPABASE_SERVICE_ROLE_KEY; this one assumed a variable that was never
// set anywhere.
ok('it only uses environment variables the server actually has',
   /process\.env\.SUPABASE_SERVICE_ROLE_KEY/.test(test) &&
   !/process\.env\.SUPABASE_ANON_KEY/.test(test) &&
   !/process\.env\.NEXT_PUBLIC_SUPABASE_ANON_KEY/.test(test));
// The token is still the only thing trusted — who it belongs to is asked
// of Supabase, never taken from the request.
ok('the caller is identified by their token, not by anything they send',
   /\/auth\/v1\/user`, \{\s*headers: \{ apikey: key, Authorization: `Bearer \$\{token\}` \}/.test(test) &&
   !/req\.body/.test(test));
// Must match is_platform_owner() in 904 exactly: an OWNER whose org is the
// one named by platform_settings. Verified against production — of six
// profiles only info@hosteasepro.com passes, including two other accounts
// that are owners of their own orgs.
ok('the rule is the same one the database uses',
   /me\.role === 'owner' && me\.org_id === settings\.platform_org_id/.test(test));
ok('and it refuses anyone who is not the platform owner',
   /return res\.status\(403\)\.json\(\{ error: 'Platform owner only' \}\)/.test(test));
ok('a failed lookup denies rather than allows',
   /catch \(e\) \{\s*return false;/.test(test));
// An endpoint that emails an address supplied in the request is an open
// relay with extra steps, and this one is reachable by anyone signed in.
ok('the destination comes from the environment, never from the request',
   /alertTo\(\)/.test(test) && !/req\.body/.test(test));
ok('a drill is unmistakable in the inbox',
   /TEST — this is a drill, no agency signed up/.test(test));
// "Nothing happened, and here is why" is the answer the button exists to
// give. A green tick over a silent failure would be worse than no button.
ok('an unconfigured mailer says so instead of reporting success',
   /configured: false/.test(test) && /no email was sent/.test(test));
ok('the screen shows the failure reason rather than a generic error',
   /msg\.textContent = out\.message/.test(app));

// ── Result ────────────────────────────────────────────────────────
console.log('');
if (fail.length) {
  console.log(`✗ ${fail.length} check(s) failed:`);
  fail.forEach(f => console.log('   - ' + f));
  process.exit(1);
}
console.log('✓ signup alerts: all checks passed');
