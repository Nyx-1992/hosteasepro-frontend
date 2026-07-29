-- 570_bookings_close_null_org_leak.sql
-- Runs on BOTH databases — production and staging.
--
-- CRITICAL: closes a cross-tenant data leak. bookings_select/insert/update
-- (040_policies.sql, 080_is_org_member.sql, 100_rls_parity.sql) all allow
-- "org_id IS NULL OR org_id = current_org_id()" — a deliberate compat shim
-- for S&N's own bookings rows that predate the org_id column and were
-- never backfilled. In practice this means ANY authenticated user in ANY
-- organization can read (and update/insert into) every booking that still
-- has org_id = NULL, regardless of which org they belong to.
--
-- Confirmed exploitable in production 2026-07-29: the very first second
-- organization ever created (via the new internal org-creation tool) could
-- immediately see S&N's real guest bookings (names, dates, property) on
-- its own Bookings tab, because those rows have org_id = NULL.
--
-- Fix is two steps, in order:
--   1. Backfill every currently-NULL bookings.org_id to S&N's own org
--      (the only org these legacy rows could ever have belonged to — the
--      org-creation tool is brand new and gated to S&N-only callers, so no
--      other org has had the chance to insert a NULL-org_id row itself).
--   2. Drop the "org_id IS NULL OR" bypass from select/insert/update so no
--      future NULL row (however it got there) is ever globally readable
--      again — RLS now requires an exact org_id match, full stop.

-- Step 1: backfill.
UPDATE public.bookings
SET org_id = '5966bc67-5c2f-45ae-8519-9b7eaeee09f4'
WHERE org_id IS NULL;

-- Step 2: tighten policies — exact org match only, no NULL bypass.
DROP POLICY IF EXISTS bookings_select ON public.bookings;
CREATE POLICY bookings_select ON public.bookings FOR SELECT USING (
	auth.role() = 'authenticated' AND org_id = current_org_id()
);

DROP POLICY IF EXISTS bookings_insert ON public.bookings;
CREATE POLICY bookings_insert ON public.bookings FOR INSERT WITH CHECK (
	auth.role() = 'authenticated' AND org_id = current_org_id()
);

DROP POLICY IF EXISTS bookings_update ON public.bookings;
CREATE POLICY bookings_update ON public.bookings FOR UPDATE USING (
	auth.role() = 'authenticated' AND org_id = current_org_id() AND is_org_member(org_id)
) WITH CHECK (
	auth.role() = 'authenticated' AND org_id = current_org_id() AND is_org_member(org_id)
);

-- Sanity check after running — should return 0 on both databases:
--   SELECT count(*) FROM public.bookings WHERE org_id IS NULL;

-- End 570_bookings_close_null_org_leak.
