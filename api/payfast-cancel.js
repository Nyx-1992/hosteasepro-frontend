// Cancels the caller's own subscription.
//
// This exists because a subscription you cannot cancel yourself is not a
// subscription, it is a trap — and under the Consumer Protection Act a
// South African customer is entitled to end a fixed-term agreement. If
// the only way out is emailing the founder, that is a support queue and
// a reputation problem waiting to happen.
//
// THE RULE THIS ENDPOINT FOLLOWS: never report a cancellation we did not
// actually achieve. If PayFast refuses or is unreachable, the local row
// is left alone and the caller is told plainly. Marking it cancelled
// here while PayFast keeps debiting them monthly would be the worst
// possible outcome — the screen says cancelled, the bank statement
// disagrees, and nobody notices until a customer is furious.
import { payfastConfig, cancelSubscription } from './_lib/payfast.js';

const SUPABASE_URL = process.env.SUPABASE_URL;

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

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Not signed in' });

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!userRes.ok) return res.status(401).json({ error: 'Not signed in' });
  const user = await userRes.json();

  const profRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=org_id,role`, { headers: svc });
  const profile = (await profRes.json())[0];
  if (!profile || !profile.org_id) return res.status(403).json({ error: 'No organisation' });
  if (profile.role !== 'owner' && profile.role !== 'admin') {
    return res.status(403).json({ error: 'Only an owner or admin can cancel billing' });
  }

  const subRes = await fetch(
    `${SUPABASE_URL}/rest/v1/org_subscriptions?org_id=eq.${profile.org_id}&select=payfast_token,status`,
    { headers: svc });
  const sub = (await subRes.json())[0];
  if (!sub) return res.status(404).json({ error: 'No subscription' });
  if (!sub.payfast_token) {
    return res.status(409).json({
      error: 'This subscription has no PayFast token, so it cannot be cancelled automatically. Get in touch and we will sort it out.',
    });
  }

  const cfg = payfastConfig();
  const out = await cancelSubscription(sub.payfast_token, cfg);

  await fetch(`${SUPABASE_URL}/rest/v1/subscription_events`, {
    method: 'POST',
    headers: { ...svc, Prefer: 'return=minimal' },
    body: JSON.stringify({
      org_id: profile.org_id, provider: 'payfast', event_type: 'cancel_requested',
      accepted: out.ok, reason: out.ok ? null : `PayFast ${out.status}: ${out.body}`.slice(0, 500),
      payload: { status: out.status },
    }),
  });

  if (!out.ok) {
    return res.status(502).json({
      error: 'PayFast would not cancel the subscription just now. Nothing has changed — please try again, or get in touch and we will cancel it manually.',
    });
  }

  // Only now. They stay on 'canceled' but keep access until the period
  // they have already paid for runs out — 880's write gate reads status,
  // so this is the point at which that starts to matter.
  await fetch(`${SUPABASE_URL}/rest/v1/org_subscriptions?org_id=eq.${profile.org_id}`, {
    method: 'PATCH',
    headers: { ...svc, Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'canceled' }),
  });

  return res.status(200).json({ ok: true });
}
