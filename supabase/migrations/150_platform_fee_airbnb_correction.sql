-- 150_platform_fee_airbnb_correction.sql
-- Runs on BOTH databases. Corrective — see 130_platform_fee_config.sql.
--
-- 130 seeded Airbnb at host_commission_pct=3, guest_fee_pct=14 (the old
-- split-fee model). A real Airbnb earnings statement (1-31 May 2026, host
-- Nicole Babczyk) shows Airbnb has moved this host to host-only pricing:
-- gross earnings R7,594.00, service fees -R1,353.69 (17.8%), no separate
-- guest-facing fee line. Corrects any row still sitting at the old 130
-- seed default — leaves any row an admin has since edited via the Settings
-- tab untouched, and fixes what 130's seed will insert for any org that
-- hasn't run it yet (production, at time of writing).

UPDATE public.platform_fee_config
SET host_commission_pct = 17.8, guest_fee_pct = 0
WHERE platform = 'airbnb' AND host_commission_pct = 3 AND guest_fee_pct = 14;

-- End 150_platform_fee_airbnb_correction.
