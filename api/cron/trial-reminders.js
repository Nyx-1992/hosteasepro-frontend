// Nightly: tell trialling agencies their week is running out.
//
// Nothing did this before. signup.js sets a seven-day trial and the app
// simply went read-only one morning with no warning — the worst possible
// first experience of billing, and the reason "test HEP" was being kept
// open to test a reminder that did not exist.
//
// ── HOW IT CANNOT SPAM ────────────────────────────────────────────
//
// CLAIM, THEN SEND. Each reminder is recorded in trial_reminders BEFORE
// the email goes out, with (org, kind, trial_end_date) as the primary key.
// A second run finds the row already there and skips. If the send then
// fails, the claim is deleted so tomorrow retries it — which is the right
// way round: a duplicate email is worse than a delayed one, and this can
// only produce the second.
//
// The trial END DATE is part of the key on purpose. Extend a trial from HQ
// and the sequence re-arms by itself; key on (org, kind) alone and an
// extended customer would never be warned again, because 't1' was already
// "sent" for a deadline that no longer exists.
//
// trial_reminders_due() returns AT MOST ONE row per agency, choosing the
// most urgent band that applies, so nobody gets two emails in a morning
// because yesterday's run failed.
//
// ── AUTH ──────────────────────────────────────────────────────────
//
// This endpoint sends email, so it cannot be open. Two ways in:
//   1. Authorization: Bearer $CRON_SECRET, if CRON_SECRET is set.
//   2. Vercel's own x-vercel-cron header, which Vercel strips from
//      inbound requests and therefore cannot be forged from outside.
// If neither is present it refuses. Setting CRON_SECRET is worth doing
// and is not required for the schedule to work.
//
// ── THE SCHEDULE ──────────────────────────────────────────────────
//
// vercel.json runs this at 07:00 UTC, which is 09:00 in Cape Town — the
// start of the working day rather than the middle of the night. Once
// daily is enough: the bands below are whole days wide, and the query
// emits at most one row per agency per run. (The schedule lives in
// vercel.json, which is JSON and cannot carry the reason why.)
//
// ── TRYING IT WITHOUT SENDING ─────────────────────────────────────
//
//   /api/cron/trial-reminders?dry=1
//
// Reports exactly who would be emailed and with which message, sends
// nothing, and claims nothing. HQ shows the same list on screen, which
// needs no secret at all.

import { sendTrialEmail } from '../_lib/trialEmail.js';
import { sendSignupDigest } from '../_lib/ownerAlert.js';

const SUPABASE_URL = process.env.SUPABASE_URL;

export default async function handler(req, res) {
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_ROLE_KEY || !SUPABASE_URL) {
    return res.status(500).json({ error: 'Server not configured' });
  }

  const secret = process.env.CRON_SECRET || '';
  const auth = req.headers.authorization || '';
  const fromVercelCron = !!req.headers['x-vercel-cron'];
  if (secret) {
    if (auth !== `Bearer ${secret}`) return res.status(401).json({ error: 'Not authorised' });
  } else if (!fromVercelCron) {
    return res.status(401).json({ error: 'Not authorised' });
  }

  const dry = String((req.query && req.query.dry) || '') === '1';

  const svc = {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };

  // The origin the customer will click. Taken from the request rather than
  // hardcoded, so preview deployments link to themselves and the live one
  // links to hosteasepro.com without a code change — the same reason
  // welcomeEmail.js takes it as a parameter.
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'hosteasepro.com';
  const origin = `${proto}://${host}`;

  let due;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/trial_reminders_due`, {
      method: 'POST', headers: svc, body: '{}',
    });
    if (!r.ok) throw new Error(await r.text());
    due = await r.json();
  } catch (e) {
    return res.status(500).json({ error: 'Could not read who is due', detail: String(e).slice(0, 300) });
  }

  if (dry) {
    return res.status(200).json({
      dry: true,
      would_send: due.length,
      // No email addresses in the response. This is a diagnostic, and a
      // diagnostic that prints customer addresses into a browser tab and
      // a server log is a diagnostic that leaks them.
      rows: due.map(d => ({ org: d.org_name, kind: d.kind, days_left: d.days_left })),
    });
  }

  const results = { sent: 0, failed: 0, skipped: 0, detail: [] };

  for (const d of due) {
    // Claim it first. A conflict means another run already has it.
    let claimed = false;
    try {
      const c = await fetch(`${SUPABASE_URL}/rest/v1/trial_reminders`, {
        method: 'POST',
        headers: { ...svc, Prefer: 'return=representation,resolution=ignore-duplicates' },
        body: JSON.stringify({
          org_id: d.org_id, kind: d.kind, trial_ends_on: d.trial_ends_on, to_email: d.owner_email,
        }),
      });
      const rows = c.ok ? await c.json() : [];
      claimed = Array.isArray(rows) && rows.length > 0;
    } catch (e) {
      results.failed++;
      results.detail.push({ org: d.org_name, error: 'claim failed' });
      continue;
    }
    if (!claimed) { results.skipped++; continue; }

    const out = await sendTrialEmail(d.kind, {
      email: d.owner_email,
      name: d.owner_name,
      business: d.org_name,
      origin,
      trialEndsAt: d.trial_ends_at,
      daysLeft: d.days_left,
    });

    if (out && out.sent) {
      results.sent++;
      results.detail.push({ org: d.org_name, kind: d.kind, sent: true });
    } else {
      // Release the claim so tomorrow tries again. A reminder that never
      // arrives is the failure this whole endpoint exists to prevent, and
      // a stuck claim would make it permanent and silent.
      await fetch(
        `${SUPABASE_URL}/rest/v1/trial_reminders?org_id=eq.${d.org_id}&kind=eq.${d.kind}&trial_ends_on=eq.${d.trial_ends_on}`,
        { method: 'DELETE', headers: svc },
      ).catch(() => {});
      results.failed++;
      results.detail.push({ org: d.org_name, kind: d.kind, error: (out && (out.error || out.skipped)) || 'unknown' });
    }
  }

  // ══ THE SAFETY NET ══════════════════════════════════════════════
  //
  // Owner: "I am scared someone finds the website and tries it out and I
  // never realise it." api/signup.js emails her the moment an agency signs
  // up — but an email that fails looks exactly like a quiet week, which is
  // precisely the thing she cannot afford to be wrong about.
  //
  // So the alert is recorded (918) and this sweeps up anything with no
  // successful row against it. Thirty days, not one: if the mailer was
  // down for a week, a 24-hour window would leave every one of those
  // signups invisible forever.
  //
  // It runs LAST and cannot affect the trial reminders above — those are
  // owed to customers, this one is owed to us.
  results.signups_recovered = 0;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/signups_needing_alert`, {
      method: 'POST', headers: svc, body: JSON.stringify({ p_days: 30 }),
    });
    const missed = r.ok ? await r.json() : [];
    if (Array.isArray(missed) && missed.length) {
      if (dry) {
        // Names, not email addresses — same rule as the block above.
        results.signups_missing = missed.map(m => ({ org: m.org_name, created: m.created_at }));
      } else {
        const out = await sendSignupDigest(missed, origin);
        // Marked one by one, so a partial recovery is recorded honestly:
        // the digest either reached her about all of them or none.
        for (const m of missed) {
          await fetch(`${SUPABASE_URL}/rest/v1/rpc/claim_platform_alert`, {
            method: 'POST', headers: svc,
            body: JSON.stringify({ p_kind: 'signup', p_ref: m.org_id }),
          }).catch(() => {});
          await fetch(`${SUPABASE_URL}/rest/v1/rpc/mark_platform_alert`, {
            method: 'POST', headers: svc,
            body: JSON.stringify({
              p_kind: 'signup', p_ref: m.org_id,
              p_ok: !!(out && out.ok),
              p_detail: (out && (out.error || 'recovered by daily digest')) || 'recovered by daily digest',
            }),
          }).catch(() => {});
        }
        if (out && out.ok) results.signups_recovered = missed.length;
        else results.signups_alert_error = (out && (out.error || 'skipped')) || 'unknown';
      }
    }
  } catch (e) {
    results.signups_alert_error = String((e && e.message) || e).slice(0, 200);
  }

  return res.status(200).json(results);
}
