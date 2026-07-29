// api/calendar/tvhouse.ics.js
// Outbound iCal feed for TV House
// Paste this URL into Airbnb/Booking.com/LekkeSlaap as an external calendar:
// https://hosteasepro-frontend.vercel.app/api/calendar/tvhouse.ics
//
// Feed-generation logic lives in api/_lib/icalFeed.js, shared with
// speranta-cal.js — this file just supplies this property's identity.

import { generateIcalFeed } from './_lib/icalFeed.js';

export const config = { runtime: 'edge' };

const PROPERTY_ID = '83b2a84a-5451-4be5-a84f-2efc0d2602d5';
const PROPERTY_NAME = 'TV House';
const FEED_ID = 'tvhouse';

export default async function handler(req) {
  return generateIcalFeed(PROPERTY_ID, PROPERTY_NAME, FEED_ID);
}
