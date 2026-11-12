-- One outbound feed URL per channel, so a cancellation can be signalled to
-- the channel that needs it without risking the one that broke.
--
-- Owner: Airbnb showed 14–17 December blocked "Per 'HostEase Pro'" on a
-- flat that was free. Frank Olyn's booking had been deleted the day before,
-- our feed stopped publishing those dates the moment it was, and Airbnb
-- went on holding them. Three sellable December nights.
--
-- DROPPING AN EVENT IS NOT A CANCELLATION. An iCal consumer sees a feed
-- that no longer mentions a date; whether it releases the date is its own
-- business, and in practice a channel that has imported a block tends to
-- keep it. The protocol's way to say "release this" is to republish the
-- same UID with STATUS:CANCELLED.
--
-- WHICH WE TRIED, ON 9 OCTOBER, AND REVERTED THREE DAYS LATER when
-- LekkeSlaap began answering "Failed to import" on both listings. That was
-- never proven — the deploy that was supposed to undo it may never have
-- shipped, because a vercel.json change made in the same window could have
-- failed the build silently. So we have a fix that might work and might
-- break a channel, and no way to tell them apart while one URL serves
-- everybody.
--
-- Hence a token per channel. Airbnb gets tombstones; LekkeSlaap gets a feed
-- byte-identical to today's. If LekkeSlaap keeps importing and Airbnb
-- releases the dates, the question is answered with no exposure. If Airbnb
-- breaks instead, one channel is affected and the token is switched back.
--
-- THE UID DOES NOT CHANGE, which is the only reason this can work.
-- generateIcalFeed builds it from the property's SHORT KEY, not from the
-- token — hep-speranta-207@snapartments.co.za. A new URL for the same
-- property therefore emits the identical UIDs the channel already imported,
-- so a tombstone lands on the event it is meant to cancel. Had the UID been
-- keyed on the token, every new URL would have published a parallel set of
-- blocks and cancelled nothing.

CREATE TABLE IF NOT EXISTS public.outbound_feed_tokens (
  token         text PRIMARY KEY,
  property_id   uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  channel       text NOT NULL CHECK (channel = ANY (ARRAY['airbnb','booking','lekkeslaap','other'])),
  -- Off by default. A feed that says nothing new is the safe one, and this
  -- is the switch the 9 October incident is about.
  tombstones    boolean NOT NULL DEFAULT false,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_served_at timestamptz,
  UNIQUE (property_id, channel)
);

REVOKE ALL ON TABLE public.outbound_feed_tokens FROM anon;
ALTER TABLE public.outbound_feed_tokens ENABLE ROW LEVEL SECURITY;

-- Org members read and manage their own properties' feed URLs. The feed
-- ENDPOINT does not use these policies at all — it runs with the service
-- role, because the whole point of the token is that the caller is an
-- unauthenticated channel.
DROP POLICY IF EXISTS outbound_feed_tokens_all ON public.outbound_feed_tokens;
CREATE POLICY outbound_feed_tokens_all ON public.outbound_feed_tokens FOR ALL
  USING (
    auth.role() = 'authenticated'
    AND EXISTS (SELECT 1 FROM public.properties p
                 WHERE p.id = property_id AND public.is_org_member(p.org_id))
  )
  WITH CHECK (
    auth.role() = 'authenticated'
    AND EXISTS (SELECT 1 FROM public.properties p
                 WHERE p.id = property_id AND public.is_org_member(p.org_id))
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.outbound_feed_tokens TO authenticated;

-- A token per channel for every property that has a feed today. Tombstones
-- are ON for Airbnb only — that is the experiment. properties.ical_token
-- keeps working untouched, because it is pasted into three platforms right
-- now and a feed that stops resolving does not announce itself.
INSERT INTO public.outbound_feed_tokens (token, property_id, channel, tombstones, note)
SELECT encode(gen_random_bytes(16), 'hex'), p.id, c.channel,
       (c.channel = 'airbnb'),
       CASE WHEN c.channel = 'airbnb'
            THEN 'Signals cancellations. Watching whether Airbnb releases dates it has already imported.'
            ELSE 'Byte-identical to the shared feed. Nothing new is said here.' END
  FROM public.properties p
  CROSS JOIN (VALUES ('airbnb'), ('booking'), ('lekkeslaap')) AS c(channel)
 WHERE p.ical_token IS NOT NULL
ON CONFLICT (property_id, channel) DO NOTHING;

COMMENT ON TABLE public.outbound_feed_tokens IS
  'One outbound iCal URL per property per channel, so cancellation signalling can be turned on for one channel without affecting the others. The UID is built from the property short key, not the token, so every URL for a property emits the same UIDs.';
COMMENT ON COLUMN public.outbound_feed_tokens.tombstones IS
  'Republish removed bookings as the same UID with STATUS:CANCELLED, telling the channel to release the dates. Off by default: on 9 October this coincided with LekkeSlaap refusing the whole calendar.';
