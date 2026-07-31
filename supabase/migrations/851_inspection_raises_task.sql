-- 851_inspection_raises_task.sql
-- Runs on BOTH databases. Depends on 850 (tasks.client_visible).
--
-- An inspection that finds something wrong raises a task, and shares it
-- with the property owner.
--
-- WHY. Nina's May report on TV House said "light switch in small bathroom
-- cracked — needs replacement (still pending)". Nothing anywhere tracked
-- it. The report is a record of a moment; a task is the thing that gets
-- chased. The owner's instruction was that Nina uses the platform from
-- now on, so this is the moment to make a submitted report DO something
-- rather than sit in a table.
--
-- WHY AN RPC AND NOT AN INSERT FROM THE PAGE. Nina's portal
-- (demo/domestic.html) authenticates with a PIN, not a Supabase session,
-- so it calls as anon — and every policy on tasks requires
-- auth.role() = 'authenticated'. A direct insert from that page is
-- rejected. This follows the convention already in this codebase for
-- exactly that situation: a narrow SECURITY DEFINER function granted to
-- anon (get_outside_clean_info 390, submit_outside_inventory 390,
-- get_staff_portal_roster 660) rather than opening the table up.
--
-- WHAT STOPS IT BEING ABUSED. The function takes ONLY an inspection id
-- and reads everything else — org, property, text — from that row, so a
-- caller cannot choose what gets written or which org it lands in. It is
-- idempotent on property_inspections.task_created, so a given inspection
-- can raise at most one task no matter how often it is called. The worst
-- an attacker with a valid inspection id achieves is creating the task
-- that was going to be created anyway.

CREATE OR REPLACE FUNCTION public.raise_inspection_task(p_inspection_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  insp        public.property_inspections%ROWTYPE;
  v_breakages text;
  v_issues    text;
  v_poor      boolean;
  v_title     text;
  v_detail    text;
  v_task_id   uuid;
BEGIN
  SELECT * INTO insp FROM public.property_inspections WHERE id = p_inspection_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Already raised. Returning quietly rather than erroring keeps a retry
  -- from looking like a failure to the person who just filed a report.
  IF COALESCE(insp.task_created, false) THEN
    RETURN NULL;
  END IF;

  -- Nina's portal writes `breakages` (free text) and `issues` (the
  -- checklist items she marked). Older rows use breakage_notes and the
  -- breakage_found flag, so both shapes are read.
  v_breakages := NULLIF(btrim(COALESCE(insp.breakages, insp.breakage_notes, '')), '');
  IF v_breakages IS NULL AND COALESCE(insp.breakage_found, false) THEN
    v_breakages := 'Breakage reported';
  END IF;

  SELECT string_agg(x, ', ') INTO v_issues
  FROM (SELECT jsonb_array_elements_text(
          CASE jsonb_typeof(COALESCE(insp.issues, '[]'::jsonb))
            WHEN 'array' THEN COALESCE(insp.issues, '[]'::jsonb)
            ELSE '[]'::jsonb
          END) AS x) s;

  v_poor := lower(COALESCE(insp.overall_condition, '')) IN ('poor', 'fair');

  -- A clean report raises nothing. Creating an empty task for every
  -- inspection would train everyone to ignore the board.
  IF v_breakages IS NULL AND v_issues IS NULL AND NOT v_poor THEN
    RETURN NULL;
  END IF;

  -- Breakages lead when present: they are what an owner pays for and
  -- what actually gets forgotten.
  v_title := CASE
    WHEN v_breakages IS NOT NULL THEN 'Repair: ' || left(split_part(v_breakages, E'\n', 1), 70)
    WHEN v_issues IS NOT NULL     THEN 'Inspection follow-up: ' || left(v_issues, 60)
    ELSE 'Inspection follow-up: condition ' || COALESCE(insp.overall_condition, 'fair')
  END;

  v_detail := concat_ws(E'\n',
    CASE WHEN v_breakages IS NOT NULL THEN 'Breakages: ' || v_breakages END,
    CASE WHEN v_issues    IS NOT NULL THEN 'Flagged: '   || v_issues    END,
    CASE WHEN NULLIF(btrim(COALESCE(insp.notes, insp.general_notes, '')), '') IS NOT NULL
         THEN 'Notes: ' || btrim(COALESCE(insp.notes, insp.general_notes)) END,
    'From the inspection on ' || COALESCE(insp.inspection_date::text, '') ||
      COALESCE(' by ' || NULLIF(COALESCE(insp.inspector_name, insp.submitted_by), ''), '') || '.'
  );

  INSERT INTO public.tasks (
    org_id, property_id, title, description, status, kanban_status,
    type, priority, assigned, task_date, client_visible
  ) VALUES (
    insp.org_id, insp.property_id, v_title, v_detail, 'pending', 'todo',
    CASE WHEN v_breakages IS NOT NULL THEN 'maintenance' ELSE 'other' END,
    -- A breakage is high. A flagged item or a middling rating is not
    -- urgent by itself and must not cry wolf on the board.
    CASE WHEN v_breakages IS NOT NULL THEN 'high' ELSE 'normal' END,
    'Unassigned', insp.inspection_date, true
  ) RETURNING id INTO v_task_id;

  UPDATE public.property_inspections SET task_created = true WHERE id = p_inspection_id;

  RETURN v_task_id;
END;
$$;

REVOKE ALL ON FUNCTION public.raise_inspection_task(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.raise_inspection_task(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.raise_inspection_task(uuid) IS
  'Raises one owner-visible task from an inspection that found breakages, flagged items or a poor/fair condition. Idempotent via property_inspections.task_created. Called by the PIN-based staff portal, which has no authenticated session.';

-- End 851_inspection_raises_task.
