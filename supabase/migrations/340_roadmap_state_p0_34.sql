-- 340_roadmap_state_p0_34.sql
-- Runs on BOTH databases. Marks Roadmap item p0-34 (round 2 post-review
-- fixes: WhatsApp interstitial, TV House message, Management Invoice
-- polish) done.

DELETE FROM public.roadmap_state WHERE task_key = 'p0-34';

INSERT INTO public.roadmap_state (task_key, done, updated_at)
VALUES ('p0-34', true, now());

-- End 340_roadmap_state_p0_34.
