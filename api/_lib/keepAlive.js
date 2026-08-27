// Stop the staging database being paused for inactivity.
//
// ══ WHY THIS IS A SHARED HELPER AND NOT A LINE IN ONE CRON ═══════
//
// Supabase pauses a free project after 7 days idle, and past 90 days it
// cannot be restored at all. The first attempt at this put a ping inside
// api/cron/trial-reminders.js, which Vercel is configured to run daily at
// 07:00. The project paused anyway, and the owner asked the obvious
// question: "Didn't we fix this?"
//
// THE PING NEVER RAN. Checked against production rather than assumed:
// Booking.com's feed publishes a rolling block whose dates shift by one
// day every day, so any daily sync leaves an updated_at mark. Across
// thirty days of bookings there is not a single mark at hour 04 or hour
// 07 UTC — the two times vercel.json schedules. Every mark that does
// exist sits at an irregular hour (12:32, 21:45, 23:45, 15:00),
// consistent with the owner's own cron-job.org schedule and with somebody
// having HEP open.
//
// So Vercel's cron is not firing, and hanging anything off it is building
// on something unverified. What demonstrably DOES run is the external
// cron-job.org job that calls /api/cron/ical-sync with CRON_SECRET.
//
// Hence a helper, called from both endpoints: the ping then happens on
// whichever schedule is actually alive, and starts working the day the
// Vercel one is fixed without needing to be moved again.
//
// ══ WHAT IT CANNOT DO ════════════════════════════════════════════
//
// It cannot revive a project that has ALREADY paused — that needs a human
// pressing Restore in the dashboard, within 90 days. This only stops one
// getting there.
//
// ══ WHY THE VALUES SIT IN CODE ═══════════════════════════════════
//
// "A default that is one tenant's real data is never a safe default" is a
// rule this codebase has had to relearn repeatedly, so it is worth saying
// why this is not that. HostEase Pro's own staging project is
// infrastructure, like the repo URL, not any agency's data. The key is the
// public anon key that RLS guards, and public_holidays is a global table
// of calendar dates. Both are overridable by environment variable.

const DEFAULT_URL =
  'https://rwsfbgtvqbkunbfvviiz.supabase.co/rest/v1/public_holidays?select=country_code&limit=1';

// The legacy anon JWT rather than the newer sb_publishable_ key: both are
// public by design, but this is the form the rest of this codebase already
// proves against PostgREST, and the sandbox cannot reach supabase.co to
// test the other. An untested keep-alive that fails silently is precisely
// what this exists to prevent.
const DEFAULT_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3c2ZiZ3R2cWJrdW5iZnZ2aWl6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxODcxNzUsImV4cCI6MjA5OTc2MzE3NX0.f4RhNOm_Hz05dVgXr8y1gouq6eQ6AQJ6Ge72AiDHz9c';

/**
 * Read one row from the staging database, purely so it counts as activity.
 *
 * Never throws: a keep-alive that can take down the sync it rides on is
 * worse than no keep-alive. Returns a short string for the caller to put
 * in its JSON response, because one that has been quietly failing for six
 * weeks is only discovered once the project has gone.
 *
 * @returns {Promise<string>} 'ok', 'http 404', 'failed: …', or 'disabled'
 */
export async function keepStagingAwake() {
  const url = process.env.STAGING_KEEPALIVE_URL || DEFAULT_URL;
  const key = process.env.STAGING_KEEPALIVE_KEY || DEFAULT_KEY;

  // An explicit off switch, for anyone running their own copy who has no
  // staging project to keep warm.
  if (url === 'off' || !url) return 'disabled';

  try {
    const res = await fetch(url, {
      headers: { apikey: key, Authorization: 'Bearer ' + key },
      signal: AbortSignal.timeout(10000),
    });
    return res.ok ? 'ok' : ('http ' + res.status);
  } catch (e) {
    return 'failed: ' + String((e && e.message) || e).slice(0, 120);
  }
}
