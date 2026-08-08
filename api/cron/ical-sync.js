// Pull bookings in from the platforms, on a schedule, for every agency.
//
// WHY: until this existed, the only importer was client-side and ran while
// an admin had HEP open. Nina, who works in the staff portal, could not
// trigger one at all — so a LekkeSlaap booking sat outside the database
// until the owner happened to sign in an hour and a half later. See the
// long note in ../_lib/icalImport.js.
//
// INSERTS AND UPDATES ONLY. This never cancels, releases or deactivates a
// booking. The destructive "stale sweep" stays in the app, under a human,
// for now — porting it to something that runs unattended every fifteen
// minutes is how a missing-booking bug becomes a deleted-booking one.
//
// ── AUTH ──────────────────────────────────────────────────────────
// Same shape as the trial-reminder cron: CRON_SECRET when set, otherwise
// Vercel's own x-vercel-cron header, which Vercel strips from inbound
// requests and so cannot be forged. Nothing else gets in.
//
// ── SEEING WHAT IT WOULD DO ───────────────────────────────────────
//   /api/cron/ical-sync?dry=1          every agency, writes nothing
//   /api/cron/ical-sync?dry=1&org=<id> one agency
//
// The dry run does every fetch, parse and match for real and stops short
// of the write, so the counts it reports are the ones a live run would
// produce rather than an estimate of them.

import { importAllFeeds } from '../_lib/icalImport.js';

// Staff-portal sign-in, for people with no auth.users row.
//
// This lived in its own endpoint, api/staff-sync.js, until Vercel started
// refusing to build: the project went from 15 serverless functions to 16
// and every deployment failed, preview and production alike. Fifteen had
// deployed fine the day before, so the 16th was the straw.
//
// Folding it in here is not just a workaround. This endpoint already had
// three ways in — CRON_SECRET, Vercel's own header, and a signed-in owner
// or admin — and "who is allowed to ask for a sync" belongs in one place
// rather than spread across two files that must agree.
async function staffClaim(url, key, portalKey, name, pin) {
  try {
    const r = await fetch(`${url}/rest/v1/rpc/staff_portal_sync_claim`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_portal_key: portalKey, p_name: name, p_pin: pin }),
    });
    if (!r.ok) return null;
    return (await r.json())[0] || null;
  } catch (e) { return null; }
}

// Turns a Supabase access token into "which org, what role" — asking
// Supabase who the token belongs to rather than trusting anything the
// request says about itself.
async function whoIs(token, key) {
  try {
    const u = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: key, Authorization: `Bearer ${token}` },
    });
    if (!u.ok) return null;
    const user = await u.json();
    if (!user || !user.id) return null;
    const p = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=org_id,role`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!p.ok) return null;
    const rows = await p.json();
    return rows && rows[0] ? rows[0] : null;
  } catch (e) { return null; }
}

export default async function handler(req, res) {
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!KEY || !process.env.SUPABASE_URL) {
    return res.status(500).json({ error: 'Server not configured' });
  }

  const secret = process.env.CRON_SECRET || '';
  const auth = req.headers.authorization || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';

  let orgId = (req.query && req.query.org) || null;
  let who = 'cron';

  // THREE WAYS IN, and the third is the one a person uses.
  //
  // Scheduled runs come with CRON_SECRET, or with Vercel's x-vercel-cron
  // header which Vercel strips from inbound requests and so cannot be
  // forged. Neither is available to somebody sitting in the app pressing a
  // button — and without a third path the only way to see what the sync
  // does is to have the secret, which the owner should not be pasting into
  // a browser bar.
  //
  // So: a signed-in owner or admin may run it, FORCED to their own org
  // regardless of what ?org= says. That is what makes it safe to expose.
  if (secret && bearer === secret) {
    /* scheduled run */
  } else if (!secret && req.headers['x-vercel-cron']) {
    /* scheduled run, secret not configured */
  } else if (req.method === 'POST' && req.body && req.body.portalKey) {
    // A cleaner or coordinator pressing "Sync bookings" in the staff
    // portal. The org comes from what the PIN resolves to and is NEVER
    // read from the request — a caller cannot name an agency, only prove
    // they belong to one, which is what stops this being a way to make a
    // stranger's calendars get fetched.
    //
    // Rate limited per agency inside staff_portal_sync_claim (920), so a
    // frustrated double-tap cannot turn into six fetches of three
    // platforms we depend on.
    const { portalKey, name, pin } = req.body;
    if (!portalKey || !name || !pin) return res.status(400).json({ error: 'Missing sign-in details' });
    const claim = await staffClaim(process.env.SUPABASE_URL, KEY, portalKey, name, pin);
    // Wrong PIN, wrong name, or a portal key that is not theirs — one
    // answer for all three.
    if (!claim || !claim.sync_org_id) return res.status(401).json({ error: 'Sign in again to sync' });
    if (!claim.allowed) {
      // 200, not 429. Being told somebody already synced a moment ago is a
      // normal thing to hear, not a failure the page should render as one.
      return res.status(200).json({ synced: false, cooling: true, waitSeconds: claim.wait_seconds || 0 });
    }
    orgId = claim.sync_org_id;
    who = 'staff';
  } else if (bearer) {
    const me = await whoIs(bearer, KEY);
    if (!me) return res.status(401).json({ error: 'Not authorised' });
    if (!['owner', 'admin'].includes(me.role)) {
      return res.status(403).json({ error: 'Owners and admins only' });
    }
    orgId = me.org_id;          // never their choice
    who = me.role;
  } else {
    return res.status(401).json({ error: 'Not authorised' });
  }

  const dry = String((req.query && req.query.dry) || '') === '1';

  const started = Date.now();
  let results;
  try {
    results = await importAllFeeds(KEY, { dry, orgId });
  } catch (e) {
    return res.status(500).json({ error: 'Sync failed', detail: String(e).slice(0, 400) });
  }

  const sum = (k) => results.reduce((n, r) => n + r[k], 0);
  const failed = results.filter(r => r.errors.length);

  // Counts only for staff. A cleaner needs to know it worked, not which
  // feeds exist or which of them are unhappy.
  if (who === 'staff') {
    return res.status(200).json({
      synced: true,
      feeds: results.length,
      created: sum('created'),
      updated: sum('updated'),
      problems: failed.length,
    });
  }

  return res.status(200).json({
    dry,
    ranAs: who,
    feeds: results.length,
    events: sum('events'),
    created: sum('created'),
    updated: sum('updated'),
    unchanged: sum('skipped'),
    seconds: Math.round((Date.now() - started) / 100) / 10,
    // Only the feeds with something to say. A green run returns a short
    // body rather than a wall of zeroes nobody reads.
    problems: failed.map(r => ({ feed: r.feed, errors: r.errors.slice(0, 5) })),
    changed: results.filter(r => r.created || r.updated)
                    .map(r => ({ feed: r.feed, created: r.created, updated: r.updated })),
  });
}

// ── ON THE SCHEDULE IN vercel.json ────────────────────────────────
//
// It says once a day. It wants to say every fifteen minutes, and the
// reason it does not is a plan limit rather than a design decision:
// Vercel's Hobby tier allows daily cron only, and an invalid schedule does
// not warn — IT FAILS THE WHOLE DEPLOYMENT. Setting */15 here stopped the
// project building at all, which is why two commits sat undeployed for a
// day.
//
// Once a day is not enough for what this fixes. A booking that arrives at
// 09:00 needs a cleaner assigned that morning, not tomorrow — which was
// the original complaint.
//
// TWO WAYS TO GET THE FIFTEEN MINUTES BACK, either is fine:
//
//   1. Vercel Pro. Change the schedule above to */15 * * * * and redeploy.
//
//   2. Any external scheduler — cron-job.org and similar are free — set to
//      call this endpoint every 15 minutes with the CRON_SECRET as a
//      bearer token. Costs nothing and needs no plan change. The endpoint
//      is identical either way; it does not care who woke it.
//
// Until then, the daily run plus the "Sync calendars" button in Settings
// covers it: nobody has to wait a day, they just have to press something.
