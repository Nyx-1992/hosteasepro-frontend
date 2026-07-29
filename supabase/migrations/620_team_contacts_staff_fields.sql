-- 620_team_contacts_staff_fields.sql
-- Runs on BOTH databases.
--
-- Extends team_contacts (520_team_contacts.sql) with cleaner-specific
-- fields backing the new Staff tab (Admin), so cleaner rate/payment/
-- properties/birthday live in the DB instead of the hardcoded CLEANERS
-- array in demo/index_fixed.html (removed alongside this migration).
--
-- cleaner_rate is jsonb, not numeric, because a cleaner's rate can be a
-- single flat number (Blessing: 350) or per-property (Fatima: {speranta:
-- 350, tvhouse:450}) — matches the shape the old CLEANERS array already
-- used. NULL for non-cleaner domestic entries (Tino/Keithy — caretakers,
-- not assignable cleaners), which the UI uses to distinguish "assignable
-- cleaner" from "other domestic-category contact".
--
-- Backfill transcribes CLEANERS's data as-is (nothing invented), matched
-- to team_contacts by first-name prefix since team_contacts stores full
-- names (e.g. "Patricia Mutizwa") where CLEANERS used short names
-- ("Patricia"). Also backfills Tino & Keithy's birthdays, previously only
-- readable from their free-text note field. Guarded so a second run is a
-- no-op, same pattern as 550_business_vault_seed.sql.

ALTER TABLE public.team_contacts
  ADD COLUMN IF NOT EXISTS cleaner_rate jsonb,
  ADD COLUMN IF NOT EXISTS cleaner_payment text,
  ADD COLUMN IF NOT EXISTS cleaner_properties text[],
  ADD COLUMN IF NOT EXISTS birthday date;

UPDATE public.team_contacts SET
  cleaner_rate = '350'::jsonb,
  cleaner_payment = 'ewallet',
  cleaner_properties = ARRAY['speranta'],
  birthday = '1988-03-14'
WHERE org_id = '5966bc67-5c2f-45ae-8519-9b7eaeee09f4' AND cat = 'domestic' AND name LIKE 'Blessing%' AND cleaner_rate IS NULL;

UPDATE public.team_contacts SET
  cleaner_rate = '{"speranta":350,"tvhouse":450}'::jsonb,
  cleaner_payment = 'ewallet',
  cleaner_properties = ARRAY['speranta','tvhouse'],
  birthday = '1992-07-22'
WHERE org_id = '5966bc67-5c2f-45ae-8519-9b7eaeee09f4' AND cat = 'domestic' AND name LIKE 'Fatima%' AND cleaner_rate IS NULL;

UPDATE public.team_contacts SET
  cleaner_rate = '{"speranta":350,"tvhouse":450}'::jsonb,
  cleaner_payment = 'eft',
  cleaner_properties = ARRAY['speranta','tvhouse'],
  birthday = '1985-11-05'
WHERE org_id = '5966bc67-5c2f-45ae-8519-9b7eaeee09f4' AND cat = 'domestic' AND name LIKE 'Patricia%' AND cleaner_rate IS NULL;

UPDATE public.team_contacts SET
  cleaner_rate = '350'::jsonb,
  cleaner_payment = 'ewallet',
  cleaner_properties = ARRAY['speranta'],
  birthday = '1990-09-18'
WHERE org_id = '5966bc67-5c2f-45ae-8519-9b7eaeee09f4' AND cat = 'domestic' AND name LIKE 'Spiwe%' AND cleaner_rate IS NULL;

-- Tino & Keithy: caretakers, not assignable cleaners — birthday only,
-- cleaner_rate stays NULL so they don't show up as assignable in the
-- cleaner picker.
UPDATE public.team_contacts SET birthday = '1996-07-13'
WHERE org_id = '5966bc67-5c2f-45ae-8519-9b7eaeee09f4' AND cat = 'domestic' AND name = 'Takudzwa Dumbura' AND birthday IS NULL;

UPDATE public.team_contacts SET birthday = '1997-02-09'
WHERE org_id = '5966bc67-5c2f-45ae-8519-9b7eaeee09f4' AND cat = 'domestic' AND name = 'Keithy Ngwenya' AND birthday IS NULL;

-- End 620_team_contacts_staff_fields.
