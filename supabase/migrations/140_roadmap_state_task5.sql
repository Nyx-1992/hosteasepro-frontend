-- 140_roadmap_state_task5.sql
-- Runs on BOTH databases. Marks the Roadmap tab's p0-22 (per-platform rate
-- calculator, Task 5) as done, same pattern as 120_roadmap_state_seed.sql.
-- Idempotent via delete-then-insert — see that file's note on why (unique/
-- primary key structure on task_key not confirmed in a migration).

DELETE FROM public.roadmap_state WHERE task_key = 'p0-22';

INSERT INTO public.roadmap_state (task_key, done, updated_at)
VALUES ('p0-22', true, now());

-- End 140_roadmap_state_task5.
