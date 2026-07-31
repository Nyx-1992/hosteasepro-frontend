-- 821_property_users_client_role.sql
-- Runs on BOTH databases.
--
-- property_users.role predates client logins and allowed only
-- manager/cleaner/maintenance/viewer. 'client' is ADDED rather than
-- reusing 'viewer': viewer is an internal read-only STAFF role, while a
-- client is an external customer who must never be swept up by a future
-- policy meaning "viewer or above".
ALTER TABLE public.property_users DROP CONSTRAINT IF EXISTS property_users_role_check;
ALTER TABLE public.property_users ADD CONSTRAINT property_users_role_check
  CHECK (role = ANY (ARRAY['manager','cleaner','maintenance','viewer','client']));
