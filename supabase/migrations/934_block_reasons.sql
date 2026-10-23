-- A blocked night can say what it is for.
--
-- Owner: "I blocked the TV house for one day where the electrician is fixing
-- the DB Board. I wasn't able to choose a category for blocking, only adding
-- it for a guest booking."
--
-- WHAT SHE ACTUALLY HAD TO DO. Booking 683 went in as a CONFIRMED guest
-- booking called "Maintenance", platform manual, 1 guest, R0. Downstream,
-- nothing can tell that apart from a real arrival: it counts as an upcoming
-- stay, it becomes the property's "next" arrival, generate_daily_service
-- books a turnover clean for the morning the electrician leaves, and a
-- zero-revenue night drags the average nightly rate down.
--
-- WHY THE PROPER ROUTE WAS NO BETTER. Status already offered "Blocked — not
-- bookable", but a block had nothing to call itself (guest_name is forced to
-- a placeholder, because nb() reads a real name on a blocked row as a
-- misclassified booking and flips it to confirmed) and the lane view filters
-- status <> 'blocked', so a correctly-made block disappeared from the
-- Bookings tab entirely. Blocking it properly meant blocking it invisibly.
--
-- So: one column for the category. It is NOT where free text goes — `notes`
-- already holds "Electrician — DB board". This is the short, fixed reason
-- the card shows at a glance, and the only writer is the person making the
-- block.
--
-- DELIBERATELY NOT BACK-FILLED. Every existing blocked row is a placeholder
-- mirrored from a platform's calendar, where the platform IS the reason —
-- and source_uid already records that, set by the importers and never by
-- hand. Writing a guessed category over rows whose reason is already
-- knowable would replace a fact with an inference.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS block_reason text;

COMMENT ON COLUMN public.bookings.block_reason IS
  'Why these nights are held: maintenance | cleaning | renovation | other. Set by hand when blocking; null on blocks mirrored from a platform feed (source_uid says where those came from) and on anything that is not a block. Free text belongs in notes.';
