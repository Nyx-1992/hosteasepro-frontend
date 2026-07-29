// api/calendar/speranta.ics.js
// Outbound iCal feed for Speranta Flat
// Paste this URL into Airbnb/Booking.com/LekkeSlaap as an external calendar:
// https://hosteasepro-frontend.vercel.app/api/calendar/speranta.ics
//
// Feed-generation logic lives in api/_lib/icalFeed.js, shared with
// tvhouse-cal.js — this file just supplies this property's identity.

import { generateIcalFeed } from './_lib/icalFeed.js';

export const config = { runtime: 'edge' };

const PROPERTY_ID = 'e9737638-d83a-4947-940a-8746789e4d9f';
const PROPERTY_NAME = 'Speranta Flat';
const FEED_ID = 'speranta';

export default async function handler(req) {
  return generateIcalFeed(PROPERTY_ID, PROPERTY_NAME, FEED_ID);
}
