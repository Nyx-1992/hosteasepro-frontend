// Secure server-side endpoint — invites a CLIENT PROPERTY OWNER login.
//
// Distinct from invite-staff.js because a client needs three things
// created atomically, not one:
//   1. an Auth user
//   2. a profile with role 'client'  (NOT owner/admin/host — those are
//      internal roles that is_org_member() treats as staff, so giving a
//      customer one would hand them the whole organisation)
//   3. a property_users grant for exactly one property, which is what
//      the per-property RLS in 820 keys off
//
// It also links property_stakeholders.user_id, so the commercial record
// of "who owns this property" and the login that sees it stay joined.
//
// org_id is derived from the CALLER'S own profile and never read from
// the request body — the same rule invite-staff.js follows after a real
// cross-org privilege-escalation bug in an earlier endpoint.
//
// The property is additionally verified to belong to the caller's org.
// Without that check an admin of org A could grant a client access to a
// property in org B simply by passing its id.

const SUPABASE_URL = process.env.SUPABASE_URL;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_ROLE_KEY || !SUPABASE_URL) {
    return res.status(500).json({ error: 'Server not configured — missing SUPABASE_URL or service role key' });
  }

  const svc = {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };

  const callerToken = (req.headers.authorization || '').replace('Bearer ', '');
  if (!callerToken) return res.status(401).json({ error: 'Missing authorization token' });

  try {
    // 1. Who is calling?
    const callerRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${callerToken}` },
    });
    if (!callerRes.ok) return res.status(401).json({ error: 'Invalid session' });
    const caller = await callerRes.json();

    // 2. Only an owner or admin may invite, and the org comes from THEIR
    //    profile row — never from the request.
    const profRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${caller.id}&select=role,org_id`,
      { headers: svc });
    const callerProfile = (await profRes.json())[0];
    if (!callerProfile || !['owner', 'admin'].includes(callerProfile.role)) {
      return res.status(403).json({ error: 'Only an owner or admin can invite a client' });
    }
    const org_id = callerProfile.org_id;

    // 3. Input
    const { email, password, name, property_id, locale } = req.body || {};
    if (!email || !password || !name || !property_id) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // 4. The property must belong to the caller's own org. Without this,
    //    passing another org's property id would grant access across
    //    tenants.
    const propRes = await fetch(
      `${SUPABASE_URL}/rest/v1/properties?id=eq.${property_id}&select=id,org_id,name`,
      { headers: svc });
    const property = (await propRes.json())[0];
    if (!property || property.org_id !== org_id) {
      return res.status(403).json({ error: 'That property does not belong to your organisation' });
    }

    // 5. Auth user
    const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST', headers: svc,
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    const newUser = await createRes.json();
    if (!createRes.ok) {
      return res.status(400).json({ error: newUser.msg || newUser.error_description || 'Could not create login' });
    }

    // Any failure past this point removes the Auth user again, so a
    // half-created client never lingers as a login that works but sees
    // nothing.
    const rollback = async (msg, detail) => {
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${newUser.id}`, {
        method: 'DELETE', headers: svc,
      });
      console.error('invite-client:', detail);
      return res.status(400).json({ error: msg });
    };

    // 6. Profile — role 'client' specifically.
    const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'CL';
    const profInsert = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
      method: 'POST', headers: { ...svc, Prefer: 'return=minimal' },
      body: JSON.stringify([{
        id: newUser.id, org_id, name, role: 'client', initials,
        locale: locale || 'en',
      }]),
    });
    if (!profInsert.ok) return rollback('Could not create the client profile.', await profInsert.text());

    // 7. The per-property grant that RLS actually reads.
    const grantInsert = await fetch(`${SUPABASE_URL}/rest/v1/property_users`, {
      method: 'POST', headers: { ...svc, Prefer: 'return=minimal' },
      body: JSON.stringify([{ property_id, user_id: newUser.id, role: 'client' }]),
    });
    if (!grantInsert.ok) {
      await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${newUser.id}`, { method: 'DELETE', headers: svc });
      return rollback('Could not grant access to the property.', await grantInsert.text());
    }

    // 8. Join the login to the commercial record. Best-effort: a missing
    //    stakeholder row is untidy, not broken, and must not undo a
    //    working invite.
    await fetch(
      `${SUPABASE_URL}/rest/v1/property_stakeholders?property_id=eq.${property_id}&party=eq.owner&email=eq.${encodeURIComponent(email)}`,
      { method: 'PATCH', headers: { ...svc, Prefer: 'return=minimal' },
        body: JSON.stringify({ user_id: newUser.id }) }
    ).catch(e => console.warn('invite-client: stakeholder link failed:', e));

    return res.status(200).json({ success: true, userId: newUser.id, property: property.name });
  } catch (e) {
    return res.status(500).json({ error: 'Unexpected server error: ' + e.message });
  }
}
