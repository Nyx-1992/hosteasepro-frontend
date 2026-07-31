-- 822_property_users_fk_profiles.sql
-- Runs on BOTH databases.
--
-- property_users.user_id referenced public.user_profiles, which is EMPTY
-- on both databases, while public.profiles holds the real users. The
-- table was therefore UNUSABLE — every insert failed the foreign key,
-- which is almost certainly why it has 0 rows and no code path uses it.
--
-- Same dead-legacy-table trap already fixed for is_org_admin (085) and
-- current_org_id (760). Repointed at profiles(id), which IS auth.uid().
ALTER TABLE public.property_users DROP CONSTRAINT IF EXISTS property_users_user_id_fkey;
ALTER TABLE public.property_users
  ADD CONSTRAINT property_users_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
