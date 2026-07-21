-- 510_roadmap_state_p0_25_p0_29.sql
-- Runs on BOTH databases. Marks Roadmap items p0-25 ("Edit clean" on a
-- linked cleaning not saving a date change — confirmed already fixed as a
-- side effect of p0-39's unquoted-id fix) and p0-29 (fmtDate() called with
-- a full timestamp — confirmed the bookings-array normalizer already
-- prevents this at both flagged call sites) done. No code change needed
-- for either — this migration only updates the roadmap checkboxes to match
-- reality, verified directly against the current code.

DELETE FROM public.roadmap_state WHERE task_key IN ('p0-25', 'p0-29');

INSERT INTO public.roadmap_state (task_key, done, updated_at) VALUES
  ('p0-25', true, now()),
  ('p0-29', true, now());

-- End 510_roadmap_state_p0_25_p0_29.
