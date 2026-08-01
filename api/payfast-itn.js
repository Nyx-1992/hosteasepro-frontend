// PayFast's Instant Transaction Notification — the only thing that may
// mark a subscription paid.
//
// This endpoint is public and unauthenticated by necessity: PayFast's
// servers call it, and they have no session. So every one of PayFast's
// four checks is done, in order, and the payload is recorded either way:
//
//   1. the signature over the received fields matches
//   2. the request actually came from a PayFast host
//   3. the amount matches what we expect to be charging this org
//   4. PayFast themselves confirm they sent it
//
// Skipping any one of them turns "mark this org as paid" into an
// endpoint anyone on the internet can call. Check 3 is the one people
// leave out, and it is what stops a real R1 payment being replayed as a
// R750 subscription.
import { payfastConfig, itnSignatureMatches, isPayfastSource, confirmWithPayfast }
  from './_lib/payfast.js';

const SUPABASE_URL = process.env.SUPABASE_URL;

// PayFast wants a 200 quickly and retries otherwise. A rejected
// notification is still a 200: retrying will not make a forgery valid,
// and a retry storm hides the real signal.
function done(res) { return res.status(200).send('OK'); }

async function record(svc, row) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/subscription_events`, {
      method: 'POST',
      headers: { ...svc, Prefer: 'return=minimal' },
      body: JSON.stringify(row),
    });
  } catch (e) { console.error('ITN: could not record event', e); }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_ROLE_KEY || !SUPABASE_URL) return res.status(500).send('Not configured');
  const svc = {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };

  // Vercel parses form bodies; fall back to parsing it ourselves so key
  // order is preserved, which the signature depends on.
  let body = req.body;
  if (typeof body === 'string') body = Object.fromEntries(new URLSearchParams(body));
  if (!body || typeof body !== 'object') return done(res);

  const cfg = payfastConfig();
  const orgId  = body.custom_str1 || null;
  const plan   = body.custom_str2 || null;
  const cents  = Math.round(parseFloat(body.amount_gross || '0') * 100) || null;
  const base   = { org_id: orgId, provider: 'payfast', event_type: body.payment_status || null,
                   payment_id: body.m_payment_id || null, amount_cents: cents, payload: body };

  const reject = async (reason) => {
    console.warn('ITN rejected:', reason, body.m_payment_id || '');
    await record(svc, { ...base, accepted: false, reason });
    return done(res);
  };

  if (!itnSignatureMatches(body, cfg.passphrase)) return reject('signature mismatch');

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
          || (req.socket && req.socket.remoteAddress) || '';
  if (!(await isPayfastSource(ip))) return reject(`source not PayFast (${ip})`);

  if (!orgId) return reject('no org id on the notification');

  // What we believe this org should be paying. Comparing against the
  // stored amount rather than the plan table means a grandfathered price
  // still validates.
  const subRes = await fetch(
    `${SUPABASE_URL}/rest/v1/org_subscriptions?org_id=eq.${orgId}&select=amount_cents,plan,status`,
    { headers: svc });
  const sub = (await subRes.json())[0];
  if (!sub) return reject('no subscription row for that org');
  if (sub.amount_cents && cents && cents !== sub.amount_cents) {
    return reject(`amount ${cents} does not match expected ${sub.amount_cents}`);
  }

  if (!(await confirmWithPayfast(body, cfg.validateUrl))) return reject('PayFast did not confirm');

  // Past every check. Map their status onto ours.
  const status = body.payment_status === 'COMPLETE' ? 'active'
               : body.payment_status === 'CANCELLED' ? 'canceled'
               : body.payment_status === 'FAILED'    ? 'past_due'
               : null;
  if (!status) return reject(`unhandled payment_status ${body.payment_status}`);

  const patch = { status, plan: plan || sub.plan };
  if (status === 'active') {
    patch.last_payment_at = new Date().toISOString();
    // A month from now, so the write gate keeps letting them work even
    // if a later notification is delayed.
    const end = new Date(); end.setMonth(end.getMonth() + 1);
    patch.current_period_end = end.toISOString();
    patch.trial_ends_at = null;
    if (body.token) patch.payfast_token = body.token;
    if (cents) patch.amount_cents = cents;
  }

  const upd = await fetch(`${SUPABASE_URL}/rest/v1/org_subscriptions?org_id=eq.${orgId}`, {
    method: 'PATCH',
    headers: { ...svc, Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  });
  if (!upd.ok) return reject(`could not update subscription (${upd.status})`);

  await record(svc, { ...base, accepted: true, reason: null });
  return done(res);
}
