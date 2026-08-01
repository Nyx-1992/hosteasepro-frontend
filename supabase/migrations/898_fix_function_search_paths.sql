-- 898_fix_function_search_paths.sql
-- Runs on BOTH databases.
--
-- Two functions added in the last few migrations went out without a
-- fixed search_path — property_slug() from 894 and new_ical_token() from
-- 897. Supabase's own linter caught both.
--
-- 890 did this sweep for every trigger function and I then wrote two new
-- functions without applying its lesson, because the sweep was written
-- to catch functions RETURNING trigger and these two return text. The
-- fix is the same one line; the point worth remembering is that a
-- one-time sweep does not keep a rule true, so this migration re-runs it
-- over EVERY function in public rather than naming the two.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prokind = 'f'
       -- Functions installed BY AN EXTENSION belong to the extension, not
       -- to us: staging carries postgres_fdw, whose handler lives in
       -- public and cannot be altered by the migration role. Skip anything
       -- with an extension dependency rather than failing the whole sweep
       -- on somebody else's function.
       AND NOT EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.objid = p.oid AND d.deptype = 'e')
       AND (p.proconfig IS NULL OR NOT EXISTS (
             SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'))
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.sig);
    RAISE NOTICE 'pinned search_path on %', r.sig;
  END LOOP;
END $$;

-- End 898_fix_function_search_paths.
