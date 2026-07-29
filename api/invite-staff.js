// Secure server-side endpoint — invites a new staff login (Auth user +
// profile row) into the CALLER'S OWN org. Only ever runs on Vercel's
// server, never in the browser. The service role key used here is NOT
// the anon key — it must be set as a Vercel environment variable, never
// pasted into index_fixed.html.
//
// org_id is deliberately NEVER read from the request body — it's derived
// server-side from the caller's own profile row. api/create-user.js used
// to trust a client-supplied org_id (checked only that the caller was
// *an* owner, not that it was their own org) and that was a real
// cross-org privilege-escalation bug; deriving org_id server-side here
// makes the same mistake structurally impossible for this endpoint.
//
// Callers: owner or admin, inviting a role of 'admin' or 'host' only —
// never 'owner' (new orgs/owners are provisioned exclusively through
// api/create-org.js).

// Environment-driven: Vercel env var SUPABASE_URL (Production = prod project,
// Preview = hep-staging). Same file on every branch.
const SUPABASE_URL = process.env.SUPABASE_URL;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_ROLE_KEY || !SUPABASE_URL) {
    return res.status(500).json({ error: 'Server not configured — missing SUPABASE_URL or service role key' });
  }

  const authHeader = req.headers.authorization || '';
  const callerToken = authHeader.replace('Bearer ', '');
  if (!callerToken) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }

  try {
    // 1. Verify the caller is a real, currently logged-in user
    const callerRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${callerToken}` },
    });
    if (!callerRes.ok) return res.status(401).json({ error: 'Invalid session' });
    const caller = await callerRes.json();

    // 2. Check the caller is an owner or admin — org_id comes from THEIR
    // profile, never from the request body
    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${caller.id}&select=role,org_id`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
    );
    const profileData = await profileRes.json();
    const callerProfile = Array.isArray(profileData) && profileData[0];
    if (!callerProfile || !['owner', 'admin'].includes(callerProfile.role)) {
      return res.status(403).json({ error: 'Only an owner or admin can invite staff' });
    }
    const org_id = callerProfile.org_id;

    // 3. Validate input
    const { email, password, name, role, initials } = req.body || {};
    if (!email || !password || !name || !role) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!['admin', 'host'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role — invited staff can only be admin or host' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // 4. Create the Auth user
    const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    const newUser = await createRes.json();
    if (!createRes.ok) {
      return res.status(400).json({ error: newUser.msg || newUser.error_description || 'Could not create user' });
    }

    // 5. Create their profile row, in the caller's own org
    const initialsVal = initials || name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const profileInsertRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify([{ id: newUser.id, org_id, name, role, initials: initialsVal }]),
    });

    if (!profileInsertRes.ok) {
      // Roll back — don't leave an orphaned login with no profile
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${newUser.id}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      });
      const errText = await profileInsertRes.text();
      return res.status(400).json({ error: 'Profile creation failed: ' + errText });
    }

    return res.status(200).json({ success: true, userId: newUser.id });
  } catch (e) {
    return res.status(500).json({ error: 'Unexpected server error: ' + e.message });
  }
}
