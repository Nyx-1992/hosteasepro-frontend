// Secure server-side endpoint — provisions a brand-new customer organization
// plus its first owner login (Auth user + profile row). Only ever runs on
// Vercel's server, never in the browser. The service role key used here is
// NOT the anon key — it must be set as a Vercel environment variable, never
// pasted into index_fixed.html.
//
// This is deliberately an INTERNAL tool for the HEP team (S&N), not public
// self-serve signup — Phase 2 of the roadmap is hand-recruiting 1-2 design
// partners, not open registration. Gated below to callers who are an
// 'owner' specifically within the S&N org, not just any org's owner —
// otherwise a future paying customer's own owner account could use this
// same endpoint to spin up arbitrary other organizations, which is not the
// intent.

// Environment-driven: Vercel env var SUPABASE_URL (Production = prod project,
// Preview = hep-staging). Same file on every branch.
const SUPABASE_URL = process.env.SUPABASE_URL;

// Same S&N owner-org UUID demo/index_fixed.html's SN_OWNER_ORG_ID uses —
// identical on both databases (org ids are fixed per-project, not
// per-environment-swapped like config.js's Supabase project itself is).
const SN_OWNER_ORG_ID = '5966bc67-5c2f-45ae-8519-9b7eaeee09f4';

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

  let newOrgId = null;
  let newUserId = null;

  try {
    // 1. Verify the caller is a real, currently logged-in user
    const callerRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${callerToken}` },
    });
    if (!callerRes.ok) return res.status(401).json({ error: 'Invalid session' });
    const caller = await callerRes.json();

    // 2. Check the caller is an owner within the S&N/HEP team org specifically
    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${caller.id}&select=role,org_id`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
    );
    const profileData = await profileRes.json();
    const callerProfile = Array.isArray(profileData) && profileData[0];
    if (!callerProfile || callerProfile.role !== 'owner' || callerProfile.org_id !== SN_OWNER_ORG_ID) {
      return res.status(403).json({ error: 'Only the HEP team can create new organizations' });
    }

    // 3. Validate input
    const { orgName, ownerName, ownerEmail, ownerPassword } = req.body || {};
    if (!orgName || !ownerName || !ownerEmail || !ownerPassword) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (ownerPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // 4. Create the organization
    const orgRes = await fetch(`${SUPABASE_URL}/rest/v1/organizations`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify([{ name: orgName }]),
    });
    const orgData = await orgRes.json();
    if (!orgRes.ok || !Array.isArray(orgData) || !orgData[0]) {
      const errText = typeof orgData === 'string' ? orgData : JSON.stringify(orgData);
      return res.status(400).json({ error: 'Could not create organization: ' + errText });
    }
    newOrgId = orgData[0].id;

    // 5. Create the Auth user
    const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: ownerEmail, password: ownerPassword, email_confirm: true }),
    });
    const newUser = await createRes.json();
    if (!createRes.ok) {
      await rollbackOrg(newOrgId);
      return res.status(400).json({ error: newUser.msg || newUser.error_description || 'Could not create owner login' });
    }
    newUserId = newUser.id;

    // 6. Create their profile row, as owner of the new org
    const initialsVal = ownerName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const profileInsertRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify([{ id: newUserId, org_id: newOrgId, name: ownerName, role: 'owner', initials: initialsVal }]),
    });

    if (!profileInsertRes.ok) {
      // Roll back — don't leave an orphaned org/login with no profile
      await rollbackUser(newUserId);
      await rollbackOrg(newOrgId);
      const errText = await profileInsertRes.text();
      return res.status(400).json({ error: 'Profile creation failed: ' + errText });
    }

    return res.status(200).json({ success: true, orgId: newOrgId, userId: newUserId });
  } catch (e) {
    // Best-effort cleanup on an unexpected failure mid-flow, so a crash
    // doesn't leave a half-provisioned org/user with no way to complete it.
    if (newUserId) await rollbackUser(newUserId);
    if (newOrgId) await rollbackOrg(newOrgId);
    return res.status(500).json({ error: 'Unexpected server error: ' + e.message });
  }

  async function rollbackOrg(orgId) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/organizations?id=eq.${orgId}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      });
    } catch (e) { /* best-effort */ }
  }
  async function rollbackUser(userId) {
    try {
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      });
    } catch (e) { /* best-effort */ }
  }
}
