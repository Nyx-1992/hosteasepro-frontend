-- 390_outside_cleaner_link.sql
-- Runs on BOTH databases.
--
-- Backs a shareable, no-login link for outside ("Other") cleaners to fill
-- out the same inventory checklist our regular cleaners submit through
-- the staff portal (demo/domestic.html -> inventory_reports), without
-- needing an account. demo/outside-cleaner.html is the page; the link is
-- /outside-cleaner?d=<domestics.id>&t=<access_token>.
--
-- Security: the link's token is the only credential. RLS can't express
-- "only this row, if you already know its token" (no caller identity for
-- an anonymous cleaner), so instead these are SECURITY DEFINER functions
-- that check the (id, token) pair themselves and are the ONLY way the
-- anon role can read a domestics row or write an inventory_reports row —
-- direct table RLS for anon stays closed.

ALTER TABLE public.domestics ADD COLUMN IF NOT EXISTS access_token uuid DEFAULT gen_random_uuid();
UPDATE public.domestics SET access_token = gen_random_uuid() WHERE access_token IS NULL;
ALTER TABLE public.domestics ALTER COLUMN access_token SET NOT NULL;
ALTER TABLE public.domestics ALTER COLUMN access_token SET DEFAULT gen_random_uuid();

-- Returns the clean + property name + this property's current inventory
-- checklist (rooms/items from property_manuals), only if id+token match.
CREATE OR REPLACE FUNCTION public.get_outside_clean_info(p_id uuid, p_token uuid)
RETURNS TABLE (
  cleaner text,
  clean_date date,
  clean_time text,
  property_name text,
  rooms jsonb
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT d.cleaner, d.date, d.time, p.name,
         COALESCE(pm.content->'rooms', '[]'::jsonb)
  FROM public.domestics d
  JOIN public.properties p ON p.id = d.property_id
  LEFT JOIN public.property_manuals pm
    ON pm.property_id = d.property_id AND pm.section = 'inventory'
  WHERE d.id = p_id AND d.access_token = p_token;
$$;
GRANT EXECUTE ON FUNCTION public.get_outside_clean_info(uuid, uuid) TO anon;

-- Inserts the inventory report (same shape/table as the staff portal's own
-- submitInventory()) and marks the clean completed, only if id+token match.
CREATE OR REPLACE FUNCTION public.submit_outside_inventory(p_id uuid, p_token uuid, p_flagged jsonb, p_notes text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid; v_prop uuid; v_cleaner text; v_date date;
BEGIN
  SELECT org_id, property_id, cleaner, date INTO v_org, v_prop, v_cleaner, v_date
  FROM public.domestics WHERE id = p_id AND access_token = p_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired link';
  END IF;

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

-- End 390_outside_cleaner_link.
