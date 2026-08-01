-- 896_platform_org.sql
-- Runs on BOTH databases.
--
-- "No one should see the roadmap tab but me."
--
-- 891 locked roadmap_state and 892 moved the notes into an owner-only
-- table, so another agency's roadmap is empty and unreadable. But the TAB
-- was gated on roles:['owner'] alone — and every agency has an owner. So
-- every customer's owner saw a sidebar item called Roadmap, opened it,
-- and found an empty screen. Nothing leaked; it is simply not their tab,
-- and an empty tab in someone else's product is still a thing they can
-- see and ask about.
--
-- The distinction the app was missing is between "an owner" and "the
-- owner of the organisation that owns the platform". This records the
-- second one.
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS platform_org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

-- S&N for now, because that is where the owner's login lives. HEP is
-- being registered as its own company and will get its own organisation;
-- when it does, this is a one-row UPDATE rather than a code change. That
-- is the whole reason it is a column and not another hardcoded constant
-- alongside SN_OWNER_ORG_ID.
UPDATE public.platform_settings
   SET platform_org_id = '5966bc67-5c2f-45ae-8519-9b7eaeee09f4'
 WHERE platform_org_id IS NULL;

COMMENT ON COLUMN public.platform_settings.platform_org_id IS
  'The organisation that owns HostEase Pro itself. Its owner sees platform-only screens (the Roadmap) that no customer should. Update this row when HEP moves to its own organisation.';

-- ══ WHO MAY CHANGE THE PLATFORM SWITCHES ══════════════════════════
--
-- Read stays open — the app has to know whether to offer a Pay button.
-- Writing is the platform owner alone: billing_live decides whether
-- EVERY org gets locked out at the end of its trial, so an ordinary
-- customer being able to flip it would let them turn off their own
-- billing, and worse, everyone else's.
DROP POLICY IF EXISTS platform_settings_owner_write ON public.platform_settings;
CREATE POLICY platform_settings_owner_write ON public.platform_settings FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    AND EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.id = auth.uid() AND p.role = 'owner'
                   AND p.org_id = platform_settings.platform_org_id)
  )
  WITH CHECK (
    auth.role() = 'authenticated'
    AND EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.id = auth.uid() AND p.role = 'owner'
                   AND p.org_id = platform_settings.platform_org_id)
  );
GRANT UPDATE ON public.platform_settings TO authenticated;

-- End 896_platform_org.
