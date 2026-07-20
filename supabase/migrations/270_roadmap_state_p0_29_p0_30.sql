-- 270_roadmap_state_p0_29_p0_30.sql
-- Runs on BOTH databases. Marks Roadmap item p0-30 (Guest Timeline / B1)
-- done. p0-29 (fmtDate bug, 2 remaining spots) is intentionally NOT
-- marked done — it's not started yet, just flagged.

DELETE FROM public.roadmap_state WHERE task_key = 'p0-30';

INSERT INTO public.roadmap_state (task_key, done, updated_at)
VALUES ('p0-30', true, now());

-- End 270_roadmap_state_p0_29_p0_30.
