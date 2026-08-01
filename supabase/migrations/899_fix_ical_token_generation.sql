-- 899_fix_ical_token_generation.sql
-- Runs on BOTH databases. FIXES A BREAKAGE INTRODUCED BY 898.
--
-- 898 pinned search_path = public, pg_temp on every function in public,
-- to satisfy the linter. new_ical_token() calls gen_random_bytes(), which
-- is pgcrypto and lives in the EXTENSIONS schema — so pinning the path
-- put it out of reach and the function started failing:
--
--   ERROR: function gen_random_bytes(integer) does not exist
--   CONTEXT: SQL function "new_ical_token" during startup
--            PL/pgSQL function set_property_ical_token()
--            SQL statement "INSERT INTO public.properties ..."
--
-- That trigger fires on every property insert, so ADDING A PROPERTY was
-- failing outright on both databases. Nobody had hit it yet only because
-- nobody had added a property in the hour between the two migrations.
--
-- Caught by replaying api/signup.js's writes against staging rather than
-- by anything in the app — which is the argument for doing that replay
-- after a batch of schema changes, not before shipping and hoping.
--
-- THE FIX, and why not the obvious one. Adding `extensions` to the
-- search_path would work and would leave the same trap for the next
-- function. Schema-qualifying as extensions.gen_random_bytes() would
-- work and hard-codes where Supabase happens to install pgcrypto.
--
-- gen_random_uuid() is built into Postgres itself — no extension, no
-- schema question — and stripping its hyphens gives exactly the same
-- thing the old code produced: 32 lowercase hex characters. So the
-- dependency goes away rather than being routed around, and every token
-- already issued stays valid and still matches the endpoint's pattern.
CREATE OR REPLACE FUNCTION public.new_ical_token()
RETURNS text LANGUAGE sql VOLATILE SET search_path = public, pg_temp AS $$
  SELECT replace(gen_random_uuid()::text, '-', '');
$$;

-- Prove it: this fails loudly at migration time rather than silently at
-- the next property insert.
DO $$
DECLARE t text;
BEGIN
  t := public.new_ical_token();
  IF t !~ '^[a-f0-9]{32}$' THEN
    RAISE EXCEPTION 'new_ical_token() produced %, which the feed endpoint will not accept', t;
  END IF;
END $$;

-- End 899_fix_ical_token_generation.
