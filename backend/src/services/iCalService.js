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
    const results = {
      processed: 0,
      created: 0,
      updated: 0,
      errors: []
    };

    const platforms = ['bookingCom', 'lekkeSlaap', 'fewo', 'airbnb'];
    
    for (const platformKey of platforms) {
      const platformConfig = property.platformIntegrations[platformKey];
      
      if (!platformConfig.isActive || !platformConfig.icalUrl) {
        continue;
      }

      try {
        const response = await axios.get(platformConfig.icalUrl, {
          timeout: 30000,
          headers: {
            'User-Agent': 'Nyx-Training Property Management System'
          }
        });

        const events = ical.parseICS(response.data);
        
        for (const [uid, event] of Object.entries(events)) {
          if (event.type !== 'VEVENT') continue;
          
          results.processed++;
          
          try {
            const platform = this.determinePlatform(event, platformConfig.icalUrl);
            const guestInfo = this.parseGuestInfo(event.summary);
            const bookingId = this.extractBookingId(event, platform);
            
            const checkIn = moment(event.start).startOf('day').toDate();
            const checkOut = moment(event.end).startOf('day').toDate();
            const nights = moment(checkOut).diff(moment(checkIn), 'days');
            
            // Skip if dates are invalid
            if (nights <= 0) continue;

            // Check if booking already exists
            let existingBooking = await Booking.findOne({
              property: property._id,
              'icalSource.eventId': uid
            });

            const bookingData = {
              property: property._id,
              guest: {
                firstName: guestInfo.firstName,
                lastName: guestInfo.lastName,
                email: `${guestInfo.firstName.toLowerCase()}@${platform}.guest`,
                numberOfGuests: 2, // Default, can be updated manually
                specialRequests: event.description || ''
              },
              dates: {
                checkIn,
                checkOut,
                nights
              },
              pricing: {
                baseAmount: property.pricing.basePrice * nights,
                totalAmount: property.pricing.basePrice * nights,
                currency: property.pricing.currency
              },
              platform: {
                name: platform,
                bookingId,
                confirmationNumber: bookingId
              },
              status: 'confirmed',
              icalSource: {
                lastSync: new Date(),
                eventId: uid
              }
            };

            if (existingBooking) {
              // Update existing booking
              Object.assign(existingBooking, bookingData);
              await existingBooking.save();
              results.updated++;
            } else {
              // Create new booking
              const newBooking = new Booking(bookingData);
              await newBooking.save();
              results.created++;
            }

          } catch (eventError) {
            console.error(`Error processing event ${uid}:`, eventError);
            results.errors.push(`Event ${uid}: ${eventError.message}`);
          }
        }

      } catch (error) {
        console.error(`Error syncing ${platformKey} for property ${property.name}:`, error);
        results.errors.push(`${platformKey}: ${error.message}`);
      }
    }

    return results;
  }

  // Sync all properties
  static async syncAllProperties() {
    const properties = await Property.find({ isActive: true });
    const allResults = [];

    for (const property of properties) {
      try {
        const results = await this.syncPropertyCalendar(property);
        allResults.push({
          propertyId: property._id,
          propertyName: property.name,
          results
        });
      } catch (error) {
        console.error(`Error syncing property ${property.name}:`, error);
        allResults.push({
          propertyId: property._id,
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
