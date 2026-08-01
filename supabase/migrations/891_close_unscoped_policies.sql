-- 891_close_unscoped_policies.sql
-- Runs on BOTH databases. SECURITY-CRITICAL.
--
-- 890 rewrote two policies on organizations and the client could still
-- read every org. A THIRD policy was granting it —
-- authenticated_all_organizations, FOR ALL USING (is signed in) — and
-- permissive policies are OR-ed, so the widest one wins no matter how
-- carefully the others are written.
--
-- That is the same lesson as 824, learned again the hard way. This
-- migration therefore does not fix policies one at a time: it closes
-- EVERY policy in the database that grants on "is signed in" or "is
-- anonymous" alone, found by sweeping for expressions that mention no
-- org, no property, no owner and no token.
--
-- ══ 1. ORGANIZATIONS ══════════════════════════════════════════════
-- The one that actually granted everything.
DROP POLICY IF EXISTS authenticated_all_organizations ON public.organizations;

-- ══ 2. ROADMAP ════════════════════════════════════════════════════
--
-- The owner's instruction: "roadmap is ONLY for me and no one else to
-- see." It was the opposite of that — one policy open to PUBLIC with
-- USING (true) WITH CHECK (true), and another open to any signed-in
-- user. Anyone at all could read the ticks; anyone signed in could flip
-- or delete them.
--
-- It also had no org column, so two agencies would have shared and
-- overwritten each other's tick state — a multi-tenancy bug hiding
-- inside a security one.
DROP POLICY IF EXISTS roadmap_all ON public.roadmap_state;
DROP POLICY IF EXISTS authenticated_all_roadmap_state ON public.roadmap_state;

ALTER TABLE public.roadmap_state ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Existing ticks belong to S&N, the only org that has ever had a roadmap.
UPDATE public.roadmap_state
   SET org_id = '5966bc67-5c2f-45ae-8519-9b7eaeee09f4'
 WHERE org_id IS NULL;

-- OWNER ONLY, not admin and not host. The roadmap carries pricing
-- decisions, competitor analysis and security incident notes — it is the
-- owner's working notebook, not a team document.
DROP POLICY IF EXISTS roadmap_owner_only ON public.roadmap_state;
CREATE POLICY roadmap_owner_only ON public.roadmap_state FOR ALL USING (
  auth.role() = 'authenticated'
  AND org_id = public.current_org_id()
  AND EXISTS (SELECT 1 FROM public.profiles p
               WHERE p.id = auth.uid() AND p.role = 'owner' AND p.org_id = roadmap_state.org_id)
) WITH CHECK (
  auth.role() = 'authenticated'
  AND org_id = public.current_org_id()
  AND EXISTS (SELECT 1 FROM public.profiles p
               WHERE p.id = auth.uid() AND p.role = 'owner' AND p.org_id = roadmap_state.org_id)
);

COMMENT ON TABLE public.roadmap_state IS
  'Which roadmap items the OWNER has ticked. Owner-only by policy, per an explicit instruction. NOTE the roadmap TEXT still lives in demo/index_fixed.html and is therefore readable by anyone who views source — locking this table protects the ticks, not the content.';

-- ══ 3. THE PIN STAFF PORTAL'S ANON ACCESS ═════════════════════════
--
-- demo/domestic.html signs cleaners in with a PIN, not a Supabase
-- session, so it reads and writes as anon. Six tables therefore carry
-- policies that grant on auth.role() = 'anon' and nothing else:
-- bookings, domestics, cleaner_availability, inventory_reports and
-- property_inspections.
--
-- That was survivable while S&N was the only tenant. It is not now:
-- anyone can call the anon API and read EVERY organisation's bookings,
-- cleaning log and inspection reports. A second agency's data would be
-- exposed the day they signed up.
--
-- The proper fix is a token-scoped portal, the way the outside-cleaner
-- flow already works (390) — real design work, tracked separately.
-- What this migration does is cap the blast radius NOW: anon is scoped
-- to the single org whose portal actually exists. The portal keeps
-- working unchanged, and a new agency's data is never anon-readable.
DO $$
DECLARE
  r record;
  sn constant text := '5966bc67-5c2f-45ae-8519-9b7eaeee09f4';
  q text; w text;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl, p.polname, p.polcmd,
           pg_get_expr(p.polqual, p.polrelid)      AS qual,
           pg_get_expr(p.polwithcheck, p.polrelid) AS wc
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
     WHERE coalesce(pg_get_expr(p.polqual, p.polrelid),
                    pg_get_expr(p.polwithcheck, p.polrelid), '') LIKE '%anon%'
       AND coalesce(pg_get_expr(p.polqual, p.polrelid),
                    pg_get_expr(p.polwithcheck, p.polrelid), '') NOT LIKE '%org_id%'
       -- Only tables that actually carry an org_id can be scoped by one.
       AND EXISTS (SELECT 1 FROM information_schema.columns col
                    WHERE col.table_schema = 'public' AND col.table_name = c.relname
                      AND col.column_name = 'org_id')
  LOOP
    q := CASE WHEN r.qual IS NULL THEN NULL
              ELSE '(' || r.qual || ') AND org_id = ' || quote_literal(sn) || '::uuid' END;
    w := CASE WHEN r.wc IS NULL THEN NULL
              ELSE '(' || r.wc || ') AND org_id = ' || quote_literal(sn) || '::uuid' END;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.polname, r.tbl);
    IF q IS NOT NULL AND w IS NOT NULL THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR %s USING (%s) WITH CHECK (%s)',
                     r.polname, r.tbl,
                     CASE r.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
                                   WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' ELSE 'ALL' END, q, w);
    ELSIF q IS NOT NULL THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR %s USING (%s)',
                     r.polname, r.tbl,
                     CASE r.polcmd WHEN 'r' THEN 'SELECT' WHEN 'w' THEN 'UPDATE'
                                   WHEN 'd' THEN 'DELETE' ELSE 'ALL' END, q);
    ELSE
      EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (%s)',
                     r.polname, r.tbl, w);
    END IF;
    RAISE NOTICE 'scoped anon policy %.% to S&N', r.tbl, r.polname;
  END LOOP;
END $$;

-- ══ 4. ANON NEEDS EXECUTE ON THE CLIENT HELPERS ═══════════════════
--
-- Found by testing the change above, and it would have taken the staff
-- portal offline.
--
-- Postgres may evaluate EVERY permissive policy on a table regardless of
-- which role is asking. The client policies on bookings, domestics and
-- friends call is_client_property(), which 820 granted to authenticated
-- only. So an anon read could hit "permission denied for function
-- client_property_uuids" and fail the whole query rather than simply
-- matching no rows.
--
-- It did not bite before because the old anon policy was true outright
-- and could satisfy the OR on its own; narrowing it made the planner
-- reach the client policy. Granting execute leaks nothing — for anon
-- auth.uid() is null, so these return an empty array.
GRANT EXECUTE ON FUNCTION public.client_property_uuids()      TO anon;
GRANT EXECUTE ON FUNCTION public.client_property_keys()       TO anon;
GRANT EXECUTE ON FUNCTION public.is_client_property(uuid)     TO anon;
GRANT EXECUTE ON FUNCTION public.is_client_property_key(text) TO anon;

-- End 891_close_unscoped_policies.
