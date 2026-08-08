-- 923_roadmap_security_sweep.sql
-- Runs on BOTH databases.
--
-- What the security sweep (922) closed, and the one thing it deliberately
-- did not. Recorded in the roadmap rather than left in a commit message,
-- because the part that is still open is the part most likely to be
-- forgotten — it looks like normal working software from the outside.

DO $$
DECLARE org uuid;
BEGIN
  -- Derived from the phases table, not matched on a name. The roadmap
  -- belongs to HostEase Pro; a name lookup once found S&N instead.
  SELECT DISTINCT org_id INTO org FROM public.roadmap_phases WHERE phase_id = 'p2';
  IF org IS NULL THEN RAISE NOTICE 'No roadmap on this database; nothing touched.'; RETURN; END IF;

  INSERT INTO public.roadmap_items (org_id, task_key, phase_id, title, note, cat, sort) VALUES

  -- THE ONE STILL OPEN, AND THE REASON IT IS.
  --
  -- demo/domestic.html is a signed-out page: cleaners have no auth.users
  -- row, they have a name and a PIN. It reads five tables directly with
  -- the anon key across 22 call sites, so those tables carry anon policies
  -- pinned to S&N's org id. Confirmed by connecting as anon: 376 bookings
  -- readable with real guest names and amounts, 534 availability rows, and
  -- an UPDATE that rewrote all 58 domestics rows.
  --
  -- The anon key is not a secret — it is in the page source of a public
  -- URL. So this is readable by anyone who opens the staff portal.
  --
  -- It is S&N's own data, not a customer's, which is why it was not worth
  -- breaking Nina's portal at midnight to fix. It becomes a customer's
  -- problem the moment agency number two needs a staff portal, because the
  -- only way to give them one today is to copy this pattern.
  (org, 'p2-63', 'p2', 'Move the staff portal off raw anon table access',
   'The domestic portal reads bookings, domestics, cleaner_availability, inventory_reports and property_inspections straight from the browser with the anon key, guarded only by policies hardcoded to S&N''s org id. Proven with an anon connection: all 376 bookings readable including guest names, and a single UPDATE rewrote all 58 domestics rows. Fix is the shape staff_portal_sync_claim already uses — SECURITY DEFINER functions taking portal key plus PIN, org resolved from the PIN and never from the request — then drop the six anon policies. Blocks giving any second agency a staff portal.', 'Security', 63),

  -- Cheap, and it is how the next one of these gets found early rather
  -- than by somebody looking.
  (org, 'p2-64', 'p2', 'Run the anon/stranger probe before each release',
   'Everything in the sweep was found by connecting as the anon role and as a signed-in user with no profile row, then trying it — not by reading policies, which is how the holes got written in the first place. scripts/tests/test_rls_guards.js catches the known bad shapes in new migrations offline; it cannot tell you what the database will actually answer. The probe method is written at the top of that file.', 'Security', 64)

  ON CONFLICT (org_id, task_key) DO UPDATE
    SET title = EXCLUDED.title, note = EXCLUDED.note, cat = EXCLUDED.cat, sort = EXCLUDED.sort;

  -- ── Closed by 922 ───────────────────────────────────────────────
  --
  -- Not a roadmap item before today — these were found by the sweep, so
  -- they are recorded already done, for the history rather than the list.
  INSERT INTO public.roadmap_items (org_id, task_key, phase_id, title, note, cat, sort) VALUES
  (org, 'p2-62b', 'p2', 'Security sweep: seven holes closed',
   'All 49 tables already had RLS on; that was never the problem. Closed: two policies named "org members can view/insert inspections" that contained no membership test at all, so any signed-in user of any agency could read and write S&N''s inspections; generate_daily_service, whose guard began "IF auth.uid() IS NOT NULL" and therefore checked nothing for a signed-out caller, letting anon schedule cleaning work in any agency; platform_ensure_sub, callable by anon; the spend_owed view, which ignored RLS and would have started leaking on the first expense recorded; platform_settings, which held HostEase Pro''s own bank details behind a policy that said only "authenticated or anon"; an unscoped anon INSERT on bookings; and two hardcoded-tenant staff portal functions, one of them broken. Plus pg_temp pinned on the eleven SECURITY DEFINER helpers, including current_org_id and is_org_admin.', 'Security', 62)
  ON CONFLICT (org_id, task_key) DO UPDATE
    SET title = EXCLUDED.title, note = EXCLUDED.note, cat = EXCLUDED.cat, sort = EXCLUDED.sort;

  INSERT INTO public.roadmap_state (org_id, task_key, done, updated_at)
  VALUES (org, 'p2-62b', true, now())
  ON CONFLICT (org_id, task_key) DO UPDATE SET done = true, updated_at = now();
END $$;

-- End 923_roadmap_security_sweep.
