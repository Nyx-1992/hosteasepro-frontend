#!/usr/bin/env node
/**
 * Trials get a warning before they run out.
 *
 * WHY THIS EXISTS. signup.js has always set a seven-day trial and nothing
 * ever told anyone it was ending. The app simply went read-only one
 * morning — no warning, no explanation. That is the worst possible first
 * experience of billing, and it is the reason "test HEP" was being kept
 * open to test a reminder that did not exist.
 *
 * WHAT A SOURCE-READING TEST CAN AND CANNOT SEE. It cannot prove an email
 * arrives. The banding and the no-duplicate rule were checked against the
 * live database instead, by walking one org through the whole sequence:
 * 3 days out offered t3; claiming it made the same day offer nothing; 1
 * day out offered t1; expired offered t0; comping it offered nothing; and
 * moving the end date while a claim existed offered t3 again, which is the
 * case that keying on (org, kind) alone would have broken silently.
 *
 * What this file guards is everything that would make those behaviours
 * quietly stop being true: the honesty of what the emails say, the claim
 * ordering, the auth on an endpoint that sends mail, and the schedule
 * actually existing.
 *
 * Run: node scripts/tests/test_trial_reminders.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const mig = read('supabase', 'migrations', '907_trial_reminders.sql');
const cron = read('api', 'cron', 'trial-reminders.js');
const email = read('api', '_lib', 'trialEmail.js');
const app = read('demo', 'index_fixed.html');
const vercel = JSON.parse(read('vercel.json'));

const fail = [];
const ok = (name, cond, detail) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name);
  if (!cond) { if (detail) console.log('      ' + detail); fail.push(name); }
};

// ══ IT ACTUALLY RUNS ══════════════════════════════════════════════
console.log('\n── It is scheduled ──');
const job = (vercel.crons || []).find(c => c.path === '/api/cron/trial-reminders');
ok('vercel.json schedules the reminder run', !!job);
ok('it runs daily in the morning, Cape Town time', !!job && /^0 [5-8] \* \* \*$/.test(job.schedule),
   job ? job.schedule : 'no cron');
// Vercel validates this schema strictly and rejects unknown keys, so a
// comment cannot live in here — an earlier version tried and would have
// failed the deploy.
ok('the cron entry carries no keys Vercel would reject',
   !!job && Object.keys(job).every(k => k === 'path' || k === 'schedule'),
   job ? Object.keys(job).join(', ') : '');
ok('/api/* still reaches the function', (vercel.rewrites || []).some(r => r.source === '/api/(.*)'));

// ══ IT CANNOT SPAM ════════════════════════════════════════════════
console.log('\n── It cannot send the same email twice ──');

// The trial END DATE is part of the key. Without it, extending a trial
// leaves the customer permanently marked as already warned — about a
// deadline that no longer exists.
ok('the claim is keyed on org, kind AND the trial end date',
   /PRIMARY KEY \(org_id, kind, trial_ends_on\)/.test(mig));
ok('the query skips anything already sent for this end date',
   /NOT EXISTS[\s\S]{0,200}trial_reminders r[\s\S]{0,200}r\.trial_ends_on = o\.ends_on/.test(mig));

// CLAIM THEN SEND, never the reverse. A duplicate email is worse than a
// delayed one, and this ordering can only produce the second.
const claimAt = cron.indexOf('rest/v1/trial_reminders');
const sendAt = cron.indexOf('sendTrialEmail(');
ok('the reminder is claimed before it is sent', claimAt > 0 && sendAt > claimAt);
ok('a conflicting claim is treated as already-done, not an error',
   /resolution=ignore-duplicates/.test(cron) && /if \(!claimed\)/.test(cron));
// If the send fails the claim must be released, or the reminder never
// arrives at all — permanently, and silently.
ok('a failed send releases the claim so tomorrow retries',
   /method: 'DELETE'[\s\S]{0,200}|DELETE[\s\S]{0,300}results\.failed/.test(cron) &&
   /trial_reminders\?org_id=eq\./.test(cron));

// At most one row per agency per run, most urgent band wins — otherwise a
// customer whose t3 failed yesterday gets t3 and t1 the same morning.
ok('one email per agency per run, most urgent band wins',
   /CASE WHEN days_left <= 0 THEN 't0'[\s\S]{0,160}WHEN days_left = 1  THEN 't1'[\s\S]{0,160}WHEN days_left <= 3 THEN 't3'/.test(mig));
// The 3-day band is a range so a missed run still catches it.
ok('the 3-day band is wide enough to survive a missed run', /days_left <= 3/.test(mig));

// ══ WHO IT LEAVES ALONE ═══════════════════════════════════════════
console.log('\n── Who it does not email ──');
ok('comped accounts are not on a clock', /s\.plan <> 'founder'/.test(mig));
ok('only trialling subscriptions', /s\.status = 'trialing'/.test(mig));
ok('HostEase Pro is not its own customer', /platform_org_id/.test(mig));
ok('an org with no owner email is skipped rather than erroring',
   /o\.owner_email IS NOT NULL/.test(mig));

// ══ THE EMAILS TELL THE TRUTH ═════════════════════════════════════
console.log('\n── The emails describe what actually happens ──');
//
// 880 made a lapsed subscription mean READ EVERYTHING, WRITE NOTHING. The
// owner's rule was "definitely limited view, but not lock out". An email
// implying data loss to create urgency would be a lie, and the first one
// lands on somebody still deciding whether to trust a small company with
// the record of their business.
ok('no email threatens deletion',
   !/delete[sd]?\b[^.]{0,40}(your )?data|data[^.]{0,30}(will be|be) (deleted|lost|removed)/i.test(email));
ok('the expiry email says nothing is deleted and nobody is locked out',
   /Nothing has been\s*\n?\s*deleted and you have not been locked out/.test(email));
ok('it explains that reading still works and only writing stops',
   /still there to read/.test(email) && /What has stopped is writing/.test(email));
ok('every email says there is no card and nothing to cancel',
   /no card on your account/.test(email) && /nothing to cancel/.test(email));
ok('all three kinds exist', /kind === 't3'/.test(email) && /kind === 't1'/.test(email) && /t0 — the day it runs out/.test(email));
ok('the 3-day email offers more time rather than pressure',
   /reply to this email and\s*\n?\s*tell me/.test(email));
ok('the 1-day email offers an extension',
   /If you need longer to decide, just ask/.test(email));
// A bounced reminder for one agency must not abort the loop and rob
// everybody after them in the list.
ok('sending never throws', /export async function sendTrialEmail[\s\S]*?try \{[\s\S]*?catch \(e\)/.test(email));
ok('it is inert without an API key rather than crashing',
   /if \(!RESEND_API_KEY\) return \{ skipped/.test(email));

// ══ AN ENDPOINT THAT SENDS MAIL CANNOT BE OPEN ════════════════════
console.log('\n── Auth ──');
ok('a CRON_SECRET, when set, is required',
   /if \(secret\) \{[\s\S]{0,160}Bearer \$\{secret\}[\s\S]{0,80}401/.test(cron));
// Vercel strips x-vercel-* from inbound requests, so this header cannot be
// forged from outside and is a safe fallback before the secret is set.
ok("Vercel's own cron header is the only other way in",
   /x-vercel-cron/.test(cron) && /else if \(!fromVercelCron\)[\s\S]{0,80}401/.test(cron));
// WAS a count of 401s, expecting exactly two. That broke the moment the
// alert drill was folded into this file — a correct change — because the
// drill has its own 401. Counting the guards was never the point; what
// matters is that no path reaches the sending code unauthenticated.
//
// The drill is the only other way in, it is gated on being the platform
// owner, and it returns before the cron auth below rather than falling
// through into it.
ok('the only other way in is the platform-owner drill, and it is gated',
   /req\.query\.test === 'alert'/.test(cron) &&
   /if \(!\(await isPlatformOwner\(tok, URL_, K\)\)\) return res\.status\(403\)/.test(cron) &&
   /if \(!tok\) return res\.status\(401\)/.test(cron));
ok('and the drill cannot fall through into the reminder run',
   cron.indexOf("req.query.test === 'alert'") < cron.indexOf('const secret') &&
   /message: \(out && out\.error\)[\s\S]{0,80}\}\);\s*\n  \}/.test(cron));
ok('the service-role key is required, not optional',
   /if \(!SERVICE_ROLE_KEY \|\| !SUPABASE_URL\)/.test(cron));

// ══ WHO CAN SEE CUSTOMER EMAIL ADDRESSES ══════════════════════════
console.log('\n── Counts, never contents — still ──');
// trial_reminders_due() returns addresses because the cron has to write to
// them. Nothing signed into a browser may call it.
ok('the cron query is not reachable by a signed-in browser',
   /REVOKE ALL ON FUNCTION public\.trial_reminders_due\(\) FROM PUBLIC, anon, authenticated/.test(mig) &&
   /GRANT EXECUTE ON FUNCTION public\.trial_reminders_due\(\) TO service_role/.test(mig));
// The HQ version deliberately drops the addresses.
const hqFn = mig.slice(mig.indexOf('FUNCTION public.platform_trials_due'));
ok('the HQ version returns names and dates, no email addresses',
   !/owner_email/.test(hqFn.slice(0, hqFn.indexOf('$fn$;') + 5)));
ok('the HQ version is gated on is_platform_owner()', /public\.is_platform_owner\(\)/.test(hqFn));
ok('the log table is readable by nobody signed in',
   /REVOKE ALL ON public\.trial_reminders FROM PUBLIC, anon, authenticated/.test(mig));
// 880 attaches its lapse trigger to every table with an org_id, by loop.
// Left attached, writing the record of "your trial ended" would be blocked
// by the very lapse it records.
ok('the lapse trigger is detached from the reminder log',
   /DROP TRIGGER IF EXISTS subscription_write_gate ON public\.trial_reminders/.test(mig));
// A diagnostic that prints customer addresses into a browser tab and a
// server log is a diagnostic that leaks them.
ok('the dry run reports names, not addresses',
   /dry[\s\S]{0,400}org: d\.org_name/.test(cron) && !/dry[\s\S]{0,400}owner_email/.test(cron));

// ══ SHE CAN SEE WHAT IS QUEUED ════════════════════════════════════
console.log('\n── HQ shows what is going out ──');
ok('HQ has a "going out tonight" panel', /Going out tonight/.test(app));
ok('it uses the same query the cron uses', /db\.rpc\('platform_trials_due'\)/.test(app));
// The function body, not a window of characters after the name. A window
// swept up the call site, the next function, and this file's own comment
// about the cron — so the check was reading prose and calling it a send.
const drawFn = app.slice(app.indexOf('async function drawTrialsDue()'));
const drawBody = drawFn.slice(0, drawFn.indexOf('\n}\n') + 2);
ok('looking at it does not send anything',
   drawBody.length > 200 && !/fetch\(|trial-reminders/.test(drawBody));
ok('it explains that extending re-arms the sequence', /re-arms the whole sequence/.test(app));

// ══ KEEPING STAGING AWAKE ═════════════════════════════════════════
//
// Owner, on the second warning email: "Why is this still happening? Must I
// do the cron job?" No. Supabase pauses a free project after 7 days idle,
// and losing staging past 90 days is permanent. This job already runs
// daily, so it reads one row from staging on the way past — no new Vercel
// function, which matters at the twelve-function limit, and nothing for
// her to remember.
console.log('\n── The staging keep-alive ──');
ok('the daily job pings staging', /results\.staging_keepalive/.test(cron));
ok('it rides on a job that already runs daily, adding no new function',
   vercel.crons.some(c => c.path === '/api/cron/trial-reminders') &&
   fs.readdirSync(path.join(ROOT, 'api', 'cron')).filter(f => f.endsWith('.js')).length === 2);
// A keep-alive nobody checks is worse than none: it can fail for six weeks
// and only be discovered once the project has gone.
ok('a failure is reported rather than swallowed',
   /staging_keepalive = ping\.ok \? 'ok' : \('http ' \+ ping\.status\)/.test(cron) &&
   /staging_keepalive = 'failed: '/.test(cron));
// ── Comments stripped before any of this is matched ──────────────
//
// The block below is checked for the ABSENCE of words like "bookings",
// and the commentary above it happens to say "before they touched real
// bookings". Matching raw text makes the explanation fail the check it
// explains. That has now happened four times in this codebase, so it gets
// the same helper every other test here uses. Blanked, not removed, so
// offsets still line up.
const codeOnly = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:'"\\])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
const cronCode = codeOnly(cron);
const keepAlive = cronCode.slice(cronCode.indexOf('const stagingUrl'));

ok('it cannot take the whole job down with it',
   /try \{[\s\S]*?staging_keepalive[\s\S]*?\} catch \(e\) \{[\s\S]{0,160}staging_keepalive = 'failed/
     .test(cronCode.slice(cronCode.lastIndexOf('try {'))));
ok('there is a timeout, so a hung request does not stall the run',
   /AbortSignal\.timeout\(10000\)[\s\S]{0,200}\}\);\s*\n\s*\/\/ Reported either way/.test(cron) ||
   /signal: AbortSignal\.timeout\(10000\)/.test(cron));
ok('both the url and the key can be overridden by environment',
   /process\.env\.STAGING_KEEPALIVE_URL \|\|/.test(cron) &&
   /process\.env\.STAGING_KEEPALIVE_KEY \|\|/.test(cron));
// The one thing a ping cannot do, said out loud so nobody assumes it can.
ok('it says a ping cannot revive an already-paused project',
   /cannot REVIVE a paused project/.test(cron));
// It reads a global table of calendar dates with the public key — not
// tenant data, and nothing writable.
ok('it reads public_holidays, not anybody\'s bookings',
   /public_holidays\?select=country_code&limit=1/.test(keepAlive) &&
   !/bookings|guest_|domestics/.test(keepAlive));

// ── Result ────────────────────────────────────────────────────────
console.log('');
if (fail.length) {
  console.log(`✗ ${fail.length} check(s) failed:`);
  fail.forEach(f => console.log('   - ' + f));
  process.exit(1);
}
console.log('✓ trial reminders: all checks passed');
