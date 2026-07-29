-- 660_staff_portal_roster.sql
-- Runs on BOTH databases.
--
-- Backs the staff portal's (demo/domestic.html) cleaner lists with the
-- same team_contacts data the Staff tab edits, instead of the portal's
-- hardcoded NINA_CLEANERS_BY_PROP / allCleaners arrays. Found via a real
-- case: Blessing was assigned TV House in the Staff tab (cleaner_properties
-- updated fine in the DB) but the portal's assign modal still offered only
-- its hardcoded ['Fatima','Patricia'] for TV House.
--
-- The staff portal is PIN-based, not Supabase-authenticated, so it runs as
-- anon — and team_contacts' RLS (520) is authenticated-members-only, which
-- is correct and must stay that way (rows hold phones, birthdays, notes).
-- Instead of an anon SELECT policy (row-level only — it would expose every
-- column, and every org), this SECURITY DEFINER function returns EXACTLY
-- the three fields the portal needs, for the one org that has a staff
-- portal (S&N, same hardcoded-org pattern as get_outside_clean_info's
-- property mapping in 390). Names/assignments/rates carry no new exposure:
-- all three were already hardcoded in the shipped, public domestic.html.
--
-- name is the first-name short form ("Patricia", not "Patricia Mutizwa")
-- because that's what domestics.cleaner / cleaner_availability.cleaner
-- store — same convention as getDomesticStaff() in index_fixed.html.
-- cleaner_rate IS NOT NULL excludes caretakers (Tino/Keithy), matching
-- the Staff tab's "assignable cleaner" definition from 620.

CREATE OR REPLACE FUNCTION public.get_staff_portal_roster()
RETURNS TABLE (
  name text,
  properties text[],
  rate jsonb
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT split_part(tc.name, ' ', 1),
         COALESCE(tc.cleaner_properties, '{}'),
         tc.cleaner_rate
  FROM public.team_contacts tc
  WHERE tc.org_id = '5966bc67-5c2f-45ae-8519-9b7eaeee09f4'
    AND tc.cat = 'domestic'
    AND tc.cleaner_rate IS NOT NULL
  ORDER BY tc.sort_order;
$$;
GRANT EXECUTE ON FUNCTION public.get_staff_portal_roster() TO anon;

-- End 660_staff_portal_roster.
