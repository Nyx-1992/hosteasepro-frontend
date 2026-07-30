-- 690_property_access_details.sql
-- Runs on BOTH databases.
--
-- Moves the guest pre-arrival message content out of demo/index_fixed.html
-- (PRE_ARRIVAL_TVHOUSE / PRE_ARRIVAL_SPERANTA) and into property_manuals
-- as a new 'access' section. Two reasons, one of them urgent:
--
--   1. SECURITY. Those templates contained TV House's real lockbox code,
--      the alarm-disarm instructions and the WiFi name, hardcoded in a
--      file served to every visitor of the app -- readable via View
--      Source without logging in. property_manuals is authenticated +
--      org-scoped (280), and the staff portal's only anon path into it
--      (get_outside_clean_info, 390) returns the 'inventory' section
--      exclusively, so moving them here actually closes the exposure.
--      NOTE: this does not un-publish what was already public -- the
--      codes remain in git history and in previously served pages, so
--      the lockbox code and WiFi password should be ROTATED; changing
--      them is now a data edit here, not a code deploy.
--   2. Scalability (Roadmap p2-18): a new property gets a real
--      pre-arrival message by filling in this section, no code change.
--
-- Content shape ('access' section):
--   welcome / intro / closing  -- prose around the detail list
--   blocks: [{label?, value, tight?}]  -- ordered message body; a block
--     with no label renders as a plain paragraph, and tight:true joins it
--     to the previous line with a single newline instead of a blank line
--     (preserves the existing Keys/Alarm/WiFi grouping exactly).
--   Every field takes an optional _af sibling (welcome_af, label_af,
--   value_af...) for the Afrikaans version, falling back to the English
--   value when absent -- same two-language support the hardcoded
--   templates had, without forcing dual entry for a new property.
--
-- Seeded verbatim from the shipped templates: same wording, same order,
-- same emphasis markers, so what a guest receives does not change.

ALTER TABLE public.property_manuals DROP CONSTRAINT IF EXISTS property_manuals_section_check;
ALTER TABLE public.property_manuals ADD CONSTRAINT property_manuals_section_check
  CHECK (section IN ('inventory','inspection','faq','access'));

-- TV House
INSERT INTO public.property_manuals (org_id, property_id, section, content) VALUES
  ('5966bc67-5c2f-45ae-8519-9b7eaeee09f4', '83b2a84a-5451-4be5-a84f-2efc0d2602d5', 'access', '{"welcome": "Welcome to Tableview Holiday Accommodation! I''m Nina, your Host, and we''re thrilled to have you stay with us.", "welcome_af": "Welkom by Tableview Holiday Accommodation! Ek is Nina, jou Gasheer, en ons is opgewonde dat jy by ons gaan bly.", "intro": "Here are a few details to help you settle in:", "intro_af": "Hier is ''n paar besonderhede om jou te help tuisvoel:", "blocks": [{"label": "Address", "label_af": "Adres", "value": "110 Athens Road, 7441 Tableview, Cape Town", "value_af": "Athenaweg 110, 7441 Tableview, Kaapstad"}, {"label": "Self Check-in", "label_af": "Selfinklok", "value": "Call or WhatsApp *+27 79 977 9455* on arrival and the gate will be opened remotely for you.", "value_af": "Skakel of WhatsApp *+27 79 977 9455* by aankoms en die hek sal van ver af vir jou oopgemaak word."}, {"label": "Keys", "label_af": "Sleutels", "value": "Lockbox at the back of the house — code *7021*", "value_af": "Sleutelkassie agter die huis — kode *7021*"}, {"label": "Alarm", "label_af": "Alarm", "tight": true, "value": "Facing the front door, you''ll see a blue light in the top right corner — press the blue button before entering to disable it, and again when leaving to activate it", "value_af": "Wanneer jy voor die voordeur staan, sal jy ''n blou lig in die boonste regterhoek sien — druk die blou knoppie voordat jy ingaan om dit af te skakel, en weer wanneer jy vertrek om dit te aktiveer"}, {"label": "WiFi", "label_af": "WiFi", "tight": true, "value": "WelcomeToOurHome", "value_af": "WelcomeToOurHome"}, {"value": "Our caretaker lives on the property and is dedicated to respecting your privacy while quietly taking care of things like the bins — nothing for you to worry about there.", "value_af": "Ons opsigter woon op die eiendom en is daartoe verbind om jou privaatheid te respekteer terwyl hy stilweg sorg vir sake soos die vullis — daar hoef jy jou nie oor te bekommer nie."}], "closing": "Don''t hesitate to message us if you need anything. Enjoy your stay! 🏡", "closing_af": "Moenie huiwer om ons te kontak as jy iets nodig het nie. Geniet jou verblyf! 🏡"}'::jsonb)
  ON CONFLICT (property_id, section) DO NOTHING;

-- Speranta Flat
INSERT INTO public.property_manuals (org_id, property_id, section, content) VALUES
  ('5966bc67-5c2f-45ae-8519-9b7eaeee09f4', 'e9737638-d83a-4947-940a-8746789e4d9f', 'access', '{"welcome": "Welcome to our beautiful Blouberg Apartment! We''re thrilled to have you stay with us and hope you enjoy your time here.", "welcome_af": "Welkom by ons pragtige Blouberg-woonstel! Ons is opgewonde dat jy by ons gaan bly en hoop jy geniet jou tyd hier.", "intro": "Here are a few details to help you settle in:", "intro_af": "Hier is ''n paar besonderhede om jou te help tuisvoel:", "blocks": [{"label": "Address", "label_af": "Adres", "value": "You''ll find the apartment in the Speranta Complex — 35 Athens Road Unit 5, Floor 1, Speranta Complex, Cape Town, Western Cape 7439, South Africa. Don''t worry about parking — we have an allocated spot just for you, and there''s a lift for your convenience!", "value_af": "Jy sal die woonstel in die Speranta-kompleks vind — Athenaweg 35 Eenheid 5, Vloer 1, Speranta-kompleks, Kaapstad, Wes-Kaap 7439, Suid-Afrika. Moenie oor parkering bekommerd wees nie — ons het ''n toegewese plek net vir jou, en daar is ''n hysbak vir jou gerief!"}, {"label": "Check-in/Out", "label_af": "Intrek/Uittrek", "value": "Check-in is from 3:00 PM, and check-out is by 10:00 AM. If you''d like to extend your stay, please let us know at least a day in advance so we can check availability.", "value_af": "Intrektyd is vanaf 15:00, en uittrektyd is voor 10:00. Indien jy jou verblyf wil verleng, laat weet ons asseblief minstens ''n dag vooraf sodat ons beskikbaarheid kan bevestig."}, {"value": "To ensure a smooth check-in, could you please send us your ETA so we can make sure to be available for you?", "value_af": "Om ''n vlot inklok te verseker, kan jy asseblief jou beraamde aankomstyd vir ons stuur sodat ons kan verseker dat ons beskikbaar is om jou in te laat?"}, {"value": "We use a Smart Lock for the apartment — your code is *[CODE]*.\nSimply tap the middle of the lock to wake it, enter your code, then press *#*.", "value_af": "Ons gebruik ''n Slotslot vir die woonstel — jou kode is *[CODE]*.\nTik eenvoudig in die middel van die slot om dit te aktiveer, voer jou kode in, gevolg deur *#*."}], "closing": "Don''t hesitate to message us if you need anything. Enjoy your stay! 🌊", "closing_af": "Moenie huiwer om ons te kontak as jy iets nodig het nie. Geniet jou verblyf! 🌊"}'::jsonb)
  ON CONFLICT (property_id, section) DO NOTHING;

-- End 690_property_access_details.
