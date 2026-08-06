-- 913_cleaner_pay_basis.sql
-- Runs on BOTH databases.
--
-- Owner: "What I mean with a daily cleaner is, that there is no fee per
-- room. That should be available to set up in a part for domestic
-- settings."
--
-- ══ THE ASSUMPTION THIS BREAKS ════════════════════════════════════
--
-- Everything about pay in HEP assumes PIECE WORK. team_contacts.cleaner_rate
-- is rands per clean, optionally per property; the staff portal's earnings
-- screen multiplies completed cleans by it; the Spending tab budgets the
-- same way. That is exactly right for a letting agency, where a cleaner
-- turns over a flat between guests and invoices for the turnover.
--
-- It is wrong for a guesthouse, and wrong in a way that produces confident
-- nonsense rather than an error. A guesthouse housekeeper is on a day rate
-- or a monthly wage. She services nine rooms on Tuesday and three on
-- Wednesday and is paid the same both days. Multiplying her rooms by a
-- per-room fee invents a number nobody agreed to, and shows it to her, on
-- her own earnings screen.
--
-- ══ THREE WAYS PEOPLE ACTUALLY GET PAID ═══════════════════════════
--
--   per_clean   rands per turnover, optionally different per property.
--               What the column has always meant. Still the default, so
--               every existing row keeps behaving exactly as it did.
--   per_day     a day rate, however many rooms that day contains.
--               The guesthouse case.
--   monthly     a salary. Live-in staff, or a small hotel's housekeeper.
--
-- cleaner_rate is left untouched and still holds the per-clean figure,
-- including the per-property object form. pay_amount is the new one, and
-- only means anything for per_day and monthly. Two columns rather than
-- overloading one, because the per-property object cannot be a day rate
-- and pretending otherwise is how the next person gets it wrong.

ALTER TABLE public.team_contacts
  ADD COLUMN IF NOT EXISTS pay_basis  text NOT NULL DEFAULT 'per_clean',
  ADD COLUMN IF NOT EXISTS pay_amount numeric;

ALTER TABLE public.team_contacts DROP CONSTRAINT IF EXISTS team_contacts_pay_basis_check;
ALTER TABLE public.team_contacts ADD CONSTRAINT team_contacts_pay_basis_check
  CHECK (pay_basis = ANY (ARRAY['per_clean','per_day','monthly']));

COMMENT ON COLUMN public.team_contacts.pay_basis IS
  'How this person is paid. per_clean uses cleaner_rate (rands per turnover, optionally per property). per_day and monthly use pay_amount and ignore cleaner_rate entirely — a guesthouse housekeeper does nine rooms on Tuesday and three on Wednesday for the same money.';

COMMENT ON COLUMN public.team_contacts.pay_amount IS
  'The day rate or monthly wage. NULL when pay_basis is per_clean, where cleaner_rate is the figure.';

-- Everything that exists today was entered as a per-clean rate, so the
-- default is already correct for every row and nothing is backfilled.

-- ══ THE PORTAL HAS TO KNOW ════════════════════════════════════════
--
-- The staff portal computes a cleaner's earnings itself, from the cleans
-- it already has plus the rate in the roster. Left alone it would keep
-- multiplying a day-rate housekeeper's rooms by a per-room fee she is not
-- paid — inventing a number and showing it to her, on her own earnings
-- screen, which is the worst place to be wrong about somebody's wages.
--
-- So the roster carries the basis. Adding columns to the returned row
-- means dropping and recreating: Postgres will not replace a function
-- whose OUT parameters changed.
--
-- A shared SQL function computing the total would be tidier, but the
-- portal authenticates by PIN against team_contacts rather than by an auth
-- session, so its requests arrive as anon with no current_org_id() — an
-- org-scoped function returns nothing to it. Handing it the two facts it
-- lacks is the honest fix; granting a money function to anon is not.
DROP FUNCTION IF EXISTS public.get_staff_portal_roster(text);

CREATE FUNCTION public.get_staff_portal_roster(p_portal_key text)
RETURNS TABLE(name text, properties text[], rate jsonb, pay_basis text, pay_amount numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT split_part(tc.name, ' ', 1),
         COALESCE(tc.cleaner_properties, '{}'),
         tc.cleaner_rate,
         tc.pay_basis,
         tc.pay_amount
    FROM public.team_contacts tc
    JOIN public.organizations o ON o.id = tc.org_id
   WHERE o.portal_key = lower(trim(coalesce(p_portal_key, '')))
     AND tc.cat = 'domestic'
     -- A day-rate or salaried cleaner has no cleaner_rate at all, and the
     -- old WHERE dropped them from the roster entirely — so they could not
     -- be assigned work, which is a strange way to treat the only person
     -- who is definitely coming in tomorrow.
     AND (tc.cleaner_rate IS NOT NULL OR tc.pay_basis <> 'per_clean')
   ORDER BY tc.sort_order;
$$;

COMMENT ON FUNCTION public.get_staff_portal_roster(text) IS
  'Assignable cleaners for one agency, with how they are paid. Includes day-rate and salaried staff, who have no per-clean rate and were previously excluded from the roster altogether.';

REVOKE ALL ON FUNCTION public.get_staff_portal_roster(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_staff_portal_roster(text) TO anon, authenticated;

-- End 913_cleaner_pay_basis.
