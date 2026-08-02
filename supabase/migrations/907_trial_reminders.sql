-- 907_trial_reminders.sql
-- Runs on BOTH databases.
--
-- Owner: "Test HEP I want to leave open to test the reminder after 7 days
-- etc." — said about a reminder that did not exist. signup.js sets a
-- seven-day trial and nothing has ever told anyone it was ending. They
-- would simply find the app read-only one morning, with no warning and no
-- explanation, which is the worst possible first experience of billing.
--
-- ══ WHAT HAPPENS AT THE END, SO THE EMAIL CAN SAY IT ══════════════
--
-- Nothing dramatic, by design. 880 made a lapsed subscription mean READ
-- EVERYTHING, WRITE NOTHING: the agency keeps full access to its own
-- bookings, guests, cleaning history and reports, and simply cannot add or
-- change anything until the subscription is live again. The owner's rule
-- was "definitely limited view, but not lock out."
--
-- That matters here because the emails must describe the real thing. An
-- email that implies data loss to create urgency would be a lie, and the
-- first one lands on somebody who has been using the product for four
-- days and is deciding whether to trust it.
--
-- ══ WHY THE TRIAL END DATE IS PART OF THE KEY ═════════════════════
--
-- Reminders are recorded so a cron that runs twice, or a deploy that
-- re-triggers it, cannot send the same email again. But the obvious key
-- (org, kind) is wrong: extend a trial from HQ and the customer would
-- never be reminded again, because 't1' was already "sent" — for a
-- deadline that no longer exists. Keying on the END DATE too means
-- extending a trial naturally re-arms the whole sequence.

CREATE TABLE IF NOT EXISTS public.trial_reminders (
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind          text NOT NULL,           -- t3 | t1 | t0
  trial_ends_on date NOT NULL,
  sent_at       timestamptz NOT NULL DEFAULT now(),
  to_email      text,
  PRIMARY KEY (org_id, kind, trial_ends_on)
);

-- 880 attaches its "you cannot write, your subscription lapsed" trigger to
-- every public table carrying an org_id, discovered by loop. This one has
-- one, and gating it on the customer's own subscription state would block
-- writing the record of the email that tells them their subscription
-- lapsed — for precisely the orgs the table exists to serve.
DROP TRIGGER IF EXISTS subscription_write_gate ON public.trial_reminders;

ALTER TABLE public.trial_reminders ENABLE ROW LEVEL SECURITY;
-- No policy at all: nothing signed in should read or write this. The cron
-- uses the service role, which bypasses RLS.
REVOKE ALL ON public.trial_reminders FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.trial_reminders IS
  'One row per reminder actually sent. Keyed on the trial end date as well as the kind, so extending a trial re-arms the sequence instead of permanently marking it done.';

-- ══ WHO IS DUE ════════════════════════════════════════════════════
--
-- AT MOST ONE EMAIL PER AGENCY PER RUN. The kind is chosen by picking the
-- most urgent band that applies, rather than emitting a row per band —
-- otherwise a customer whose t3 failed yesterday gets t3 and t1 in the
-- same morning, which reads as a system talking to itself.
--
-- The 3-day band is 2..3 days rather than exactly 3, so a cron that misses
-- a day still catches it. The expiry band is "0 or fewer", and repeats are
-- prevented by the table rather than by the window being narrow.
CREATE OR REPLACE FUNCTION public.trial_reminders_due()
RETURNS TABLE (
  org_id        uuid,
  org_name      text,
  owner_name    text,
  owner_email   text,
  portal_key    text,
  kind          text,
  days_left     int,
  trial_ends_at timestamptz,
  trial_ends_on date
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH t AS (
    SELECT o.id, o.name, o.portal_key, s.trial_ends_at,
           (s.trial_ends_at AT TIME ZONE 'UTC')::date AS ends_on,
           ((s.trial_ends_at AT TIME ZONE 'UTC')::date - CURRENT_DATE)::int AS days_left
      FROM public.organizations o
      JOIN public.org_subscriptions s ON s.org_id = o.id
     WHERE s.status = 'trialing'
       AND s.trial_ends_at IS NOT NULL
       -- A comped account is not on a clock, whatever the status says.
       AND s.plan <> 'founder'
       -- HEP is not its own customer.
       AND o.id IS DISTINCT FROM (SELECT platform_org_id FROM public.platform_settings)
  ),
  banded AS (
    SELECT t.*,
           CASE WHEN days_left <= 0 THEN 't0'
                WHEN days_left = 1  THEN 't1'
                WHEN days_left <= 3 THEN 't3'
                ELSE NULL END AS kind
      FROM t
  ),
  owner AS (
    SELECT b.*, p.name AS owner_name, au.email::text AS owner_email
      FROM banded b
      LEFT JOIN LATERAL (
        SELECT p.id, p.name FROM public.profiles p
         WHERE p.org_id = b.id AND p.role = 'owner'
         ORDER BY p.name LIMIT 1
      ) p ON true
      LEFT JOIN auth.users au ON au.id = p.id
  )
  SELECT o.id, o.name, o.owner_name, o.owner_email, o.portal_key,
         o.kind, o.days_left, o.trial_ends_at, o.ends_on
    FROM owner o
   WHERE o.kind IS NOT NULL
     -- Nobody to write to. Silence is correct; a signup with no owner
     -- profile is a data problem, not a person waiting for an email.
     AND o.owner_email IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.trial_reminders r
        WHERE r.org_id = o.id AND r.kind = o.kind AND r.trial_ends_on = o.ends_on
     )
   ORDER BY o.days_left;
$$;

COMMENT ON FUNCTION public.trial_reminders_due() IS
  'Agencies whose trial needs a reminder today, at most one row each — most urgent band wins. Excludes anything already sent for this end date, so extending a trial re-arms it.';

-- Only the cron. Not anon, not authenticated: this returns customer email
-- addresses, and the console's rule is counts, never contents.
REVOKE ALL ON FUNCTION public.trial_reminders_due() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trial_reminders_due() TO service_role;

-- ══ THE SAME LIST, FOR HQ ═════════════════════════════════════════
--
-- So the owner can see what is going out tonight without triggering it,
-- and without needing the cron secret. Deliberately narrower than the
-- version above: no email addresses, because HQ shows counts and names,
-- and there is no reason for a screen to carry an address just to say a
-- reminder is queued.
CREATE OR REPLACE FUNCTION public.platform_trials_due()
RETURNS TABLE (org_name text, kind text, days_left int, trial_ends_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT d.org_name, d.kind, d.days_left, d.trial_ends_at
    FROM public.trial_reminders_due() d
   WHERE public.is_platform_owner()
   ORDER BY d.days_left;
$$;

COMMENT ON FUNCTION public.platform_trials_due() IS
  'What the nightly trial-reminder run will send, for display in HQ. Names and dates only — no email addresses.';

REVOKE ALL ON FUNCTION public.platform_trials_due() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_trials_due() TO authenticated;

-- End 907_trial_reminders.
