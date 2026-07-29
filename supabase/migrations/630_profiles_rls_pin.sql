-- 630_profiles_rls_pin.sql
-- Runs on BOTH databases.
--
-- Captures public.profiles' live RLS policy in a tracked migration file
-- for the first time — it predates this migrations folder and was never
-- written down anywhere in the repo. Verified live via pg_policies on
-- both hep-staging and production before writing this: both hold exactly
-- one policy, nothing more. Documentation only, no functional change.
--
-- Checked (2026-07-29, ahead of building the Staff tab) whether any
-- client code needs broader access than "read your own row" — a full
-- grep of demo/index_fixed.html shows the only query against this table
-- is db.from('profiles').select('*').eq('id', userId), i.e. a user
-- reading their own profile. Nothing needs org-wide visibility today:
-- the Staff tab (620_team_contacts_staff_fields.sql) reads team_contacts,
-- not profiles, and api/invite-staff.js writes new profiles rows with
-- the service-role key (bypasses RLS), same as api/create-user.js. So
-- this deliberately does NOT add a broader SELECT/UPDATE policy — revisit
-- if a future feature needs an admin to list/edit other members'
-- profiles client-side, at which point add an is_org_admin()-gated policy
-- matching the team_contacts_select/update pattern.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT USING (
  auth.uid() = id
);

-- End 630_profiles_rls_pin.
