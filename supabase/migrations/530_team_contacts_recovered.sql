-- 530_team_contacts_recovered.sql
-- Runs on BOTH databases.
--
-- Recovers 5 real contacts the owner added through the OLD Add Contact
-- form (before 520_team_contacts.sql existed) — that version wrote to
-- browser localStorage only, never to a database, so switching the app
-- over to public.team_contacts made these invisible even though they'd
-- been entered correctly. Retrieved by having the owner read
-- localStorage.getItem('hep_contacts') back from the browser they were
-- entered on, and transcribed here as-is, nothing invented.
--
-- Guarded with WHERE NOT EXISTS (matched by org + name) rather than the
-- plain ON CONFLICT DO NOTHING 520 used, since this table's only unique
-- constraint is its uuid primary key (always freshly generated on insert)
-- — a plain ON CONFLICT clause never actually matches anything, so a
-- second accidental run of a seed file would silently duplicate every
-- row. This form is safe to run more than once.

INSERT INTO public.team_contacts (org_id, cat, name, role, phone, email, wa, note, initials, sub_contacts, sort_order)
SELECT '5966bc67-5c2f-45ae-8519-9b7eaeee09f4', 'supplier', 'Shabbir Star Furniture', 'Upholstery', '+27 81 799 8135', '', '+27 81 799 8135', '7 Parklands Main Road, Tableview', 'SS', '[{"name":"Shabbir","phone":"","email":""}]'::jsonb, 3
WHERE NOT EXISTS (SELECT 1 FROM public.team_contacts WHERE org_id = '5966bc67-5c2f-45ae-8519-9b7eaeee09f4' AND name = 'Shabbir Star Furniture');

INSERT INTO public.team_contacts (org_id, cat, name, role, phone, email, wa, note, initials, sub_contacts, sort_order)
SELECT '5966bc67-5c2f-45ae-8519-9b7eaeee09f4', 'supplier', 'Collins Mutizwa', 'Maintenaince, Paitning & co', '+27 73 550 1129', '', '+27 73 550 1129', 'Patricia''s husband', 'CM', '[{"name":"Collins","phone":"","email":""}]'::jsonb, 4
WHERE NOT EXISTS (SELECT 1 FROM public.team_contacts WHERE org_id = '5966bc67-5c2f-45ae-8519-9b7eaeee09f4' AND name = 'Collins Mutizwa');

INSERT INTO public.team_contacts (org_id, cat, name, role, phone, email, wa, note, initials, sub_contacts, sort_order)
SELECT '5966bc67-5c2f-45ae-8519-9b7eaeee09f4', 'supplier', 'Jake', 'Carpet & Curtain Cleaner', '+27 60 519 7670', '', '+27 60 519 7670', 'Trusted carpet & curtain cleaner - can enter with a code by himself', 'J', '[{"name":"Jake","phone":"","email":""}]'::jsonb, 5
WHERE NOT EXISTS (SELECT 1 FROM public.team_contacts WHERE org_id = '5966bc67-5c2f-45ae-8519-9b7eaeee09f4' AND name = 'Jake' AND cat = 'supplier');

INSERT INTO public.team_contacts (org_id, cat, name, role, phone, email, wa, note, initials, sub_contacts, sort_order)
SELECT '5966bc67-5c2f-45ae-8519-9b7eaeee09f4', 'maintenance', 'AAA Locksmith', 'Locksmith', '+27 78 374 5582', 'info@aaalocksmith.co.za', '+27 78 374 5582', 'Set up our smart & cupboard locks in Speranta', 'AL', '[{"name":"Kobus","phone":"","email":""}]'::jsonb, 2
WHERE NOT EXISTS (SELECT 1 FROM public.team_contacts WHERE org_id = '5966bc67-5c2f-45ae-8519-9b7eaeee09f4' AND name = 'AAA Locksmith');

INSERT INTO public.team_contacts (org_id, cat, name, role, phone, email, wa, note, initials, sub_contacts, sort_order)
SELECT '5966bc67-5c2f-45ae-8519-9b7eaeee09f4', 'supplier', 'Laundry Inc', 'Laudry Service', '+27 76 018 7641', '', '', '[www.laundryinc,co,za](https://www.laundryinc,co,za)', 'LI', '[{"name":"Dean Lotz","phone":"","email":""}]'::jsonb, 6
WHERE NOT EXISTS (SELECT 1 FROM public.team_contacts WHERE org_id = '5966bc67-5c2f-45ae-8519-9b7eaeee09f4' AND name = 'Laundry Inc');

-- End 530_team_contacts_recovered.
