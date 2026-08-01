// Starts a PayFast subscription for the caller's own organisation.
//
// Returns a signed field set and the URL to POST it to, rather than
// redirecting. The browser builds a form from that and submits it, which
// is how PayFast expects checkout to begin.
//
// WHY THE FIELDS ARE BUILT HERE AND NOT IN THE PAGE. The signature has
// to be computed with the passphrase, and the passphrase is the only
// thing stopping someone who knows the merchant id from generating a
// valid-looking payment form. It never goes near a browser. Building the
// fields server-side also means the AMOUNT is decided here: a price
// posted from the client is a price the client can edit.
import { payfastConfig, signature, PLANS } from './_lib/payfast.js';

const SUPABASE_URL = process.env.SUPABASE_URL;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_ROLE_KEY || !SUPABASE_URL) {
    return res.status(500).json({ error: 'Server not configured' });
  }

  const cfg = payfastConfig();
  if (!cfg.merchantId || !cfg.merchantKey) {
    return res.status(503).json({ error: 'Billing is not configured yet' });
  }

  // Identify the caller from their own access token. The org is read
  // from their profile, never from the request body — otherwise anyone
  // could start a subscription against somebody else's organisation, or
  // more to the point, mark it paid.
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Not signed in' });

  const svc = {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!userRes.ok) return res.status(401).json({ error: 'Not signed in' });
  const user = await userRes.json();

  const profRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=org_id,role,full_name,email`,
    { headers: svc });
  const profile = (await profRes.json())[0];
  if (!profile || !profile.org_id) return res.status(403).json({ error: 'No organisation' });
  // Paying is an owner's decision, not a host's.
  if (profile.role !== 'owner' && profile.role !== 'admin') {
    return res.status(403).json({ error: 'Only an owner or admin can set up billing' });
  }

  const plan = String((req.body && req.body.plan) || 'starter').toLowerCase();
  if (!PLANS[plan]) return res.status(400).json({ error: 'Unknown plan' });
  const { label, cents } = PLANS[plan];

  const orgRes = await fetch(
    `${SUPABASE_URL}/rest/v1/organizations?id=eq.${profile.org_id}&select=name`, { headers: svc });
  const orgName = ((await orgRes.json())[0] || {}).name || 'Your agency';

  // Ours, and unique. Echoed back on every ITN, which is how a payment
  // is matched to an org — so it carries the org id rather than needing
  // a lookup table.
  const mPaymentId = `hep-${profile.org_id}-${Date.now()}`;
  const origin = process.env.PUBLIC_BASE_URL
    || (req.headers.origin || `https://${req.headers.host}`);
  const amount = (cents / 100).toFixed(2);

  // Order matters — the signature is computed over these in exactly this
  // sequence, and PayFast recomputes it the same way.
  const fields = {
    merchant_id:  cfg.merchantId,
    merchant_key: cfg.merchantKey,
    return_url:   `${origin}/?billing=success`,
    cancel_url:   `${origin}/?billing=cancelled`,
    notify_url:   `${origin}/api/payfast-itn`,

    name_first:    (profile.full_name || '').split(' ')[0] || '',
    email_address: profile.email || user.email || '',

    m_payment_id: mPaymentId,
    amount,
    item_name:        `HostEase Pro — ${label}`,
    item_description: `Monthly subscription for ${orgName}`,

    // The org id travels with the payment so the ITN never has to guess.
    custom_str1: profile.org_id,
    custom_str2: plan,

    // 1 = subscription. frequency 3 = monthly. cycles 0 = until
    // cancelled, which is what a SaaS subscription means.
    subscription_type: '1',
    billing_date:      new Date().toISOString().slice(0, 10),
    recurring_amount:  amount,
    frequency:         '3',
    cycles:            '0',
  };
  fields.signature = signature(fields, cfg.passphrase);

  // Record the intent before sending them off. If the ITN arrives before
  // this write lands we would have a payment for an org we cannot match.
  await fetch(`${SUPABASE_URL}/rest/v1/org_subscriptions?org_id=eq.${profile.org_id}`, {
    method: 'PATCH',
    headers: { ...svc, Prefer: 'return=minimal' },
    body: JSON.stringify({ plan, amount_cents: cents, payfast_payment_id: mPaymentId }),
  });

  return res.status(200).json({ process_url: cfg.processUrl, fields, sandbox: !cfg.live });
}
