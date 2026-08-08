// The sync button for people who have no login.
//
// ══ WHY ══════════════════════════════════════════════════════════
//
// "Nina complained she couldn't see the latest booking in the domestic
// platform to assign a cleaner. And when she tried syncing the bookings as
// a new one came in from LekkeSlaap, it didn't load on her end."
//
// The cron fixed the background case — bookings now arrive without anybody
// having HEP open. This fixes the foreground one. Nina works in the staff
// portal, has no auth.users row, and the "Sync calendars" button in
// Settings needs an owner or admin. So when a booking lands between runs
// and she needs to assign a cleaner NOW, she has to phone somebody.
//
// ══ WHAT IT TRUSTS ═══════════════════════════════════════════════
//
// The same three facts the portal already runs on: the portal key from the
// URL, a first name, and a PIN. No new credential and no new surface — if
// you can get into the portal you can press this, and if you cannot then
// you can do neither.
//
// The org is whatever the PIN resolves to. It is NEVER read from the
// request: a caller cannot name an org, only prove they belong to one.
// That is what stops this being a way to make another agency's calendars
// get fetched.
//
// ══ WHAT IT WILL NOT DO ══════════════════════════════════════════
//
// INSERTS AND UPDATES ONLY, inherited from importAllFeeds — no cancelling,
// no releasing, no deactivating. Somebody pressing a button because a
// booking is missing must not be able to delete one.
//
// And it is rate-limited per agency, in the database, atomically. A sync
// fetches every calendar the agency has from three companies we depend on;
// a button that does that on demand is a way to hammer them, whether by a
// frustrated double-tap or on purpose.

import { importAllFeeds } from './_lib/icalImport.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !KEY) return res.status(500).json({ error: 'Server not configured' });

  const { portalKey, name, pin } = req.body || {};
  if (!portalKey || !name || !pin) return res.status(400).json({ error: 'Missing sign-in details' });

  // Check the PIN and claim the agency's slot in ONE statement (920), so
  // two people pressing at the same moment produce one sync rather than
  // two — which is also the right answer, since the second would find
  // nothing the first had not.
  let claim;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/staff_portal_sync_claim`, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_portal_key: portalKey, p_name: name, p_pin: pin }),
    });
    if (!r.ok) throw new Error(await r.text());
    claim = (await r.json())[0] || {};
  } catch (e) {
    return res.status(500).json({ error: 'Could not check your sign-in' });
  }

  // Wrong PIN, wrong name, or a portal key that is not theirs — one answer
  // for all three, because which of them failed is not the caller's to
  // learn.
  if (!claim.sync_org_id) return res.status(401).json({ error: 'Sign in again to sync' });

  if (!claim.allowed) {
    // 200, not 429: this is a normal thing to be told, not an error the
    // page should render as a failure. Somebody already synced a moment
    // ago and the answer is "you are up to date".
    return res.status(200).json({
      synced: false, cooling: true, waitSeconds: claim.wait_seconds || 0,
    });
  }

  let results;
  try {
    results = await importAllFeeds(KEY, { dry: false, orgId: claim.sync_org_id });
  } catch (e) {
    return res.status(500).json({ error: 'The sync could not finish. Try again in a minute.' });
  }

  const sum = (k) => results.reduce((n, r) => n + (r[k] || 0), 0);
  const problems = results.filter(r => r.errors && r.errors.length).length;

  // Counts only. A cleaner does not need — and should not be handed — a
  // list of every guest name the sync touched just to know it worked.
  return res.status(200).json({
    synced: true,
    feeds: results.length,
    created: sum('created'),
    updated: sum('updated'),
    problems,
  });
}
