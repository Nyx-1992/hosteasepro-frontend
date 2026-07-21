-- 440_roadmap_state_p0_41.sql
-- Runs on BOTH databases. Marks Roadmap item p0-41 (p0-40 fix: WhatsApp
-- send silently blocked by popup blockers, edits never sent at all, no
-- send history) done.

DELETE FROM public.roadmap_state WHERE task_key = 'p0-41';

INSERT INTO public.roadmap_state (task_key, done, updated_at)
VALUES ('p0-41', true, now());

-- End 440_roadmap_state_p0_41.
