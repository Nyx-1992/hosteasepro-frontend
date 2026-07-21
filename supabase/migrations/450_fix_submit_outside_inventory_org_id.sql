-- 450_fix_submit_outside_inventory_org_id.sql
-- Runs on BOTH databases.
--
-- Fixes submit_outside_inventory (from 390_outside_cleaner_link.sql), which
-- errored "column org_id does not exist" on first live test. It assumed
-- public.domestics has an org_id column — it doesn't; the app never sets
-- one when inserting a domestics row (demo/index_fixed.html's saveDomestic
-- row object has no org_id field), and the staff portal's own inventory
-- insert (demo/domestic.html submitInventory) gets org_id from a hardcoded
-- ORG_ID constant instead of reading it off the clean. get_outside_clean_info
-- never touched org_id, which is why it worked while this one didn't.
--
-- Fix: resolve org_id from public.properties (which does have the column —
-- see loadProperties()'s .eq('org_id', ...) filter) via the same
-- short-key -> UUID resolved property id, instead of selecting it off
-- domestics.

CREATE OR REPLACE FUNCTION public.submit_outside_inventory(p_id uuid, p_token uuid, p_flagged jsonb, p_notes text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_prop_raw text; v_prop uuid; v_cleaner text; v_date date; v_org uuid;
BEGIN
  SELECT property_id, cleaner, date INTO v_prop_raw, v_cleaner, v_date
  FROM public.domestics WHERE id = p_id AND access_token = p_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired link';
  END IF;

  v_prop := (CASE v_prop_raw
    WHEN 'speranta' THEN 'e9737638-d83a-4947-940a-8746789e4d9f'
    WHEN 'tvhouse'  THEN '83b2a84a-5451-4be5-a84f-2efc0d2602d5'
    ELSE v_prop_raw
  END)::uuid;

  SELECT org_id INTO v_org FROM public.properties WHERE id = v_prop;

  INSERT INTO public.inventory_reports
    (org_id, domestic_id, property_id, cleaner, clean_date, submitted_at, flagged_items, all_ok, notes, reviewed, task_created)
  VALUES
    (v_org, p_id::text, v_prop, v_cleaner, v_date, now(), COALESCE(p_flagged, '[]'::jsonb),
     (COALESCE(jsonb_array_length(p_flagged), 0) = 0 AND (p_notes IS NULL OR p_notes = '')),
     NULLIF(p_notes, ''), false, false);

  UPDATE public.domestics SET status = 'completed' WHERE id = p_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.submit_outside_inventory(uuid, uuid, jsonb, text) TO anon;

-- End 450_fix_submit_outside_inventory_org_id.
