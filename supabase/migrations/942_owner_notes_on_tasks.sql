-- A property owner can add a note to work that is still open.
--
-- Owner: "let them have the option to also add a comment or note from their
-- end" … "only on the todos though".
--
-- tasks.comments already exists and the Task drawer already reads it, so
-- this is a second writer to a thing that works rather than a new one.
--
-- AN RPC, NOT A POLICY. tasks_client_select is read-only and has to stay
-- that way: an UPDATE policy on tasks scoped to their property would let an
-- owner retitle, reassign, reprioritise, reschedule or close our work, and
-- RLS cannot restrict columns. This writes one field, appending only.
--
-- OPEN WORK ONLY, which is the "only on the todos" part. A note on
-- something already finished reopens a conversation about work nobody is
-- looking at any more — that belongs in a question, where it gets a status
-- and an answer. Both status columns are checked, because the Task board
-- reads kanban_status and everything else reads status, and a task closed
-- on one is closed.
--
-- `side` is stamped 'client' by the function, never passed in: the agency's
-- own comments on the same task are written by the drawer, and a note has
-- to say truthfully which side it came from.

CREATE OR REPLACE FUNCTION public.owner_add_task_note(p_task uuid, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $fn$
DECLARE v_ok boolean; v_name text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  IF coalesce(btrim(p_note), '') = '' THEN RAISE EXCEPTION 'empty note'; END IF;

  SELECT true INTO v_ok FROM public.tasks t
   WHERE t.id = p_task
     AND t.client_visible
     AND coalesce(t.kanban_status, 'todo') NOT IN ('done', 'cancelled')
     AND coalesce(t.status, 'pending')     NOT IN ('completed', 'cancelled')
     AND t.property_id = ANY (public.client_property_uuids());
  IF NOT coalesce(v_ok, false) THEN
    RAISE EXCEPTION 'not an open task of yours';
  END IF;

  SELECT coalesce(p.name, 'Owner') INTO v_name FROM public.profiles p WHERE p.id = auth.uid();

  UPDATE public.tasks
     SET comments = coalesce(comments, '[]'::jsonb) || jsonb_build_object(
           'author', v_name, 'side', 'client', 'at', now(),
           'text', left(btrim(p_note), 2000)),
         updated_at = now()
   WHERE id = p_task;
END $fn$;

REVOKE ALL ON FUNCTION public.owner_add_task_note(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_add_task_note(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.owner_add_task_note(uuid, text) IS
  'Lets a property owner add a note to an OPEN task they can already see. Exists because tasks_client_select is read-only and must stay that way — an owner must not be able to retitle, reassign, reprioritise or close our work.';
