// PUBLIC self-serve signup — creates an agency's organisation, its first
// owner login, and a one-week trial.
//
// Distinct from create-org.js, which is the INTERNAL tool: that one is
// gated to an owner within S&N's own org and exists for hand-recruiting
// design partners. This one is deliberately unauthenticated, because a
// signup form that requires a login is not a signup form.
//
// ── THE DECISIONS BAKED IN HERE ───────────────────────────────────
//
// NO CARD UP FRONT. The owner's call: "people are wary of adding such
// info, myself included." Asking for a card before anyone has seen the
// product costs signups, and at this stage usage feedback is worth more
// than filtering out tyre-kickers. The expected consequence is more
// trials that never convert; that is fine and should not be read as the
// product failing.
//
// ONE WEEK, stored as a date on the row rather than assumed in code, so
// a longer trial can be granted to a design partner without a deploy.
//
// ── WHAT AN UNAUTHENTICATED ENDPOINT MUST NOT DO ──────────────────
//
// It creates a brand-new EMPTY org every time and never touches an
// existing one, so the blast radius of abuse is junk rows rather than
// access to anyone's data. It cannot be pointed at an existing org: the
// org id is generated here, never read from the request. And it refuses
// an email that already has an account rather than attaching a second
// org to it, which would otherwise be a way to graft yourself onto
// somebody else's login.

import { sendWelcomeEmail } from './_lib/welcomeEmail.js';
import { sendSignupAlert } from './_lib/ownerAlert.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const TRIAL_DAYS = 7;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_ROLE_KEY || !SUPABASE_URL) {
    return res.status(500).json({ error: 'Server not configured' });
  }
  const svc = {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };

  const { email, password, name, business } = req.body || {};
  if (!email || !password || !name || !business) {
    return res.status(400).json({ error: 'Please fill in every field.' });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email))) {
    return res.status(400).json({ error: 'That email address does not look right.' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  let orgId = null;
  let userId = null;
  let portalKey = '';

  try {
    // 1. The org. Created first so the profile has somewhere to belong.
    const orgRes = await fetch(`${SUPABASE_URL}/rest/v1/organizations`, {
      method: 'POST', headers: { ...svc, Prefer: 'return=representation' },
      body: JSON.stringify([{ name: String(business).trim().slice(0, 120) }]),
    });
    if (!orgRes.ok) throw new Error(await orgRes.text());
    // return=representation gives back the whole row, including the
    // portal_key the 903 trigger generates — so the welcome email can carry
    // their staff portal link without a second round trip.
    const orgRow = (await orgRes.json())[0];
    orgId = orgRow.id;
    portalKey = orgRow.portal_key || '';

    // 2. The owner login. A duplicate email fails here, before anything
    //    is attached to an account that already exists.
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST', headers: svc,
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    const newUser = await userRes.json();
    if (!userRes.ok) {
      await fetch(`${SUPABASE_URL}/rest/v1/organizations?id=eq.${orgId}`, { method: 'DELETE', headers: svc });
      const msg = newUser.msg || newUser.error_description || '';
      return res.status(400).json({
        error: /already/i.test(msg)
          ? 'There is already an account with that email. Sign in instead.'
          : (msg || 'Could not create that login.'),
      });
    }
    userId = newUser.id;

    const initials = String(name).trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'HP';
    const profRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
      method: 'POST', headers: { ...svc, Prefer: 'return=minimal' },
      body: JSON.stringify([{ id: userId, org_id: orgId, name: String(name).trim(), role: 'owner', initials, locale: 'en' }]),
    });
    if (!profRes.ok) throw new Error(await profRes.text());

    // 3. The trial. Written BEFORE the response, so an org can never
    //    exist without a subscription row — 880 fails open on a missing
    //    row, which would quietly hand out a free forever account.
    const trialEnds = new Date(Date.now() + TRIAL_DAYS * 86400000).toISOString();
    const subRes = await fetch(`${SUPABASE_URL}/rest/v1/org_subscriptions`, {
      method: 'POST', headers: { ...svc, Prefer: 'return=minimal' },
      body: JSON.stringify([{
        org_id: orgId, plan: 'trial', status: 'trialing', trial_ends_at: trialEnds,
        notes: 'Self-serve signup. No card taken — see api/signup.js.',
      }]),
    });
    if (!subRes.ok) throw new Error(await subRes.text());

    // 4. Their own settings row, so nothing is inherited from another
    //    tenant (870). Blank on purpose — they fill it in.
    await fetch(`${SUPABASE_URL}/rest/v1/org_settings`, {
      method: 'POST', headers: { ...svc, Prefer: 'return=minimal' },
      body: JSON.stringify([{
        id: orgId, org_id: orgId, business_name: String(business).trim().slice(0, 120),
        address: '', currency: 'ZAR', country: 'ZA',
      }]),
    }).catch(e => console.warn('signup: org_settings', e));

    // 5. Welcome them. AFTER everything that matters, and awaited only so
    //    the serverless function is not torn down mid-request — never in a
    //    way that can fail the signup. sendWelcomeEmail() does not throw,
    //    and does nothing at all until RESEND_API_KEY exists, so this ships
    //    inert and starts working when the key and DNS are in place.
    //
    //    The origin comes from the request rather than a constant: this
    //    same code answers on hosteasepro.com, the vercel.app address and
    //    every preview deployment, and a welcome email that links to the
    //    wrong one is worse than plain.
    const proto  = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
    const host   = (req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0];
    const origin = host ? `${proto}://${host}` : 'https://hosteasepro.com';
    const mailed = await sendWelcomeEmail({
      email, name, business: String(business).trim(), origin,
      portalKey, trialEndsAt: trialEnds,
    });
    if (mailed && mailed.error) console.warn('signup: welcome email', mailed.error);

    // 6. TELL THE OWNER. Until this existed the only way to find out an
    //    agency had signed up was to open HQ and count — on a seven-day
    //    trial, where losing the first three days loses most of it.
    //
    //    Claimed before it is sent (918), so a serverless retry cannot
    //    send twice, and the outcome is written back either way. That
    //    second write is the point: a failed email looks exactly like a
    //    quiet week otherwise, and the daily sweep in
    //    api/cron/trial-reminders.js re-sends anything with no successful
    //    row against it.
    //
    //    Wrapped so it can never reach the catch below. A customer's
    //    signup must not be rolled back because our notification failed.
    try {
      const claimRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/claim_platform_alert`, {
        method: 'POST', headers: svc,
        body: JSON.stringify({ p_kind: 'signup', p_ref: orgId }),
      });
      if (claimRes.ok && (await claimRes.json()) === true) {
        const alert = await sendSignupAlert({
          business: String(business).trim(), name: String(name).trim(),
          email, trialEndsAt: trialEnds, origin,
        });
        await fetch(`${SUPABASE_URL}/rest/v1/rpc/mark_platform_alert`, {
          method: 'POST', headers: svc,
          body: JSON.stringify({
            p_kind: 'signup', p_ref: orgId,
            p_ok: !!(alert && alert.ok),
            p_detail: (alert && (alert.error || (alert.skipped ? 'skipped' : 'sent'))) || 'sent',
          }),
        }).catch(() => {});
        if (alert && alert.error) console.warn('signup: owner alert', alert.error);
      }
    } catch (e) {
      console.warn('signup: owner alert failed', e && e.message);
    }

    return res.status(200).json({ success: true, trialEndsAt: trialEnds, trialDays: TRIAL_DAYS });
  } catch (e) {
    // Anything incomplete is removed rather than left behind. A
    // half-made org is an account that signs in and works badly, which
    // is worse than one that never got made.
    console.error('signup failed:', e && e.message);
    if (userId) {
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: svc }).catch(() => {});
      await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, { method: 'DELETE', headers: svc }).catch(() => {});
    }
    if (orgId) {
      await fetch(`${SUPABASE_URL}/rest/v1/org_subscriptions?org_id=eq.${orgId}`, { method: 'DELETE', headers: svc }).catch(() => {});
      await fetch(`${SUPABASE_URL}/rest/v1/org_settings?org_id=eq.${orgId}`, { method: 'DELETE', headers: svc }).catch(() => {});
      await fetch(`${SUPABASE_URL}/rest/v1/organizations?id=eq.${orgId}`, { method: 'DELETE', headers: svc }).catch(() => {});
    }
    return res.status(500).json({ error: 'Could not complete signup. Nothing was created — please try again.' });
  }
}
