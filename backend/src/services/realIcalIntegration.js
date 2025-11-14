// Real iCal Integration Implementation for Node.js Backend
// This is how your system would actually fetch real booking data

const ical = require('node-ical');
const axios = require('axios');
const moment = require('moment');

class ICalBookingFetcher {
    constructor() {
        // Your actual iCal URLs would be stored in the database
        this.icalUrls = {
            speranta: {
                booking: 'https://admin.booking.com/hotel/hoteladmin/ical/YOUR_SPERANTA_BOOKING_LINK',
                airbnb: 'https://www.airbnb.com/calendar/ical/YOUR_SPERANTA_AIRBNB_CALENDAR.ics',
                lekkeslaap: 'https://www.lekkeslaap.co.za/ical/YOUR_SPERANTA_LEKKESLAAP_CALENDAR.ics',
                fewo: 'https://www.fewo-direkt.de/ical/YOUR_SPERANTA_FEWO_CALENDAR.ics'
            },
            tvhouse: {
                booking: 'https://admin.booking.com/hotel/hoteladmin/ical/YOUR_TVHOUSE_BOOKING_LINK',
                airbnb: 'https://www.airbnb.com/calendar/ical/YOUR_TVHOUSE_AIRBNB_CALENDAR.ics',
                lekkeslaap: 'https://www.lekkeslaap.co.za/ical/YOUR_TVHOUSE_LEKKESLAAP_CALENDAR.ics',
                fewo: 'https://www.fewo-direkt.de/ical/YOUR_TVHOUSE_FEWO_CALENDAR.ics'
            }
        };
    }

    async fetchAllBookings() {
        const allBookings = [];
        
        for (const [property, urls] of Object.entries(this.icalUrls)) {
            for (const [platform, url] of Object.entries(urls)) {
                try {
                    const bookings = await this.fetchPlatformBookings(property, platform, url);
                    allBookings.push(...bookings);
                    console.log(`✅ Fetched ${bookings.length} bookings from ${platform} for ${property}`);
                } catch (error) {
                    console.error(`❌ Error fetching ${platform} for ${property}:`, error.message);
                }
            }
        }
        
        return allBookings;
    }

    async fetchPlatformBookings(property, platform, icalUrl) {
        try {
            // Fetch iCal data with timeout
            const response = await axios.get(icalUrl, {
                timeout: 30000,
                headers: {
                    'User-Agent': 'Nyx-Training Property Management System'
                }
            });

            // Parse iCal data
            const events = ical.parseICS(response.data);
            const bookings = [];

            for (const [uid, event] of Object.entries(events)) {
                if (event.type === 'VEVENT') {
                    const booking = this.parseBookingEvent(event, property, platform, uid);
                    if (booking) {
                        bookings.push(booking);
                    }
                }
            }

            return bookings;
        } catch (error) {
            throw new Error(`Failed to fetch ${platform} calendar: ${error.message}`);
        }
    }

    parseBookingEvent(event, property, platform, uid) {
        try {
            // Extract booking information from iCal event
            const summary = event.summary || '';
            const description = event.description || '';
            
            // Parse guest information from event
            const guestInfo = this.extractGuestInfo(summary, description, platform);
            
            return {
                id: uid,
                property: property,
                platform: platform,
                checkIn: moment(event.start).format('YYYY-MM-DD'),
                checkOut: moment(event.end).format('YYYY-MM-DD'),
                nights: moment(event.end).diff(moment(event.start), 'days'),
                guestName: guestInfo.name,
                guestPhone: guestInfo.phone,
                guestEmail: guestInfo.email,
                preferredCheckinTime: guestInfo.checkinTime,
                bookingReference: guestInfo.reference,
                totalAmount: guestInfo.amount,
                currency: guestInfo.currency,
                status: 'confirmed',
                lastSync: new Date(),
                source: 'ical',
                originalEvent: {
                    summary: event.summary,
                    description: event.description,
                    location: event.location
                }
            };
        } catch (error) {
            console.error('Error parsing booking event:', error);
            return null;
        }
    }

    extractGuestInfo(summary, description, platform) {
        const info = {
            name: 'Unknown Guest',
            phone: null,
            email: null,
            checkinTime: '15:00',
            reference: null,
            amount: null,
            currency: 'ZAR'
        };

        try {
            switch (platform) {
                case 'booking':
                    // Booking.com format parsing
                    const bookingMatch = summary.match(/Booking\.com - (.+)/);
                    if (bookingMatch) info.name = bookingMatch[1];
                    
                    const refMatch = description.match(/Reservation number: (\d+)/);
                    if (refMatch) info.reference = refMatch[1];
                    
                    const phoneMatch = description.match(/Phone: ([+\d\s-()]+)/);
                    if (phoneMatch) info.phone = phoneMatch[1].trim();
                    
                    break;

                case 'airbnb':
                    // Airbnb format parsing
                    const airbnbMatch = summary.match(/(.+) \(Airbnb\)/);
                    if (airbnbMatch) info.name = airbnbMatch[1];
                    
                    const checkinMatch = description.match(/Check-in: (\d{2}:\d{2})/);
                    if (checkinMatch) info.checkinTime = checkinMatch[1];
                    
                    break;

                case 'lekkeslaap':
                    // LekkeSlaap format parsing
                    const lekkeMatch = summary.match(/LekkeSlaap - (.+)/);
                    if (lekkeMatch) info.name = lekkeMatch[1];
                    
                    break;

                case 'fewo':
                    // FeWo format parsing
                    const fewoMatch = summary.match(/FeWo-direkt - (.+)/);
                    if (fewoMatch) info.name = fewoMatch[1];
                    
                    break;
            }
        } catch (error) {
            console.error('Error extracting guest info:', error);
        }

        return info;
    }

    async syncToDatabase(bookings) {
        // This would save bookings to your MongoDB database
        const Booking = require('../models/Booking');
        
        for (const bookingData of bookings) {
            try {
                await Booking.findOneAndUpdate(
                    { 
                        property: bookingData.property,
                        checkIn: bookingData.checkIn,
                        checkOut: bookingData.checkOut,
                        platform: bookingData.platform
                    },
                    bookingData,
                    { 
                        upsert: true, 
                        new: true,
                        setDefaultsOnInsert: true 
                    }
                );
                console.log(`💾 Saved booking: ${bookingData.guestName} - ${bookingData.property}`);
            } catch (error) {
                console.error('Error saving booking:', error);
            }
        }
    }

    async checkConflicts(newBookings) {
        // Check for booking conflicts between platforms
        const conflicts = [];
        const Booking = require('../models/Booking');
        
        for (const booking of newBookings) {
            const existingBookings = await Booking.find({
                property: booking.property,
                $or: [
                    {
                        checkIn: { $lte: booking.checkOut },
                        checkOut: { $gte: booking.checkIn }
                    }
                ]
            });
            
            const conflicting = existingBookings.filter(existing => 
                existing.platform !== booking.platform &&
                existing.id !== booking.id
            );
            
            if (conflicting.length > 0) {
                conflicts.push({
                    newBooking: booking,
                    conflictsWith: conflicting
                });
            }
        }
        
        return conflicts;
    }
}

// Usage in your Express routes
async function syncAllPlatforms() {
    const fetcher = new ICalBookingFetcher();
    
    try {
        console.log('🔄 Starting iCal sync for all platforms...');
        
        // Fetch all bookings
        const bookings = await fetcher.fetchAllBookings();
        console.log(`📊 Total bookings fetched: ${bookings.length}`);
        
        // Check for conflicts
        const conflicts = await fetcher.checkConflicts(bookings);
        if (conflicts.length > 0) {
            console.warn(`⚠️ Found ${conflicts.length} booking conflicts!`);
            // Send notification about conflicts
        }
        
        // Save to database
        await fetcher.syncToDatabase(bookings);
        
        // Update sync status
        await updateSyncStatus('success', new Date(), bookings.length);
        
        console.log('✅ iCal sync completed successfully');
        return { success: true, bookings: bookings.length, conflicts: conflicts.length };
        
    } catch (error) {
        console.error('❌ iCal sync failed:', error);
        await updateSyncStatus('error', new Date(), 0, error.message);
        throw error;
    }
}

// Schedule automatic sync every 4 hours
const cron = require('node-cron');
cron.schedule('0 */4 * * *', async () => {
    console.log('⏰ Scheduled iCal sync starting...');
    try {
        await syncAllPlatforms();
    } catch (error) {
        console.error('Scheduled sync failed:', error);
    }
});

module.exports = { ICalBookingFetcher, syncAllPlatforms };
