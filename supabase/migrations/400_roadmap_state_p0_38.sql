-- 400_roadmap_state_p0_38.sql
-- Runs on BOTH databases. Marks Roadmap item p0-38 (outside cleaner:
-- no-login shareable link to fill out the real inventory checklist) done.

DELETE FROM public.roadmap_state WHERE task_key = 'p0-38';

INSERT INTO public.roadmap_state (task_key, done, updated_at)
VALUES ('p0-38', true, now());

-- End 400_roadmap_state_p0_38.
