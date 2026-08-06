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

export default async function handler(req, res) {
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!KEY || !process.env.SUPABASE_URL) {
    return res.status(500).json({ error: 'Server not configured' });
  }

  const secret = process.env.CRON_SECRET || '';
  const auth = req.headers.authorization || '';
  if (secret) {
    if (auth !== `Bearer ${secret}`) return res.status(401).json({ error: 'Not authorised' });
  } else if (!req.headers['x-vercel-cron']) {
    return res.status(401).json({ error: 'Not authorised' });
  }

  const dry = String((req.query && req.query.dry) || '') === '1';
  const orgId = (req.query && req.query.org) || null;

  const started = Date.now();
  let results;
  try {
    results = await importAllFeeds(KEY, { dry, orgId });
  } catch (e) {
    return res.status(500).json({ error: 'Sync failed', detail: String(e).slice(0, 400) });
  }

  const sum = (k) => results.reduce((n, r) => n + r[k], 0);
  const failed = results.filter(r => r.errors.length);

  return res.status(200).json({
    dry,
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
