// Prove the signup alert actually reaches you, without inventing a customer.
//
// ══ WHY ══════════════════════════════════════════════════════════
//
// The signup alert is the one notification whose failure is invisible:
// a broken mailer and a quiet week look identical from the inbox. The
// welcome email and the trial reminders do not have this problem — a
// customer notices those going missing, eventually.
//
// So there has to be a way to ask "is this channel working?" that does not
// involve signing up a fake agency on production and then deleting the org
// afterwards, which is a destructive operation performed on a live database
// for the sake of a test. This is that way.
//
// ══ WHO MAY PRESS IT ═════════════════════════════════════════════
//
// Only the platform owner, and the check is done by the DATABASE rather
// than here. is_platform_owner() reads auth.uid(), so it is called with the
// CALLER'S OWN TOKEN — not the service key, which would evaluate auth.uid()
// as NULL and either fail open or fail confusingly.
//
// It sends to OWNER_ALERT_EMAIL and nowhere else. There is no address in
// the request body, deliberately: an endpoint that emails an arbitrary
// address on request is an open relay with extra steps, and this one is
// reachable by anybody who can sign in.

import { sendSignupAlert, alertTo, alertsConfigured } from './_lib/ownerAlert.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const ANON = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !ANON) return res.status(500).json({ error: 'Server not configured' });

  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Not authorised' });

  // Asked of the database, as the caller. A browser can claim anything;
  // auth.uid() cannot be claimed.
  let isOwner = false;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/is_platform_owner`, {
      method: 'POST',
      headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    isOwner = r.ok && (await r.json()) === true;
  } catch (e) {
    return res.status(500).json({ error: 'Could not check who you are' });
  }
  if (!isOwner) return res.status(403).json({ error: 'Platform owner only' });

  if (!alertsConfigured()) {
    // Said plainly rather than reported as a send that worked. "Nothing
    // happened and I told you it would" beats a green tick and silence.
    return res.status(200).json({
      sent: false,
      configured: false,
      to: alertTo(),
      message: 'RESEND_API_KEY is not set on this deployment, so no email was sent. Nothing else is wrong.',
    });
  }

  const proto  = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const host   = (req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0];
  const origin = host ? `${proto}://${host}` : 'https://hosteasepro.com';

  // Obviously a test in the subject and the body, so a real signup is never
  // confused with a drill — and so a drill is never acted on as a customer.
  const out = await sendSignupAlert({
    business: 'TEST — this is a drill, no agency signed up',
    name: 'Test alert',
    email: alertTo(),
    trialEndsAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    origin,
  });

  if (out && out.ok) return res.status(200).json({ sent: true, configured: true, to: alertTo() });
  return res.status(200).json({
    sent: false, configured: true, to: alertTo(),
    message: (out && out.error) || 'The mailer refused it and did not say why.',
  });
}
