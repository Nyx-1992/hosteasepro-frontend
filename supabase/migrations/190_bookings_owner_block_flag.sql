-- 190_bookings_owner_block_flag.sql
-- Runs on BOTH databases. Adds one nullable-safe boolean to public.bookings.
--
-- Supports the "Convert to booking" feature (day-detail modal, blocked
-- entries): some platform feeds send zero guest-identifying data, so a
-- 'blocked' row is genuinely ambiguous — real guest stay or the property
-- owner closing dates for themselves? Rather than leave it a permanent
-- guess, Nina can now explicitly tag it as a confirmed owner closure (this
-- column) or convert it into a real booking (existing guest-name save,
-- flips status to 'confirmed'). Distinct from status='owner', which means
-- the owner is physically staying — this just means the owner closed the
-- dates, not necessarily that anyone is there.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS is_owner_block boolean NOT NULL DEFAULT false;

-- End 190_bookings_owner_block_flag.
