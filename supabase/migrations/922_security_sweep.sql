-- 922_security_sweep.sql
-- Runs on BOTH databases.
--
-- The security sweep Nicole asked for, done before the first agency that
-- isn't S&N. Every table in public was listed, every policy read, and then
-- — the part that matters — the findings were PROVEN by connecting as the
-- anon role and as a signed-in stranger and trying them. Reading a policy
-- tells you what you meant. Running as anon tells you what is true.
--
-- All 49 tables already had RLS switched on. That was never the problem.
-- The problem was policies that were switched on and still said yes.
--
-- ══ WHAT WAS PROVEN, NOT SUSPECTED ═══════════════════════════════
--
-- Connected as `authenticated` with a user id that has no profile row at
-- all — a stranger with any HEP login, or a brand new customer:
--
--     stranger reads S&N inspections ........ 1 row
--     stranger INSERTs into S&N inspections .. ALLOWED
--
-- Connected as `anon` — anybody who opens the staff portal URL, since the
-- anon key is in its page source:
--
--     anon calls generate_daily_service(any org) ... ALLOWED
--     anon calls platform_ensure_sub(any org) ...... ALLOWED
--
-- This migration closes those four, plus the latent ones below. It does
-- NOT close the staff portal's own anon access to bookings, domestics,
-- cleaner_availability, inventory_reports and property_inspections —
-- demo/domestic.html reads those tables directly with the anon key and
-- would stop working today. That is a real remaining exposure, it is
-- written up in the roadmap as p2-63, and it is deliberately not being
-- half-done inside a migration whose other changes need to ship now.
--
-- ══════════════════════════════════════════════════════════════════
-- 1. A STRANGER COULD READ AND WRITE S&N'S INSPECTIONS
-- ══════════════════════════════════════════════════════════════════
--
-- Two policies from before this was a multi-tenant product:
--
--     "org members can view inspections"   TO authenticated
--       USING (org_id = '5966bc67-…')
--     "org members can insert inspections" TO authenticated
--       WITH CHECK (org_id = '5966bc67-…')
--
-- The name says "org members". The rule says no such thing. There is no
-- membership test in either one — only a hardcoded org id — so the answer
-- for EVERY authenticated user of EVERY agency was yes. Proven above with
-- a user id belonging to nobody.
--
-- Nothing breaks by dropping them: property_inspections already has
-- property_inspections_select / _insert / _update, which do check
-- membership, and the staff portal comes in as anon on its own policies.
--
-- A DEFAULT THAT IS ONE TENANT'S REAL DATA IS NEVER A SAFE DEFAULT — and
-- a hardcoded tenant id in a policy is that default wearing a rule's
-- clothes.
DROP POLICY IF EXISTS "org members can view inspections"   ON public.property_inspections;
DROP POLICY IF EXISTS "org members can insert inspections" ON public.property_inspections;

-- ══════════════════════════════════════════════════════════════════
-- 2. anon COULD SCHEDULE CLEANING WORK IN ANY AGENCY
-- ══════════════════════════════════════════════════════════════════
--
-- generate_daily_service is granted to anon and guarded like this:
--
--     IF auth.uid() IS NOT NULL
--        AND ...role... <> 'service_role'
--        AND p_org IS DISTINCT FROM public.current_org_id() THEN
--       RAISE EXCEPTION 'Not permitted.';
--
-- Read the first line again. The check only runs when somebody is signed
-- in. For anon, auth.uid() is NULL, the AND chain is false, and the guard
-- does nothing whatsoever. It was written to stop a signed-in user
-- pointing at another agency and it accidentally exempted the one caller
-- with no business calling it at all.
--
-- This is the second time in this codebase a guard has been correct and
-- simply not reached — the HQ tab guard was too. Worth remembering: a
-- condition that starts "IF the user is X" answers "nothing to check"
-- when there is no user, and "nothing to check" is not "no".
--
-- Inverted: the caller must positively prove they belong, and the only
-- callers who can are service_role and a member of p_org. Everyone else
-- is refused, including — especially — nobody at all.
CREATE OR REPLACE FUNCTION public.generate_daily_service(
  p_org uuid, p_from date, p_to date, p_cleaner text DEFAULT ''::text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE n int;
BEGIN
  -- Prove membership, do not assume it. service_role is the cron and the
  -- server routes, which hold the secret key and are already trusted.
  IF COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role'
     AND NOT (auth.uid() IS NOT NULL AND public.is_org_member(p_org)) THEN
    RAISE EXCEPTION 'Not permitted.' USING ERRCODE = '42501';
  END IF;
  IF p_to < p_from THEN
    RAISE EXCEPTION 'End date is before the start date.' USING ERRCODE = '22023';
  END IF;
  IF p_to - p_from > 92 THEN
    RAISE EXCEPTION 'Generate at most a quarter at a time.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.domestics (org_id, property_id, date, type, status, cleaner)
  SELECT p_org, pr.short_key, d::date, 'daily_service', 'scheduled', COALESCE(p_cleaner, '')
    FROM public.properties pr
    JOIN public.bookings b
      ON b.property_id = pr.id
     AND b.is_active
     AND COALESCE(b.status, '') <> 'cancelled'
     AND COALESCE(b.is_owner_block, false) = false
    CROSS JOIN LATERAL generate_series(
      GREATEST(b.check_in_date::date + 1, p_from),
      LEAST(b.check_out_date::date - 1, p_to),
      interval '1 day') d
   WHERE pr.org_id = p_org
     AND pr.daily_service
     AND pr.short_key IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.domestics x
        WHERE x.org_id = p_org AND x.property_id = pr.short_key AND x.date = d::date
          AND COALESCE(x.status, '') <> 'cancelled'
     );

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $function$;

REVOKE ALL ON FUNCTION public.generate_daily_service(uuid, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_daily_service(uuid, date, date, text) TO authenticated, service_role;

-- ══════════════════════════════════════════════════════════════════
-- 3. anon COULD CREATE SUBSCRIPTION ROWS FOR ANY AGENCY
-- ══════════════════════════════════════════════════════════════════
--
-- platform_ensure_sub is an internal helper the other platform_* functions
-- call before they update a subscription. Those all call platform_guard()
-- first, which correctly demands is_platform_owner(). This one does not,
-- because it was never meant to be called from outside — but it was
-- granted to anon along with everything else, and anon calling it was
-- ALLOWED in the probe.
--
-- Harm is small (it inserts a default row and does nothing on conflict).
-- Revoking is still right: it is reachable, unauthenticated, and writes.
-- Its real callers are SECURITY DEFINER functions, which execute as the
-- owner and therefore keep working with no grant of their own.
REVOKE ALL ON FUNCTION public.platform_ensure_sub(uuid) FROM PUBLIC, anon, authenticated;

-- ══════════════════════════════════════════════════════════════════
-- 4. A VIEW THAT IGNORES RLS
-- ══════════════════════════════════════════════════════════════════
--
-- spend_owed is the only view in the schema without security_invoker. A
-- view without it runs as ITS OWNER, so every RLS policy underneath is
-- skipped — and anon has SELECT on it. It reads finance_transactions
-- joined to profiles: who is owed money, by name, in every agency.
--
-- It returned 0 rows in the probe, which is not reassurance. It returned
-- 0 rows because finance_transactions is empty on production today. The
-- first expense anybody records is the moment it starts leaking, and
-- nothing would announce that.
--
-- The other eight views already have security_invoker set; this one was
-- created before that became the habit.
--
-- ONE THING TO KNOW IF IT IS EVER WIRED UP. Nothing in the codebase reads
-- spend_owed today — that is why flipping this is free. When something
-- does, it will join profiles, and profiles has exactly one policy
-- (profiles_select_own, `auth.uid() = id`). So an admin will see only
-- their OWN unreimbursed expenses, not the team's, which is the opposite
-- of what a "who are we owing" screen wants. The fix at that point is a
-- SECURITY DEFINER function scoped to is_org_admin(org_id) — not turning
-- this back off.
ALTER VIEW public.spend_owed SET (security_invoker = true);

-- ══════════════════════════════════════════════════════════════════
-- 5. HOSTEASE PRO'S OWN BANK DETAILS WERE WORLD-READABLE
-- ══════════════════════════════════════════════════════════════════
--
--     platform_settings_read  FOR SELECT
--       USING (auth.role() = ANY (ARRAY['authenticated', 'anon']))
--
-- No scoping of any kind. The table holds bank_name, bank_account,
-- bank_branch, reg_number, vat_number and company_email — HostEase Pro's
-- own banking details, not a customer's. Those columns are NULL today, so
-- the probe read nothing worth having; they are NULL because the company
-- details form has not been filled in yet, and filling it in is what turns
-- this from a finding into an incident.
--
-- (Customer invoices take their banking details from org_settings, per
-- org, which is correctly scoped. Nothing reads these columns from a
-- browser at all.)
--
-- The browser needs exactly two values out of this table — billing_live
-- and platform_org_id, both read on every sign-in to decide whether to
-- show the platform tabs. So those two get a function, and the table goes
-- owner-only.
DROP POLICY IF EXISTS platform_settings_read ON public.platform_settings;

CREATE POLICY platform_settings_owner_read ON public.platform_settings
  FOR SELECT USING (public.is_platform_owner());

REVOKE ALL ON public.platform_settings FROM anon;

CREATE OR REPLACE FUNCTION public.platform_public_settings()
RETURNS TABLE (billing_live boolean, platform_org_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(s.billing_live, false), s.platform_org_id
    FROM public.platform_settings s LIMIT 1;
$$;

COMMENT ON FUNCTION public.platform_public_settings() IS
  'The only two things a browser needs from platform_settings: whether billing is switched on, and which org is the platform itself. Exists so the table can stay owner-only — it also holds HostEase Pro''s bank account, which used to be readable by anyone with the anon key.';

REVOKE ALL ON FUNCTION public.platform_public_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_public_settings() TO anon, authenticated;

-- ══════════════════════════════════════════════════════════════════
-- 6. AN anon INSERT ON bookings THAT NOTHING USES
-- ══════════════════════════════════════════════════════════════════
--
--     "Allow direct booking inserts"  FOR INSERT TO anon
--       WITH CHECK (platform = 'direct')
--
-- No org test. Anyone holding the anon key could file a booking against
-- any agency's property, as long as they called it 'direct'.
--
-- The probe came back 42501 — but NOT from this policy. The insert passed,
-- and then a trigger creating booking_checklists rows failed ITS policy.
-- So the only thing standing between a stranger and a fake booking in
-- anyone's calendar is a side effect of an unrelated trigger, which is not
-- a security control and would disappear the day that trigger changes.
--
-- Nothing in the codebase uses it: the booking site quotes through
-- public_stay_quote and books through a server route on the service key.
-- It also cannot work today, per the above. Drop it.
DROP POLICY IF EXISTS "Allow direct booking inserts" ON public.bookings;

-- ══════════════════════════════════════════════════════════════════
-- 7. TWO HARDCODED-TENANT FUNCTIONS, ONE OF THEM BROKEN
-- ══════════════════════════════════════════════════════════════════
--
-- get_staff_portal_logins() and get_staff_portal_roster() — the no-argument
-- versions — both open with:
--
--     SELECT ... WHERE id = '5966bc67-…'
--
-- S&N's org id, baked in, granted to anon. Every caller in the codebase
-- passes p_portal_key and reaches the two-argument versions instead. The
-- roster one has been broken for some time ("return type mismatch … Final
-- statement returns too many columns") and raised an error the moment the
-- sweep touched it, which is its own proof that nothing calls it.
--
-- These are how a second agency ends up looking at S&N's cleaners.
DROP FUNCTION IF EXISTS public.get_staff_portal_logins();
DROP FUNCTION IF EXISTS public.get_staff_portal_roster();

-- ══════════════════════════════════════════════════════════════════
-- 8. GRANTS ON A TABLE WITH NOTHING BEHIND IT
-- ══════════════════════════════════════════════════════════════════
--
-- user_profiles has RLS on and zero policies, so it currently denies
-- everyone — but anon and authenticated still hold SELECT, INSERT, UPDATE
-- and DELETE on it from Supabase's default grants. It is one policy away
-- from being wide open, and the policy would look harmless when written.
-- Take the grants away so the table has to be opened deliberately.
REVOKE ALL ON public.user_profiles FROM anon, authenticated;

-- ══════════════════════════════════════════════════════════════════
-- 9. THE FUNCTIONS EVERY POLICY DEPENDS ON COULD BE SHADOWED
-- ══════════════════════════════════════════════════════════════════
--
-- Eleven SECURITY DEFINER functions are set to `search_path = public`.
-- Postgres searches the temporary schema FIRST for table names unless
-- pg_temp is named explicitly, so a caller who can create a temp table
-- called `profiles` gets that function reading their table instead of
-- ours — while running as the owner.
--
-- Among the eleven: current_org_id, is_org_admin, is_org_member,
-- has_permission. Those four decide the answer to nearly every RLS policy
-- in the database.
--
-- Not exploitable through PostgREST today, because anon cannot issue
-- CREATE TEMP TABLE through it. That is a property of the API in front of
-- the database, not of the database, and it is not the kind of thing to
-- leave resting on one layer. Naming pg_temp last costs nothing.
ALTER FUNCTION public.client_property_keys()                      SET search_path = public, pg_temp;
ALTER FUNCTION public.client_property_uuids()                     SET search_path = public, pg_temp;
ALTER FUNCTION public.current_org_id()                            SET search_path = public, pg_temp;
ALTER FUNCTION public.get_outside_clean_info(uuid, uuid)          SET search_path = public, pg_temp;
ALTER FUNCTION public.get_site_content(uuid, text)                SET search_path = public, pg_temp;
ALTER FUNCTION public.has_permission(uuid, text)                  SET search_path = public, pg_temp;
ALTER FUNCTION public.is_client_property(uuid)                    SET search_path = public, pg_temp;
ALTER FUNCTION public.is_client_property_key(text)                SET search_path = public, pg_temp;
ALTER FUNCTION public.is_org_admin(uuid)                          SET search_path = public, pg_temp;
ALTER FUNCTION public.is_org_member(uuid)                         SET search_path = public, pg_temp;
ALTER FUNCTION public.submit_outside_inventory(uuid, uuid, jsonb, text) SET search_path = public, pg_temp;

-- End 922_security_sweep.
