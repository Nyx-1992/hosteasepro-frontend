-- 130_platform_fee_config.sql
-- Runs on BOTH databases. Backs Task 5, the per-platform rate calculator
-- (Settings tab, demo/index_fixed.html).
--
-- HEP's own commission model: a flat platform fee (not modeled here — that's
-- what HEP charges the host org for using HEP itself) plus a 5% HEP
-- commission ONLY on bookings made through the HEP direct-booking page,
-- never on OTA bookings. So the 'direct' row below is NOT free by default:
-- host_commission_pct is 5 for client orgs, and 0 only for the S&N owner org
-- (5966bc67-5c2f-45ae-8519-9b7eaeee09f4), since HEP doesn't charge itself.
-- This is a per-org row so it's an editable setting, not a hardcoded rule.
--
-- guest_fee_pct is the platform's guest-facing service fee (added on top of
-- the listed rate, e.g. Airbnb's ~14%) — separate from host_commission_pct,
-- which is deducted from the host's payout (e.g. Booking.com's ~15%
-- commission). Both default to 0 where a platform doesn't charge that side.

CREATE TABLE IF NOT EXISTS public.platform_fee_config (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  platform            text NOT NULL CHECK (platform IN ('booking','airbnb','lekkeslaap','direct')),
  host_commission_pct numeric NOT NULL DEFAULT 0,
  guest_fee_pct       numeric NOT NULL DEFAULT 0,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, platform)
);

ALTER TABLE public.platform_fee_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_fee_config_select ON public.platform_fee_config;
CREATE POLICY platform_fee_config_select ON public.platform_fee_config
  FOR SELECT USING (org_id = current_org_id());

DROP POLICY IF EXISTS platform_fee_config_modify ON public.platform_fee_config;
CREATE POLICY platform_fee_config_modify ON public.platform_fee_config
  FOR ALL USING (org_id = current_org_id() AND is_org_admin(org_id))
  WITH CHECK (org_id = current_org_id() AND is_org_admin(org_id));

CREATE OR REPLACE FUNCTION public.touch_platform_fee_config_updated_at()
RETURNS trigger AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_platform_fee_config_updated_at ON public.platform_fee_config;
CREATE TRIGGER trg_platform_fee_config_updated_at
  BEFORE UPDATE ON public.platform_fee_config
  FOR EACH ROW EXECUTE FUNCTION public.touch_platform_fee_config_updated_at();

-- Seed sensible ZA defaults for every existing org. host_commission_pct here
-- is a starting point, clearly labeled in the UI as "verify against your
-- contracts" — actual rates vary by property/agreement.
INSERT INTO public.platform_fee_config (org_id, platform, host_commission_pct, guest_fee_pct)
SELECT
  o.id,
  v.platform,
  CASE WHEN v.platform = 'direct' AND o.id = '5966bc67-5c2f-45ae-8519-9b7eaeee09f4'
       THEN 0
       ELSE v.host_commission_pct END,
  v.guest_fee_pct
FROM public.organizations o
CROSS JOIN (VALUES
  ('booking',    15, 0),
  ('airbnb',      3, 14),
  ('lekkeslaap', 10, 0),
  ('direct',      5, 0)
) AS v(platform, host_commission_pct, guest_fee_pct)
ON CONFLICT (org_id, platform) DO NOTHING;

-- End 130_platform_fee_config.
