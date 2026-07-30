-- 720_site_content.sql
-- Runs on BOTH databases.
--
-- Editable website content, so the people who own the words can change
-- them without a developer or a deploy. Today snapartments-frontend
-- (Next.js) has all its copy hardcoded in .tsx files and data/listings.ts
-- — meaning neither owner can fix a typo, change a rate, or reword a
-- description without someone pushing code.
--
-- MULTI-TENANT ON PURPOSE, from the first migration rather than
-- retrofitted. The owner's plan is to sell websites to management
-- clients and let those clients edit their own content from inside HEP.
-- HEP is already multi-org (organizations, current_org_id()), so scoping
-- this by org_id costs nothing now; adding it later, once real client
-- content exists, would mean a painful backfill and a window where one
-- client could read another's drafts. site_key allows more than one site
-- per org (e.g. the management company site and the bookings site, which
-- the owner is splitting onto separate domains).
--
-- Shape mirrors property_manuals (690): one row per (site, page) holding
-- a jsonb blob of named fields, rather than a row per field. Page copy is
-- edited a page at a time, and a blob means adding a new field to a page
-- is a UI change with no migration. The trade-off — no per-field
-- constraints — is acceptable for marketing copy, where the schema is
-- whatever the design currently needs.
--
-- published gates what the public site serves: edits can be saved and
-- previewed in HEP while the live site keeps showing the last published
-- version. Without it, every keystroke saved would be live copy, which is
-- not something to hand a client.
--
-- READ ACCESS IS DELIBERATELY BROADER THAN WRITE. The public website has
-- to render this content to anonymous visitors, so published rows are
-- readable with the anon key. Unpublished drafts are not — they are
-- admin-only, like everything else sensitive. Nothing secret belongs in
-- this table: it is, by definition, words intended for a public web page.

CREATE TABLE IF NOT EXISTS public.site_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Which site this belongs to. 'main' for an org's only site; the owner
  -- will likely use 'company' and 'bookings' once the two are split.
  site_key text NOT NULL DEFAULT 'main',
  -- Page slug: 'home', 'about', 'contact', 'management', 'seo', …
  page text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, site_key, page)
);

CREATE INDEX IF NOT EXISTS site_content_org_idx ON public.site_content (org_id);
CREATE INDEX IF NOT EXISTS site_content_lookup_idx ON public.site_content (org_id, site_key, page);
-- Serves the public site's read path: published pages for one site.
CREATE INDEX IF NOT EXISTS site_content_published_idx ON public.site_content (site_key, published) WHERE published;

CREATE OR REPLACE FUNCTION public.site_content_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  -- Stamp the moment content actually goes live, so the UI can show
  -- "published 3 days ago" and spot pages with unpublished edits.
  IF NEW.published AND (OLD.published IS DISTINCT FROM NEW.published) THEN
    NEW.published_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS site_content_updated_at ON public.site_content;
CREATE TRIGGER site_content_updated_at
  BEFORE UPDATE ON public.site_content
  FOR EACH ROW EXECUTE FUNCTION public.site_content_updated_at();

ALTER TABLE public.site_content ENABLE ROW LEVEL SECURITY;

-- Public read of PUBLISHED rows only — this is what the Next.js site
-- calls with the anon key. Drafts stay invisible.
DROP POLICY IF EXISTS site_content_public_read ON public.site_content;
CREATE POLICY site_content_public_read ON public.site_content FOR SELECT USING (published);

-- Admins see everything for their own org, including drafts.
DROP POLICY IF EXISTS site_content_admin_read ON public.site_content;
CREATE POLICY site_content_admin_read ON public.site_content FOR SELECT USING (
  auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_admin(org_id)
);

DROP POLICY IF EXISTS site_content_insert ON public.site_content;
CREATE POLICY site_content_insert ON public.site_content FOR INSERT WITH CHECK (
  auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_admin(org_id)
);

DROP POLICY IF EXISTS site_content_update ON public.site_content;
CREATE POLICY site_content_update ON public.site_content FOR UPDATE USING (
  auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_admin(org_id)
) WITH CHECK (
  auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_admin(org_id)
);

DROP POLICY IF EXISTS site_content_delete ON public.site_content;
CREATE POLICY site_content_delete ON public.site_content FOR DELETE USING (
  auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_admin(org_id)
);

-- End 720_site_content.
