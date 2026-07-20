-- 120_roadmap_state_seed.sql
-- Runs on BOTH databases. Marks this session's completed roadmap items
-- (added to the ROADMAP array in demo/index_fixed.html, Phase 0) as done,
-- so the Roadmap tab's checkboxes reflect reality without needing each
-- one manually ticked. p0-21/p0-22 are deliberately excluded — still open.
-- Idempotent via delete-then-insert, rather than ON CONFLICT — this table
-- was never captured in the checked-in migrations, so its exact unique/
-- primary key structure on task_key is unconfirmed.

DELETE FROM public.roadmap_state
WHERE task_key IN ('p0-13','p0-14','p0-15','p0-16','p0-17','p0-18','p0-19','p0-20');

INSERT INTO public.roadmap_state (task_key, done, updated_at)
VALUES
  ('p0-13', true, now()),
  ('p0-14', true, now()),
  ('p0-15', true, now()),
  ('p0-16', true, now()),
  ('p0-17', true, now()),
  ('p0-18', true, now()),
  ('p0-19', true, now()),
  ('p0-20', true, now());

-- End 120_roadmap_state_seed.
