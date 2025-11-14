-- 050_ical_feeds.sql
-- Core table for external platform iCal feed configuration.

CREATE TABLE public.ical_feeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  platform text NOT NULL,
  url text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  last_import_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Uniqueness: one active feed per platform/property/org
CREATE UNIQUE INDEX ical_feeds_unique_platform_property
  ON public.ical_feeds (org_id, property_id, platform);

-- Touch trigger
CREATE OR REPLACE FUNCTION public.ical_feeds_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER ical_feeds_updated_at
BEFORE UPDATE ON public.ical_feeds
FOR EACH ROW EXECUTE FUNCTION public.ical_feeds_updated_at();

-- Enable RLS
ALTER TABLE public.ical_feeds ENABLE ROW LEVEL SECURITY;

-- Policies (adjust role logic to your helpers if they differ):
-- Allow org members to select their feeds
CREATE POLICY select_ical_feeds ON public.ical_feeds
FOR SELECT USING ( org_id = current_setting('request.jwt.claim.org_id', true)::uuid );

-- Allow org admins to insert/update/delete (replace helper if different)
CREATE POLICY modify_ical_feeds ON public.ical_feeds
FOR ALL USING (
  org_id = current_setting('request.jwt.claim.org_id', true)::uuid
) WITH CHECK (
  org_id = current_setting('request.jwt.claim.org_id', true)::uuid
);
