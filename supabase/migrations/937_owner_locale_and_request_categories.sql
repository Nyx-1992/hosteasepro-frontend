-- Two things the owners' first real use of the portal exposed.
--
-- ══ 1. THE LANGUAGE PICKER NEVER SAVED ════════════════════════════════
--
-- Owner: "I changed it to german for me, when refreshing the page it got
-- back to czech."
--
-- setClientLocale() writes profiles.locale, and `profiles` has exactly one
-- policy on it:
--
--     profiles_select_own   SELECT   using (auth.uid() = id)
--
-- No UPDATE policy at all. PostgREST reports an update matching zero rows
-- as success, so the write returned no error, the picker worked for the
-- rest of the session, and the next page load read Czech back out of the
-- database. It has never saved for anybody.
--
-- NOT FIXED BY ADDING `FOR UPDATE USING (auth.uid() = id)`. That is the
-- obvious one line, and it would let any client set their own role to
-- 'owner' and their org_id to the agency's — is_org_member() keys off that
-- row, so a property owner could hand themselves the whole agency. RLS
-- cannot restrict which COLUMNS a policy lets through.
--
-- So: one function that writes one column, for the caller's own row only,
-- and refuses a locale that is not one we ship.

CREATE OR REPLACE FUNCTION public.set_my_locale(p_locale text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not signed in';
  END IF;
  -- The list the client dashboard offers. An unknown value would fall back
  -- to English on every load, which looks exactly like this bug.
  IF p_locale NOT IN ('en','de','pl','es','cs','fr','nl','af','it','pt') THEN
    RAISE EXCEPTION 'unknown locale %', p_locale;
  END IF;
  UPDATE public.profiles SET locale = p_locale WHERE id = auth.uid();
END $$;

REVOKE ALL ON FUNCTION public.set_my_locale(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_locale(text) TO authenticated;

COMMENT ON FUNCTION public.set_my_locale(text) IS
  'Sets the caller''s own display language. Exists because profiles has no UPDATE policy, and must not get one: a blanket update would let a client rewrite their own role and org_id.';

-- ══ 2. A REQUEST HAS A SUBJECT ════════════════════════════════════════
--
-- Owner: "we would like to give them the opportunity to log some kind of
-- requests, which can be for some specific category and we then get it
-- flagged on our end too."
--
-- The categories are taken from the email the TV House owners actually
-- sent on 6 November, not invented: the pool running all day and the
-- decayed control box, irrigation spraying the walls and terrace, the
-- bathroom/floors/lights/stove knobs, the garage and the missing towels,
-- the sun sail removed from the terrace, guests holding garage keys and
-- the front door left unlocked, and one line on an invoice they did not
-- understand. Every one of those lands in a bucket below, which is the
-- test of whether the list is real.
--
-- Nullable, and no default. A question that does not fit a category is
-- still a question, and forcing a guess would make the filter lie.

ALTER TABLE public.owner_queries
  ADD COLUMN IF NOT EXISTS category text;

COMMENT ON COLUMN public.owner_queries.category IS
  'What the request is about: maintenance | pool | garden | cleaning | access | utilities | invoice | booking | meeting | other. Null is allowed — an uncategorised question is still a question.';

CREATE INDEX IF NOT EXISTS owner_queries_category_idx
  ON public.owner_queries (org_id, category, status)
  WHERE category IS NOT NULL;
