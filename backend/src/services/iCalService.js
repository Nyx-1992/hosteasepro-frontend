const ical = require('node-ical');
const axios = require('axios');
const moment = require('moment');
const Booking = require('../models/Booking');
const Property = require('../models/Property');

class ICalService {
  
  // Parse guest name from iCal summary
  static parseGuestInfo(summary) {
    if (!summary) return { firstName: 'Unknown', lastName: 'Guest' };
    
    // Remove platform prefixes and clean up
    const cleaned = summary
      .replace(/^(Booking\.com|Airbnb|LekkeSlaap|Fewo)[\s-:]*/i, '')
      .replace(/\s*\(.*\)$/, '') // Remove anything in parentheses at the end
      .trim();
    
    const parts = cleaned.split(' ');
    return {
      firstName: parts[0] || 'Unknown',
      lastName: parts.slice(1).join(' ') || 'Guest'
    };
  }

  // Determine platform from iCal data
  static determinePlatform(event, sourceUrl) {
    const summary = event.summary?.toLowerCase() || '';
    const description = event.description?.toLowerCase() || '';
    
    if (sourceUrl.includes('booking.com') || summary.includes('booking.com')) {
      return 'booking.com';
    } else if (sourceUrl.includes('lekkeslaap') || summary.includes('lekkeslaap')) {
      return 'lekkeslaap';
    } else if (sourceUrl.includes('fewo') || summary.includes('fewo')) {
      return 'fewo';
    } else if (sourceUrl.includes('airbnb') || summary.includes('airbnb')) {
      return 'airbnb';
    }
    
    return 'direct';
  }

  // Extract booking ID from iCal event
  static extractBookingId(event, platform) {
    const description = event.description || '';
    const summary = event.summary || '';
    
    switch (platform) {
      case 'booking.com':
        // Look for booking confirmation numbers in description
        const bookingMatch = description.match(/booking[\s#:]?(\d+)/i);
        return bookingMatch ? bookingMatch[1] : null;
      
      case 'airbnb':
        // Airbnb uses confirmation codes
        const airbnbMatch = description.match(/([A-Z0-9]{12,})/);
        return airbnbMatch ? airbnbMatch[1] : null;
      
      default:
        // Try to extract any alphanumeric ID
        const genericMatch = (description + summary).match(/([A-Z0-9]{6,})/);
        return genericMatch ? genericMatch[1] : null;
    }
  }

  // Sync iCal feed for a property
  static async syncPropertyCalendar(property) {
    const { createBooking, getBookings, updateBooking } = require('./supabaseBookings');
    const results = {
      processed: 0,
      created: 0,
      updated: 0,
      errors: []
    };

    // You may need to adjust this to match your Supabase property integration structure
    const platforms = ['bookingCom', 'lekkeSlaap', 'fewo', 'airbnb'];
    for (const platformKey of platforms) {
      const platformConfig = property.platform_integrations?.[platformKey] || property.platformIntegrations?.[platformKey];
      console.log('[iCal Sync] Property:', property.id, property.name, 'PlatformKey:', platformKey, 'Config:', platformConfig);
      if (!platformConfig || !platformConfig.isActive || !platformConfig.icalUrl) {
        console.log(`[iCal Sync] Skipping platform ${platformKey} for property ${property.name}: No active config or iCal URL.`);
        continue;
      }
      try {
        const response = await axios.get(platformConfig.icalUrl, {
          timeout: 30000,
          headers: { 'User-Agent': 'HostEasePro Property Management System' }
        });
        const events = ical.parseICS(response.data);
        for (const [uid, event] of Object.entries(events)) {
          if (event.type !== 'VEVENT') continue;
          results.processed++;
          try {
            const platform = this.determinePlatform(event, platformConfig.icalUrl);
            const guestInfo = this.parseGuestInfo(event.summary);
            const bookingId = this.extractBookingId(event, platform);
            const checkIn = moment(event.start).startOf('day').toISOString();
            const checkOut = moment(event.end).startOf('day').toISOString();
            const nights = moment(checkOut).diff(moment(checkIn), 'days');
            if (nights <= 0) continue;
            // Check if booking already exists in Supabase
            const existing = await getBookings({ propertyId: property.id });
            const found = existing.find(b => b.ical_event_id === uid);
            const bookingData = {
              property_id: property.id,
              property_name: property.name,
              platform,
              guest_first_name: guestInfo.firstName,
              guest_last_name: guestInfo.lastName,
              guest_email: `${guestInfo.firstName.toLowerCase()}@${platform}.guest`,
              number_of_guests: 2, // Default, can be updated manually
              check_in: checkIn,
              check_out: checkOut,
              status: 'confirmed',
              ical_event_id: uid,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            if (found) {
              await updateBooking(found.id, bookingData);
              results.updated++;
            } else {
              await createBooking(bookingData);
              results.created++;
            }
          } catch (eventError) {
            console.error(`[iCal Sync] Error processing event ${uid} for property ${property.name}:`, eventError);
            results.errors.push(`Event ${uid}: ${eventError.message}`);
          }
        }
      } catch (error) {
        console.error(`[iCal Sync] Error syncing ${platformKey} for property ${property.name}:`, error, 'Config:', platformConfig);
        results.errors.push(`${platformKey}: ${error.message}`);
      }
    }
    return results;
  }

  // Sync all properties (Supabase version)
  static async syncAllProperties() {
    const { getActiveProperties } = require('./supabaseProperties');
    const properties = await getActiveProperties();
    const allResults = [];

    for (const property of properties) {
      try {
        const results = await this.syncPropertyCalendar(property);
        allResults.push({
          propertyId: property.id,
          propertyName: property.name,
          results
        });
      } catch (error) {
        console.error(`Error syncing property ${property.name}:`, error);
        allResults.push({
          propertyId: property.id,
          propertyName: property.name,
          results: {
            processed: 0,
            created: 0,
            updated: 0,
            errors: [error.message]
          }
        });
      }
    }

    return allResults;
  }

  // Schedule periodic sync
  static startPeriodicSync() {
    const intervalHours = process.env.ICAL_SYNC_INTERVAL_HOURS || 2;
    const intervalMs = intervalHours * 60 * 60 * 1000;

    setInterval(async () => {
      console.log('Starting scheduled iCal sync...');
      try {
        const results = await this.syncAllProperties();
        console.log('Scheduled sync completed:', results);
      } catch (error) {
        console.error('Scheduled sync failed:', error);
      }
    }, intervalMs);

    console.log(`iCal sync scheduled every ${intervalHours} hours`);
  }
}

module.exports = ICalService;
