-- 920_staff_portal_sync.sql
-- Runs on BOTH databases.
--
-- Let the person who actually needs the bookings pull them in.
--
-- ══ THE ORIGINAL COMPLAINT ═══════════════════════════════════════
--
-- "Nina complained she couldn't see the latest booking in the domestic
-- platform to assign a cleaner. And when she tried syncing the bookings as
-- a new one came in from LekkeSlaap, it didn't load on her end. I tried
-- about 1.5h later and it worked immediately."
--
-- The server-side cron fixed the worst of that: bookings now arrive on
-- their own rather than only while an admin has HEP open. But the SYNC
-- BUTTON still does not exist for Nina. The one in Settings needs an owner
-- or admin login, and the staff portal has no equivalent — so when a
-- booking lands between cron runs and she needs to assign a cleaner now,
-- she has no way to ask for it. She has to phone somebody who has HEP.
--
-- ══ AUTHENTICATING SOMEBODY WITH NO LOGIN ════════════════════════
--
-- Cleaners and coordinators have no auth.users row. They have a portal key
-- in the URL and a PIN, checked by staff_portal_login() — so this uses
-- exactly the same three facts and the same comparison. No new credential,
-- no new surface: if you can get into the portal you can press the button,
-- and if you cannot you can do neither.
--
-- ══ WHY THERE IS A COOLDOWN ══════════════════════════════════════
--
-- A sync fetches every calendar the agency has from Airbnb, Booking.com
-- and LekkeSlaap. A button that does that on demand, reachable by anybody
-- holding a four-digit PIN, is a way to hammer three companies we depend
-- on — accidentally by somebody tapping it repeatedly because nothing
-- seems to be happening, or deliberately.
--
-- So the claim is atomic and rate-limited per ORG rather than per person:
-- two cleaners pressing at once is one sync, which is also the correct
-- answer, since the second would have nothing new to find.
--
-- Ninety seconds is long enough to stop a frustrated double-tap becoming
-- six fetches and short enough that "press it again in a moment" is a real
-- instruction rather than a brush-off.

CREATE TABLE IF NOT EXISTS public.org_sync_runs (
  org_id      uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  last_run_at timestamptz NOT NULL DEFAULT now(),
  by_name     text
);

COMMENT ON TABLE public.org_sync_runs IS
  'When each agency last pulled its calendars in by hand, and who asked. One row per org — only the latest matters. Backs the cooldown on the staff portal sync button.';

-- Nobody reads this from a browser. The endpoint uses the service key.
ALTER TABLE public.org_sync_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.org_sync_runs FROM anon, authenticated;

-- ── Check the PIN and claim the slot, in one statement ────────────
--
-- Returns the org only when the PIN is right AND the cooldown has passed,
-- and records the run in the same breath. Two calls arriving together
-- cannot both win: the UPDATE ... WHERE last_run_at < cutoff takes a row
-- lock, so the second sees the first's timestamp and is refused.
--
-- The PIN test is the same one staff_portal_login() makes — first name
-- against portal_pin, scoped to the org that owns the portal key.
CREATE OR REPLACE FUNCTION public.staff_portal_sync_claim(
  p_portal_key text, p_name text, p_pin text, p_cooldown_seconds int DEFAULT 90)
-- The org column is called sync_org_id, not org_id. An OUT parameter named
-- org_id becomes a PL/pgSQL variable, and Postgres then cannot tell it apart
-- from the COLUMN org_id in "ON CONFLICT (org_id)" — it raises "column
-- reference is ambiguous" at call time rather than at definition time, so
-- the function creates cleanly and fails the first time somebody presses
-- the button.
RETURNS TABLE (sync_org_id uuid, allowed boolean, wait_seconds int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_org  uuid;
  v_last timestamptz;
  n int;
BEGIN
  SELECT tc.org_id INTO v_org
    FROM public.team_contacts tc
    JOIN public.organizations o ON o.id = tc.org_id
   WHERE o.portal_key = p_portal_key
     AND tc.portal_pin IS NOT NULL
     AND split_part(tc.name, ' ', 1) = p_name
     AND tc.portal_pin = p_pin
   LIMIT 1;

  -- Wrong PIN, wrong name, or a portal key that is not theirs. One answer
  -- for all three: which of them failed is not the caller's to learn.
  IF v_org IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, false, 0;
    RETURN;
  END IF;

  UPDATE public.org_sync_runs
     SET last_run_at = now(), by_name = p_name
   WHERE org_sync_runs.org_id = v_org
     AND last_run_at < now() - make_interval(secs => p_cooldown_seconds);
  GET DIAGNOSTICS n = ROW_COUNT;

  IF n = 1 THEN
    RETURN QUERY SELECT v_org, true, 0;
    RETURN;
  END IF;

  -- No row updated: either there is no row yet (first ever sync for this
  -- agency) or the cooldown has not passed. Telling those apart needs a
  -- read, and inserting is the right answer for the first.
  SELECT last_run_at INTO v_last FROM public.org_sync_runs WHERE org_sync_runs.org_id = v_org;

  IF v_last IS NULL THEN
    INSERT INTO public.org_sync_runs (org_id, last_run_at, by_name)
    VALUES (v_org, now(), p_name)
    ON CONFLICT (org_id) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT;
    -- Lost the race to another first-time caller; treat as cooling down.
    IF n = 1 THEN
      RETURN QUERY SELECT v_org, true, 0;
      RETURN;
    END IF;
    SELECT last_run_at INTO v_last FROM public.org_sync_runs WHERE org_sync_runs.org_id = v_org;
  END IF;

  RETURN QUERY SELECT v_org, false,
    GREATEST(0, p_cooldown_seconds - EXTRACT(EPOCH FROM (now() - v_last))::int);
END $$;

COMMENT ON FUNCTION public.staff_portal_sync_claim(text, text, text, int) IS
  'Verify a staff PIN and claim the agency''s sync slot in one statement. Returns allowed=false with wait_seconds when the cooldown has not passed, and the same refusal for a bad PIN as for a bad name — which failed is not the caller''s to learn.';

-- NOT granted to anon, unlike staff_portal_login. The browser calls
-- /api/staff-sync, which holds the service key; exposing this to the page
-- would let anyone walk PINs against it without the endpoint in the way.
REVOKE ALL ON FUNCTION public.staff_portal_sync_claim(text, text, text, int) FROM PUBLIC, anon, authenticated;

-- End 920_staff_portal_sync.
