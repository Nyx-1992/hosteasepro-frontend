-- 823_profiles_client_role.sql
-- Runs on BOTH databases.
--
-- profiles.role allowed only owner/admin/host — all INTERNAL staff roles,
-- every one of which is_org_member() treats as part of the business.
--
-- A client owner must hold NONE of them. Giving a customer 'host' so they
-- could log in would hand them the entire organisation through the
-- existing org-wide policies. 'client' is a role no existing policy
-- grants anything to, so a client starts with nothing and receives access
-- only through the explicit per-property policies in 820.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['owner','admin','host','client']));
