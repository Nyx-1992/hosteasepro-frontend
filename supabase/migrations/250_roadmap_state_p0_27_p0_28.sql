-- 250_roadmap_state_p0_27_p0_28.sql
-- Runs on BOTH databases. Marks Roadmap items p0-27 (Today's Check-outs
-- section) and p0-28 (staging stale-cancellation data fix) done. Same
-- pattern as 120/140/180/200/210/220/230. No schema change required.

DELETE FROM public.roadmap_state WHERE task_key IN ('p0-27', 'p0-28');

INSERT INTO public.roadmap_state (task_key, done, updated_at) VALUES
  ('p0-27', true, now()),
  ('p0-28', true, now());

-- End 250_roadmap_state_p0_27_p0_28.
