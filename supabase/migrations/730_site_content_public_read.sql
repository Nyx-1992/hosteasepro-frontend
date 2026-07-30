-- 730_site_content_public_read.sql
-- Runs on BOTH databases. Corrects the public read path introduced in
-- 720_site_content.sql.
--
-- 720 exposed published content with a plain RLS policy
-- (site_content_public_read: USING (published)). Two things were wrong
-- with that, both found while testing it rather than after shipping:
--
-- 1. IT DIDN'T WORK AT ALL. The anon role has no SELECT grant on the
--    table, so the policy was inert — the website could never have read
--    a single row. Fixing that by granting anon SELECT would have worked,
--    but would also have broken this project's convention: no table in
--    the hardened set (business_vault, finance_documents,
--    platform_earnings, property_manuals, team_contacts) gives anon
--    direct table access. Every anonymous path goes through a
--    SECURITY DEFINER function instead — get_outside_clean_info (390),
--    get_staff_portal_roster (660), staff_portal_login (680). A function
--    can be reasoned about in one place; a table grant plus a policy has
--    to stay correct forever, including through future policy edits.
--
-- 2. IT LEAKED ACROSS TENANTS. site_content is unique on
--    (org_id, site_key, page), so site_key alone does NOT identify a
--    site. Two client orgs that both used the default 'main' would have
--    served each other's pages — and since the whole point of this table
--    is selling websites to management clients, that is not hypothetical.
--    The read path must name the org explicitly.
--
-- So: drop the policy, and expose exactly one function that takes the
-- org AND the site key, returns published pages only, and is granted to
-- anon. The website (Next.js, snapartments-frontend) calls this with its
-- own org id from config. Drafts remain invisible to everyone except
-- that org's admins, via the admin policy 720 already created.
--
-- No table grant to anon is added. That is deliberate: without SELECT on
-- the table, a future mistake in an RLS policy cannot expose drafts to
-- the public, because anonymous callers have no way to reach the table
-- except through this function.

DROP POLICY IF EXISTS site_content_public_read ON public.site_content;

CREATE OR REPLACE FUNCTION public.get_site_content(p_org_id uuid, p_site_key text DEFAULT 'main')
RETURNS TABLE (page text, content jsonb, published_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sc.page, sc.content, sc.published_at
  FROM public.site_content sc
  WHERE sc.org_id = p_org_id
    AND sc.site_key = p_site_key
    AND sc.published
  ORDER BY sc.page;
$$;

REVOKE ALL ON FUNCTION public.get_site_content(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_site_content(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_site_content(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.get_site_content(uuid, text) IS
  'Public read path for website content. Returns PUBLISHED pages only, for one org and site. Drafts are never returned. Called by the public website with the anon key.';

-- End 730_site_content_public_read.
