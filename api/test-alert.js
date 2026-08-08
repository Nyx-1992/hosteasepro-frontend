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
// Only the platform owner: an owner whose profile belongs to the org named
// by platform_settings.platform_org_id. That is the same rule as
// is_platform_owner() in 904, evaluated here rather than by calling it.
//
// THE FIRST VERSION CALLED THE RPC with the caller's own token, which is
// the more elegant shape — the database decides, and auth.uid() cannot be
// faked. It needed an anon key to send as the apikey header, and there is
// no anon key in the server environment: SUPABASE_ANON_KEY appeared exactly
// once in this whole api/ directory, in that file, because I assumed it
// existed. Every other endpoint uses SUPABASE_URL plus
// SUPABASE_SERVICE_ROLE_KEY, so the button answered "Server not
// configured" for a reason that had nothing to do with the mailer.
//
// This version asks Supabase who the token belongs to, then reads the two
// rows that decide the answer with the service key — the same shape as
// whoIs() in cron/ical-sync.js. The token is still the only thing trusted:
// nothing about the caller is taken from the request body or headers.
//
// It sends to OWNER_ALERT_EMAIL and nowhere else. There is no address in
// the request, deliberately: an endpoint that emails an arbitrary address
// on request is an open relay with extra steps, and this one is reachable
// by anybody who can sign in.

import { sendSignupAlert, alertTo, alertsConfigured } from './_lib/ownerAlert.js';

async function isPlatformOwner(token, url, key) {
  const svc = { apikey: key, Authorization: `Bearer ${key}` };
  try {
    // Who does this token belong to? Asked of Supabase, not of the request.
    const u = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: key, Authorization: `Bearer ${token}` },
    });
    if (!u.ok) return false;
    const user = await u.json();
    if (!user || !user.id) return false;

    const [pRes, sRes] = await Promise.all([
      fetch(`${url}/rest/v1/profiles?id=eq.${user.id}&select=org_id,role`, { headers: svc }),
      fetch(`${url}/rest/v1/platform_settings?select=platform_org_id&limit=1`, { headers: svc }),
    ]);
    if (!pRes.ok || !sRes.ok) return false;
    const me = (await pRes.json())[0];
    const settings = (await sRes.json())[0];
    if (!me || !settings || !settings.platform_org_id) return false;

    return me.role === 'owner' && me.org_id === settings.platform_org_id;
  } catch (e) {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !KEY) return res.status(500).json({ error: 'Server not configured' });

  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Not authorised' });

  if (!(await isPlatformOwner(token, SUPABASE_URL, KEY))) {
    return res.status(403).json({ error: 'Platform owner only' });
  }

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
  // "TEST — this is a drill" in the SUBJECT reads like spam to a filter,
  // and the subject is built from this field. The drill marking belongs in
  // the body, where a person reads it and a filter does not weigh it.
  const out = await sendSignupAlert({
    business: 'Alert test (no agency signed up)',
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
