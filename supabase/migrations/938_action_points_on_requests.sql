-- An answer that promises something gets a task attached to it.
--
-- Owner: "action point pool: have pool company review the db board"
--
-- The reply to the pool thread says three things will happen: the times get
-- fixed with the company in writing, the company inspects the control
-- boxes, and both go into the monthly checks. Written in a message, those
-- are sentences. Nothing tracks them, nothing reminds anybody, and the next
-- time Mirka and Antonio arrive the only record that we said it is buried
-- in a thread.
--
-- `tasks` already does this job. It has a status, a kanban lane, a
-- priority, a property and — the part that matters here — client_visible,
-- which the owner portal already reads to draw "Work on your property". The
-- 2026 "Fix Leather Couch" and "Garden project — Speranta" tasks are
-- already on their dashboard.
--
-- What is missing is the thread it came from. Without it, an owner sees a
-- task in one card and the question they asked in another, with nothing
-- joining them, and the monthly report cannot say what we committed to.
--
-- ON DELETE SET NULL, not CASCADE. Deleting a question must never delete
-- the work it caused: the pool company still has to look at that box
-- whether or not the thread survives.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS owner_query_id uuid
    REFERENCES public.owner_queries(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.tasks.owner_query_id IS
  'The owner request this task was raised from, when it was. Null for tasks that came from anywhere else. ON DELETE SET NULL — removing a question must not remove the work it caused.';

CREATE INDEX IF NOT EXISTS tasks_owner_query_idx
  ON public.tasks (owner_query_id)
  WHERE owner_query_id IS NOT NULL;

-- The owner may already read client_visible tasks for their own property
-- (tasks_client_select, migration 850). That policy is unchanged and still
-- the only way they see any of this — a task attached to their question is
-- visible to them when, and only when, somebody ticked "show the owner".
