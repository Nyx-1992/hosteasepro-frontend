-- 380_roadmap_state_p0_37.sql
-- Runs on BOTH databases. Marks Roadmap item p0-37 (outside cleaner: phone
-- number + direct WhatsApp send of the cleaning checklist) done.

DELETE FROM public.roadmap_state WHERE task_key = 'p0-37';

INSERT INTO public.roadmap_state (task_key, done, updated_at)
VALUES ('p0-37', true, now());

-- End 380_roadmap_state_p0_37.
