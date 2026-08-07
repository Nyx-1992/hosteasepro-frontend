-- 919_roadmap_august.sql
-- Runs on BOTH databases.
--
-- Owner: "Let's do an analysis for now what needs to be done and update
-- the roadmap."
--
-- The roadmap is owner-only (892) and lives in the database rather than in
-- a file, so it stays true when the code changes. This brings it up to
-- date with a fortnight of work and, more usefully, writes down the things
-- that are NOT done — including one that quietly disables three features at
-- once.

DO $$
DECLARE org uuid;
BEGIN
  -- The roadmap belongs to the HostEase Pro org, not to S&N — it is the
  -- platform's plan, not an agency's. Derived from the phases table rather
  -- than matched on a name: a name lookup found S&N and failed the foreign
  -- key, which is the good outcome of the two ways that could have gone.
  SELECT DISTINCT org_id INTO org FROM public.roadmap_phases WHERE phase_id = 'p2';
  IF org IS NULL THEN RAISE NOTICE 'No roadmap on this database; nothing touched.'; RETURN; END IF;

  -- ── Shipped since the roadmap was last true ─────────────────────
  --
  -- p2-7 was written before any of it existed. Guesthouses now have
  -- rooms with their own calendars, a room-priced plan track, a daily
  -- cleaning list and a drawn house view (908-913, and the watercolour
  -- renderer). Leaving it open would have made the next planning session
  -- start from a false picture.
  INSERT INTO public.roadmap_state (org_id, task_key, done, updated_at)
  VALUES (org, 'p2-7', true, now())
  ON CONFLICT (org_id, task_key) DO UPDATE SET done = true, updated_at = now();

  -- ── New rows ────────────────────────────────────────────────────
  INSERT INTO public.roadmap_items (org_id, task_key, phase_id, title, note, cat, sort) VALUES

  -- THE ONE THAT BLOCKS THREE FEATURES AT ONCE. Every email the platform
  -- sends — welcome, trial reminders, and now the signup alert — is inert
  -- without RESEND_API_KEY, by design: they ship working and start sending
  -- when the key exists. Which means all three can look built and send
  -- nothing, and the signup alert is the one whose silence is
  -- indistinguishable from "nobody signed up".
  (org, 'p2-50', 'p2', 'Verify email sending is actually live (RESEND_API_KEY + DNS)',
   'Welcome email, the three trial reminders and the new signup alert are all inert until RESEND_API_KEY is set in Vercel and hosteasepro.com is verified in Resend with its DKIM/SPF records at xneelo. Until then they send nothing and report success. Check by signing up a throwaway address; HQ shows a warning if the alert never got out.', 'Business', 50),

  (org, 'p2-51', 'p2', 'Booking site: read rates from the database, not listings.ts',
   'sunsetcoaststays.co.za still prices from a hardcoded TypeScript file, so changing a price is a deploy and the new public-holiday premium never reaches a guest. nightly_rate() and stay_quote() are already granted to anon precisely so a signed-out visitor can be quoted.', 'Website', 51),

  (org, 'p2-52', 'p2', 'Public holidays for countries other than South Africa',
   'seed_sa_holidays() covers ZA for this year and three ahead. An agency anywhere else has an empty holiday calendar and silently gets no premium at all. Needs /api/cron/holidays against date.nager.at, verified from Vercel rather than the sandbox, plus rolling the ZA seed forward each year.', 'HEP', 52),

  (org, 'p2-53', 'p2', 'Hide the nightly rate from non-admin team members',
   'Seasons and the ability to change any rate are owner/admin only (917). properties.base_rate is not, because it sits on a table every org member reads and a column-level REVOKE makes PostgREST reject select=* outright — a host would get a 403 loading the property list rather than a row with two blanks. Needs a view plus a fetch change.', 'Security', 53),

  (org, 'p2-54', 'p2', 'Proofread chiShona and isiXhosa with a first-language speaker',
   'The staff portal ships in four languages. Afrikaans is checked; chiShona and isiXhosa are not, and cleaners will be relying on them to know which house to go to. Worth an hour of somebody''s time before that matters.', 'HEP', 54),

  (org, 'p2-55', 'p2', 'Sync button in the staff portal',
   'Nina could not pull in a new LekkeSlaap booking because the staff portal has no sync at all — the daily cron and the button in Settings both need an admin. Authenticate by portal key plus PIN and give her the same button.', 'HEP', 55),

  -- Done in this stretch, recorded so the phase count means something.
  (org, 'p2-56', 'p2', 'Public holiday rates and a pricing engine',
   'HEP had no concept of a price. Rates now live per property with seasons by month and a percentage premium on public holidays, computed including the Sunday rule. Direct bookings only — iCal is one-way and the platforms set their own prices.', 'HEP', 56),

  (org, 'p2-57', 'p2', 'Tell the owner when somebody signs up',
   'Signup emailed the customer and nobody else, so a new agency could only be found by opening HQ and counting. Now an instant alert, recorded rather than merely sent, with a daily sweep that re-sends anything that failed and a warning in HQ when the email never got out.', 'Business', 57),

  (org, 'p2-58', 'p2', 'Server-side booking sync',
   'The only importer ran in an admin''s browser, so a booking that arrived while nobody had HEP open did not exist. A daily cron plus cron-job.org every fifteen minutes now imports for every agency, and guest data stopped being relayed through a stranger''s public CORS proxy.', 'Architecture', 58)

  ON CONFLICT (org_id, task_key) DO UPDATE
    SET title = EXCLUDED.title, note = EXCLUDED.note, cat = EXCLUDED.cat, sort = EXCLUDED.sort;

  INSERT INTO public.roadmap_state (org_id, task_key, done, updated_at)
  SELECT org, k, true, now() FROM unnest(ARRAY['p2-56','p2-57','p2-58']) k
  ON CONFLICT (org_id, task_key) DO UPDATE SET done = true, updated_at = now();

  RAISE NOTICE 'Roadmap updated for %', org;
END $$;

-- End 919_roadmap_august.

-- ══ ADDENDUM, 7 Aug ═══════════════════════════════════════════════
--
-- p2-50 was written as "verify email sending is actually live", on the
-- reasoning that all three email features are inert without
-- RESEND_API_KEY and could therefore look built while sending nothing.
--
-- Nicole's inbox settles most of it: the welcome email and a trial
-- reminder both arrived, in Gmail's PRIMARY tab rather than spam. That
-- proves two things at once — the key is set, and DKIM/SPF are right,
-- because a domain without them lands in junk. Two of the three features
-- are confirmed live and the item narrows to the third.
--
-- The signup alert is still unproven: different code path, different
-- address, deployed the same day. Hence the test button (p2-59), which
-- asks the question without signing a fake agency up on production and
-- then deleting an org from a live database for the sake of a drill.
DO $$
DECLARE org uuid;
BEGIN
  SELECT DISTINCT org_id INTO org FROM public.roadmap_phases WHERE phase_id = 'p2';
  IF org IS NULL THEN RETURN; END IF;

  UPDATE public.roadmap_items
     SET title = 'Confirm the signup alert reaches info@hosteasepro.com',
         note  = 'Email sending is LIVE — confirmed 7 Aug: the welcome email and a trial reminder both landed in Gmail Primary, not spam, which proves RESEND_API_KEY is set and DKIM/SPF are correct. Those two features are done. What remains is the signup alert, which goes to a different address on a different path: press "Send me a test alert" in HQ. It reports the failure reason if the mailer refuses.'
   WHERE org_id = org AND task_key = 'p2-50';

  INSERT INTO public.roadmap_items (org_id, task_key, phase_id, title, note, cat, sort) VALUES
  (org, 'p2-59', 'p2', 'Test button for the signup alert',
   'Proves the alert channel works without signing a fake agency up on production and then deleting an org from a live database for the sake of a drill. Platform-owner only, checked by the database as the caller; the destination comes from the environment so the endpoint cannot be used to email an arbitrary address.', 'Business', 59)
  ON CONFLICT (org_id, task_key) DO UPDATE
    SET title = EXCLUDED.title, note = EXCLUDED.note, cat = EXCLUDED.cat, sort = EXCLUDED.sort;

  INSERT INTO public.roadmap_state (org_id, task_key, done, updated_at)
  VALUES (org, 'p2-59', true, now())
  ON CONFLICT (org_id, task_key) DO UPDATE SET done = true, updated_at = now();
END $$;
