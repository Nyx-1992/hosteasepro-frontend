-- A record of signup attempts, so the endpoint can refuse a flood.
--
-- 24-25 November: eighteen accounts were registered on the platform in a
-- day — curl, python-requests, Python-urllib and a headless browser, from
-- eighteen different IP addresses. Several used hosteasepro.com itself as
-- their email domain. One of them went on to plant a script in a booking's
-- guest name that drew a fake Booking.com login over the owner's admin
-- page.
--
-- PER-IP LIMITING ALONE WOULD NOT HAVE STOPPED IT. Every attempt came
-- from a different address, so a per-IP counter would have seen one
-- attempt each and waved all eighteen through. That is why there is a
-- global ceiling as well: a real agency platform at this stage does not
-- see twenty signups in an hour, and if it ever does, an hour of a
-- "try again shortly" message costs far less than another day like this
-- one.
--
-- EMAILS ARE HASHED. The point of the row is "has this address tried
-- recently", which a hash answers. Keeping the addresses themselves would
-- build a list of everyone who ever failed to sign up — including their
-- typos — for no gain.
--
-- NOT RLS-READABLE BY ANYBODY. No policies are created and the grants are
-- revoked, so only the service role behind the signup endpoint can see or
-- write this. It is operational data about abuse, not application data.

CREATE TABLE IF NOT EXISTS public.signup_attempts (
  id         bigserial PRIMARY KEY,
  ip         text,
  email_hash text,
  outcome    text NOT NULL DEFAULT 'attempt',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.signup_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.signup_attempts FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.signup_attempts_id_seq FROM anon, authenticated;

-- Every lookup is "recent attempts, by ip or by email", so one index on
-- the time column carries all three counts at this size.
CREATE INDEX IF NOT EXISTS signup_attempts_recent_idx
  ON public.signup_attempts (created_at DESC);

COMMENT ON TABLE public.signup_attempts IS
  'One row per self-serve signup attempt, used to rate-limit the public endpoint. Service role only. Emails are stored as a hash: the question is "has this address tried recently", which does not need the address.';
COMMENT ON COLUMN public.signup_attempts.outcome IS
  'attempt = accepted and an org was created; blocked_ip / blocked_email / blocked_global / blocked_domain = refused, and why.';
