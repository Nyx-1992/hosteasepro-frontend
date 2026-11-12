-- The owner portal gets two things it has never had: documents we send
-- THEM, and a way to ask us something.
--
-- Owner: "I want to work today on the access for the customer facing side
-- (TV House owners) so they can interact with the platform to us. I want the
-- bills uploaded for them and any report from Nina. I need the invoices and
-- also COCs we got saved under some document file. Most importantly they
-- should be able to raise queries through that instead of bombarding us via
-- WhatsApp."
--
-- THE TV HOUSE OWNERS ALREADY HAVE A LOGIN. info@vineamea.cz, created
-- 31 July. They signed in once, on 1 August, and never came back. The
-- portal shows them income, occupancy, a calendar, Nina's inspections and
-- their cleaning count — all of it read-only, none of it a reason to return.
-- There is nothing to collect and nobody to talk to. WhatsApp is not
-- competing with this portal; it is the only channel that exists.
--
-- ══ PART 1 — DOCUMENTS THEY CAN COLLECT ═══════════════════════════════
--
-- finance_documents already holds files against a property, in a private
-- bucket, with signed links minted per view. What it has never had is a way
-- to say "the owner may see this one". The only client-facing policy on it
-- is uploaded_by = auth.uid() — an owner can see what they themselves sent
-- us, and nothing we sent them.
--
-- client_visible is opt-in and defaults to false, because this table also
-- holds our platform statements and our own expense slips. A column that
-- defaulted to true would publish the agency's books to every owner the
-- moment it shipped.
--
-- AND IT FIXES A LIVE BUG WHILE IT IS HERE. doc_type has allowed only
-- invoice / statement / other. The expenses screen has been inserting
-- doc_type 'receipt' since receipts shipped, and two RLS policies filter on
-- doc_type = 'receipt' — a type the CHECK rejects. Every slip attached to a
-- logged spend has failed to file, silently except for a toast, which is why
-- there are five documents in this table and all five are statements.

ALTER TABLE public.finance_documents
  DROP CONSTRAINT IF EXISTS finance_documents_doc_type_check;
ALTER TABLE public.finance_documents
  ADD CONSTRAINT finance_documents_doc_type_check
  CHECK (doc_type = ANY (ARRAY[
    'invoice'::text,    -- an invoice we issued
    'statement'::text,  -- a platform payout statement
    'receipt'::text,    -- a slip attached to a logged spend
    'bill'::text,       -- a bill paid on the owner's behalf
    'coc'::text,        -- certificate of compliance (electrical, gas, plumbing)
    'report'::text,     -- an inspection or condition report
    'other'::text]));

ALTER TABLE public.finance_documents
  ADD COLUMN IF NOT EXISTS client_visible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shared_at      timestamptz;

COMMENT ON COLUMN public.finance_documents.client_visible IS
  'Opt-in: the property owner may see and download this document in their portal. Default false — this table also holds the agency''s own statements and expense slips.';
COMMENT ON COLUMN public.finance_documents.shared_at IS
  'When it was first shared with the owner. Null until it is.';

CREATE INDEX IF NOT EXISTS finance_documents_client_visible_idx
  ON public.finance_documents (property_id, doc_date DESC)
  WHERE client_visible;

-- property_id on this table is the short key ('tvhouse'), not a uuid, so
-- this is client_property_KEYS, not client_property_uuids. Using the wrong
-- one fails open to nothing rather than to everything, but it fails.
DROP POLICY IF EXISTS finance_documents_client_shared_select ON public.finance_documents;
CREATE POLICY finance_documents_client_shared_select
  ON public.finance_documents FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND client_visible
    AND property_id = ANY (public.client_property_keys())
  );

-- The row is not the file. Without a matching storage policy the owner sees
-- a document listed and gets "Object not found" when they tap it, because
-- the bucket is private and the existing client policy only covers objects
-- they uploaded themselves.
DROP POLICY IF EXISTS finance_documents_storage_client_shared_select ON storage.objects;
CREATE POLICY finance_documents_storage_client_shared_select
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'finance-documents'
    AND auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM public.finance_documents fd
       WHERE fd.file_path = storage.objects.name
         AND fd.client_visible
         AND fd.property_id = ANY (public.client_property_keys())
    )
  );

-- ══ PART 2 — ASKING US SOMETHING ══════════════════════════════════════
--
-- A thread, not a message. "Why is November lower than October?" is a
-- conversation, and the thing WhatsApp does that email does not is keep the
-- back-and-forth in one place. The one thing WhatsApp cannot do is carry the
-- document the question is about, which is what about_document_id is for.

CREATE TABLE IF NOT EXISTS public.owner_queries (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id       uuid NOT NULL REFERENCES public.properties(id)    ON DELETE CASCADE,
  raised_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  raised_by_name    text,
  subject           text NOT NULL,
  status            text NOT NULL DEFAULT 'open'
                    CHECK (status = ANY (ARRAY['open'::text,'answered'::text,'closed'::text])),
  about_document_id uuid REFERENCES public.finance_documents(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  last_message_at   timestamptz NOT NULL DEFAULT now(),
  last_message_side text NOT NULL DEFAULT 'client'
                    CHECK (last_message_side = ANY (ARRAY['client'::text,'agency'::text]))
);

CREATE TABLE IF NOT EXISTS public.owner_query_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_id    uuid NOT NULL REFERENCES public.owner_queries(id) ON DELETE CASCADE,
  author_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name text,
  -- Which side of the conversation. NOT taken on trust: the insert policy
  -- below makes the database check that whoever claims to be the agency is
  -- actually a member of the agency.
  author_side text NOT NULL CHECK (author_side = ANY (ARRAY['client'::text,'agency'::text])),
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS owner_queries_org_idx
  ON public.owner_queries (org_id, status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS owner_queries_property_idx
  ON public.owner_queries (property_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS owner_query_messages_thread_idx
  ON public.owner_query_messages (query_id, created_at);

-- The query belongs to the property's org, whatever the client's browser
-- said. Without this an owner could file their question into another
-- agency's inbox by sending a different org_id.
CREATE OR REPLACE FUNCTION public.owner_query_set_org()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  SELECT p.org_id INTO NEW.org_id FROM public.properties p WHERE p.id = NEW.property_id;
  IF NEW.org_id IS NULL THEN
    RAISE EXCEPTION 'property % has no org', NEW.property_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS owner_queries_set_org ON public.owner_queries;
CREATE TRIGGER owner_queries_set_org
  BEFORE INSERT ON public.owner_queries
  FOR EACH ROW EXECUTE FUNCTION public.owner_query_set_org();

-- Posting a message moves the thread. SECURITY DEFINER so a client can
-- reply without being granted UPDATE on owner_queries — the only writes
-- they need are their own messages.
--
-- A reply from the owner reopens a closed thread rather than disappearing
-- into it. That is the whole promise being made here: say something and
-- somebody sees it.
CREATE OR REPLACE FUNCTION public.owner_query_touch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  UPDATE public.owner_queries
     SET last_message_at   = NEW.created_at,
         last_message_side = NEW.author_side,
         status            = CASE WHEN NEW.author_side = 'client'
                                  THEN 'open' ELSE 'answered' END
   WHERE id = NEW.query_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS owner_query_messages_touch ON public.owner_query_messages;
CREATE TRIGGER owner_query_messages_touch
  AFTER INSERT ON public.owner_query_messages
  FOR EACH ROW EXECUTE FUNCTION public.owner_query_touch();

-- Either side can close a thread. The owner has no UPDATE on the table, so
-- theirs goes through here, which checks they are who they would have to be.
CREATE OR REPLACE FUNCTION public.owner_query_set_status(p_id uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $$
DECLARE v_org uuid; v_prop uuid;
BEGIN
  IF p_status NOT IN ('open','answered','closed') THEN
    RAISE EXCEPTION 'unknown status %', p_status;
  END IF;
  SELECT org_id, property_id INTO v_org, v_prop
    FROM public.owner_queries WHERE id = p_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'no such query';
  END IF;
  IF NOT (public.is_org_member(v_org)
          OR v_prop = ANY (public.client_property_uuids())) THEN
    RAISE EXCEPTION 'not permitted';
  END IF;
  UPDATE public.owner_queries SET status = p_status WHERE id = p_id;
END $$;

REVOKE ALL ON FUNCTION public.owner_query_set_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_query_set_status(uuid, text) TO authenticated;

-- Supabase grants anon ALL on every new public table, so a new table is
-- open until somebody revokes. RLS alone would already deny anon here —
-- there is no policy that lets them in — but these threads are a property
-- owner's private correspondence with their agency, and "the policies
-- happen to cover it" is a thinner guarantee than "the role cannot reach
-- the table".
REVOKE ALL ON TABLE public.owner_queries        FROM anon;
REVOKE ALL ON TABLE public.owner_query_messages FROM anon;

ALTER TABLE public.owner_queries         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_query_messages  ENABLE ROW LEVEL SECURITY;

-- Both sides of the conversation can read it. Nobody else can.
DROP POLICY IF EXISTS owner_queries_select ON public.owner_queries;
CREATE POLICY owner_queries_select ON public.owner_queries FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (public.is_org_member(org_id)
         OR property_id = ANY (public.client_property_uuids()))
  );

DROP POLICY IF EXISTS owner_queries_insert ON public.owner_queries;
CREATE POLICY owner_queries_insert ON public.owner_queries FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND raised_by = auth.uid()
    AND (public.is_org_member(org_id)
         OR property_id = ANY (public.client_property_uuids()))
  );

-- The agency edits the thread itself (status, subject). The owner changes
-- status through owner_query_set_status and nothing else.
DROP POLICY IF EXISTS owner_queries_update ON public.owner_queries;
CREATE POLICY owner_queries_update ON public.owner_queries FOR UPDATE
  USING (auth.role() = 'authenticated' AND public.is_org_member(org_id));

DROP POLICY IF EXISTS owner_query_messages_select ON public.owner_query_messages;
CREATE POLICY owner_query_messages_select ON public.owner_query_messages FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM public.owner_queries q
       WHERE q.id = query_id
         AND (public.is_org_member(q.org_id)
              OR q.property_id = ANY (public.client_property_uuids()))
    )
  );

-- WHO YOU SAY YOU ARE HAS TO BE WHO YOU ARE. author_side arrives from a
-- browser, and a reply marked 'agency' is rendered as an answer FROM US. So
-- the side is checked against the caller's actual relationship to the
-- thread: org members may only speak as the agency, the property's owner may
-- only speak as the client, and nobody else may post at all.
DROP POLICY IF EXISTS owner_query_messages_insert ON public.owner_query_messages;
CREATE POLICY owner_query_messages_insert ON public.owner_query_messages FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.owner_queries q
       WHERE q.id = query_id
         AND ((author_side = 'agency' AND public.is_org_member(q.org_id))
           OR (author_side = 'client' AND q.property_id = ANY (public.client_property_uuids())))
    )
  );

GRANT SELECT, INSERT         ON public.owner_query_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.owner_queries        TO authenticated;

COMMENT ON TABLE public.owner_queries IS
  'Questions a property owner raises from their portal, as threads. Replaces the WhatsApp messages that were the only channel.';
COMMENT ON COLUMN public.owner_queries.about_document_id IS
  'The document the question is about, when it is about one. The thing WhatsApp cannot carry.';
