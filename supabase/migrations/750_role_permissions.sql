-- 750_role_permissions.sql
-- Runs on BOTH databases.
--
-- Per-role permission toggles, so the owner can decide who may do what
-- instead of everything being hardcoded to "admin or nothing". The
-- owner's framing: a quick grid of toggles per role, like Confluence,
-- with website editing as the first real case — a host might be trusted
-- to edit website copy without being made a full admin.
--
-- IMPORTANT — WHICH TABLE HOLDS ROLES. The repo's 070_is_org_admin_fix
-- reads public.user_profiles (p.user_id = auth.uid()), but the LIVE
-- function in both databases reads public.profiles (p.id = auth.uid()),
-- and user_profiles is empty while profiles holds the real users. The
-- live definition is the one that works, so has_permission matches it.
-- The repo/database drift on is_org_admin is real and tracked separately
-- on the roadmap; this migration deliberately does not try to fix it,
-- because changing is_org_admin would touch every admin-only policy in
-- the system and deserves its own change.
--
-- SAFETY RULE: 'owner' always passes, regardless of what the toggles
-- say. Without that, an owner could switch off their own access and lock
-- themselves out of the app with no way back in — a permission grid that
-- can brick the account is worse than no grid at all.
--
-- Default is DENY. A permission absent from the table is not granted, so
-- adding a new permission key later cannot silently hand it to everyone.
-- Admins keep broad access via is_org_admin in the existing policies;
-- this system grants ADDITIONAL access to non-admin roles rather than
-- taking any away.

CREATE TABLE IF NOT EXISTS public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role text NOT NULL,
  permission text NOT NULL,
  allowed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, role, permission)
);

CREATE INDEX IF NOT EXISTS role_permissions_lookup_idx ON public.role_permissions (org_id, role, permission);

CREATE OR REPLACE FUNCTION public.role_permissions_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS role_permissions_updated_at ON public.role_permissions;
CREATE TRIGGER role_permissions_updated_at
  BEFORE UPDATE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.role_permissions_updated_at();

-- Does the CURRENT user hold `perm` in `org`?
-- SECURITY DEFINER so it can read profiles and role_permissions
-- regardless of the caller's own RLS, exactly like is_org_admin.
CREATE OR REPLACE FUNCTION public.has_permission(org uuid, perm text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.org_id = org
      AND (
        -- Owners are never lockable-out of their own organisation.
        p.role = 'owner'
        OR EXISTS (
          SELECT 1 FROM public.role_permissions rp
          WHERE rp.org_id = org
            AND rp.role = p.role
            AND rp.permission = perm
            AND rp.allowed
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.has_permission(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.has_permission(uuid, text) IS
  'True when the current user holds `perm` in `org`. Owners always pass. Default is deny: an unlisted permission is not granted.';

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated in the org may READ the grid — the app needs it
-- to decide which buttons to show, and knowing what your own role can do
-- is not sensitive. Only admins may CHANGE it.
DROP POLICY IF EXISTS role_permissions_select ON public.role_permissions;
CREATE POLICY role_permissions_select ON public.role_permissions FOR SELECT USING (
  auth.role() = 'authenticated' AND org_id = public.current_org_id()
);
DROP POLICY IF EXISTS role_permissions_insert ON public.role_permissions;
CREATE POLICY role_permissions_insert ON public.role_permissions FOR INSERT WITH CHECK (
  auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_admin(org_id)
);
DROP POLICY IF EXISTS role_permissions_update ON public.role_permissions;
CREATE POLICY role_permissions_update ON public.role_permissions FOR UPDATE USING (
  auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_admin(org_id)
) WITH CHECK (
  auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_admin(org_id)
);
DROP POLICY IF EXISTS role_permissions_delete ON public.role_permissions;
CREATE POLICY role_permissions_delete ON public.role_permissions FOR DELETE USING (
  auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_admin(org_id)
);

-- Website editing becomes permission-driven rather than admin-only. This
-- is the whole point of the feature: granting a host the ability to fix
-- website copy without also handing them banking details and statements.
-- Note the OR — admins keep access unconditionally, so toggling
-- everything off cannot strand the org.
DROP POLICY IF EXISTS site_content_insert ON public.site_content;
CREATE POLICY site_content_insert ON public.site_content FOR INSERT WITH CHECK (
  auth.role() = 'authenticated' AND org_id = public.current_org_id()
  AND (public.is_org_admin(org_id) OR public.has_permission(org_id, 'website.edit'))
);

DROP POLICY IF EXISTS site_content_update ON public.site_content;
CREATE POLICY site_content_update ON public.site_content FOR UPDATE USING (
  auth.role() = 'authenticated' AND org_id = public.current_org_id()
  AND (public.is_org_admin(org_id) OR public.has_permission(org_id, 'website.edit'))
) WITH CHECK (
  auth.role() = 'authenticated' AND org_id = public.current_org_id()
  AND (public.is_org_admin(org_id) OR public.has_permission(org_id, 'website.edit'))
);

-- Reading drafts follows editing: someone who may edit must be able to
-- see what they are editing.
DROP POLICY IF EXISTS site_content_admin_read ON public.site_content;
CREATE POLICY site_content_admin_read ON public.site_content FOR SELECT USING (
  auth.role() = 'authenticated' AND org_id = public.current_org_id()
  AND (public.is_org_admin(org_id) OR public.has_permission(org_id, 'website.edit'))
);

-- Seed the grid so the Permissions tab opens populated rather than
-- blank. Host starts able to EDIT website copy but not PUBLISH it, which
-- is the cautious default and demonstrates why the two are separate
-- permissions. Admin rows are recorded for visibility even though
-- is_org_admin already grants them.
INSERT INTO public.role_permissions (org_id, role, permission, allowed)
SELECT o.id, v.role, v.permission, v.allowed
FROM public.organizations o
CROSS JOIN (VALUES
  ('admin','website.edit',    true),
  ('admin','website.publish', true),
  ('admin','budget.view',     true),
  ('admin','budget.edit',     true),
  ('admin','statements.upload', true),
  ('host', 'website.edit',    true),
  ('host', 'website.publish', false),
  ('host', 'budget.view',     false),
  ('host', 'budget.edit',     false),
  ('host', 'statements.upload', false)
) AS v(role, permission, allowed)
ON CONFLICT (org_id, role, permission) DO NOTHING;

-- End 750_role_permissions.
