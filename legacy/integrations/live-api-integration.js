// HostEasePro API Integration - Live Implementation
// This will connect to your actual Booking.com accounts

class BookingComIntegration {
    constructor() {
        // Speranta credentials
        this.sperantaAuth = {
            username: 'sn_apt_management@outlook.com',
            password: 'Sevilla2015!!'
        };
        
        // TV House credentials  
        this.tvhouseAuth = {
            username: 'SN_Apt_Management',
            password: 'TVHouseHoliday2025'
        };
        
        this.baseURL = 'https://distribution-xml.booking.com/json/bookings';
    }

    // Get property IDs from Booking.com accounts
    async getPropertyIds() {
        console.log('🔍 Fetching property IDs from Booking.com accounts...');
        
        try {
            // Test Speranta account
            const sperantaProperties = await this.getPropertiesForAccount(this.sperantaAuth);
            console.log('🏠 Speranta properties found:', sperantaProperties);
            
            // Test TV House account  
            const tvhouseProperties = await this.getPropertiesForAccount(this.tvhouseAuth);
            console.log('🏠 TV House properties found:', tvhouseProperties);
            
            return {
                speranta: sperantaProperties,
                tvhouse: tvhouseProperties
            };
            
        } catch (error) {
            console.error('❌ Error fetching property IDs:', error);
            return null;
        }
    }

    async getPropertiesForAccount(credentials) {
        const auth = btoa(`${credentials.username}:${credentials.password}`);
        
        try {
            // First, get the hotel list for this account
            const response = await fetch('https://distribution-xml.booking.com/json/hotels', {
                method: 'GET',
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'HostEasePro/1.0'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            return data;
            
        } catch (error) {
            console.error('Property lookup error:', error);
            throw error;
        }
    }

    // Get reservations for a specific property
    async getReservations(credentials, hotelId, startDate, endDate) {
        const auth = btoa(`${credentials.username}:${credentials.password}`);
        
        try {
            const url = `${this.baseURL}?hotel_ids=${hotelId}&checkin_from=${startDate}&checkin_to=${endDate}`;
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Booking.com API Error: ${response.status}`);
            }

            const reservations = await response.json();
            
            // Process reservation data
            return reservations.map(reservation => ({
                id: reservation.reservation_id,
                guestName: `${reservation.booker_details?.firstname || 'Guest'} ${reservation.booker_details?.lastname || ''}`.trim(),
                phone: reservation.booker_details?.telephone || 'Not provided',
                email: reservation.booker_details?.email || 'Not provided',
                guestCount: reservation.room_reservations?.[0]?.no_of_guests || 1,
                checkinDate: reservation.checkin,
                checkoutDate: reservation.checkout,
                totalAmount: reservation.total_price || 0,
                currency: reservation.currency || 'ZAR',
                specialRequests: reservation.customer_comments || '',
                status: reservation.status || 'confirmed',
                bookingReference: reservation.reservation_id,
                platform: 'booking'
            }));
            
        } catch (error) {
            console.error('Reservations fetch error:', error);
            return [];
        }
    }

    // Test connection and get current bookings
    async testConnection() {
        console.log('🧪 Testing Booking.com API connections...');
        
        try {
            const properties = await this.getPropertyIds();
            
            if (properties) {
                console.log('✅ Successfully connected to Booking.com accounts');
                console.log('📊 Account summary:', properties);
                return true;
            } else {
                console.log('❌ Failed to connect to Booking.com');
                return false;
            }
            
        } catch (error) {
            console.error('❌ Connection test failed:', error);
            return false;
        }
    }
}

// Enhanced HostEasePro integration with live API data
class EnhancedHostEasePro {
    constructor() {
        this.bookingAPI = new BookingComIntegration();
        this.isAPIEnabled = false;
    }

    async initializeAPI() {
        console.log('🚀 Initializing HostEasePro API integration...');
        
        // Try to enable Booking.com API - attempt real connection
        console.log('🔥 ATTEMPTING REAL BOOKING.COM API CONNECTION...');
        
        try {
            const connectionSuccess = await this.bookingAPI.testConnection();
            
            if (connectionSuccess) {
                this.isAPIEnabled = true;
                console.log('✅ Booking.com API connection successful - REAL DATA MODE');
            } else {
                console.log('⚠️ Booking.com API connection failed - falling back to demo data');
                this.isAPIEnabled = false;
            }
        } catch (error) {
            console.error('❌ API connection failed:', error);
            console.log('⚠️ Using demo data due to API connection issues');
            this.isAPIEnabled = false;
        }
        
        // Skip connection test for now
        // const connectionSuccess = await this.bookingAPI.testConnection();
        
        // if (connectionSuccess) {
        //     this.isAPIEnabled = true;
        //     console.log('✅ API integration enabled');
        //     
        //     // Get property information
        //     const properties = await this.bookingAPI.getPropertyIds();
        //     if (properties) {
        //         this.properties = properties;
        //         console.log('🏠 Properties configured:', properties);
        //     }
        //     
        // } else {
        //     console.log('⚠️ API integration disabled - falling back to manual mode');
        //     this.isAPIEnabled = false;
        // }
    }

    // Enhanced booking data fetching with API integration
    async fetchEnhancedBookingData() {
        if (!this.isAPIEnabled) {
            console.log('📡 API not available - using iCal data only');
            return null;
        }

        console.log('📊 Fetching enhanced booking data from Booking.com...');
        
        try {
            const today = new Date();
            const futureDate = new Date(today.getTime() + (90 * 24 * 60 * 60 * 1000)); // 90 days ahead
            
            const startDate = today.toISOString().split('T')[0];
            const endDate = futureDate.toISOString().split('T')[0];

            const enhancedBookings = [];

            // Get Speranta bookings if we have property info
            if (this.properties?.speranta?.length > 0) {
                const sperantaId = this.properties.speranta[0].hotel_id;
                const sperantaBookings = await this.bookingAPI.getReservations(
                    this.bookingAPI.sperantaAuth, 
                    sperantaId, 
                    startDate, 
                    endDate
                );
                
                sperantaBookings.forEach(booking => {
                    booking.property = 'Speranta';
                    enhancedBookings.push(booking);
                });
            }

            // Get TV House bookings if we have property info
            if (this.properties?.tvhouse?.length > 0) {
                const tvhouseId = this.properties.tvhouse[0].hotel_id;
                const tvhouseBookings = await this.bookingAPI.getReservations(
                    this.bookingAPI.tvhouseAuth, 
                    tvhouseId, 
                    startDate, 
                    endDate
                );
                
                tvhouseBookings.forEach(booking => {
                    booking.property = 'TV House';
                    enhancedBookings.push(booking);
                });
            }

            console.log(`✅ Retrieved ${enhancedBookings.length} enhanced bookings from Booking.com`);
            return enhancedBookings;
            
        } catch (error) {
            console.error('❌ Enhanced booking data fetch failed:', error);
            return null;
        }
    }

    // Merge API data with iCal bookings
    mergeBookingData(icalBookings, apiBookings) {
        if (!apiBookings || apiBookings.length === 0) {
            return icalBookings;
        }

        console.log('🔄 Merging iCal and API booking data...');

        const mergedBookings = [...icalBookings];

        // Enhance existing iCal bookings with API data
        icalBookings.forEach((icalBooking, index) => {
            if (icalBooking.platform === 'booking') {
                // Try to find matching API booking
                const matchingAPI = apiBookings.find(apiBooking => 
                    apiBooking.property === icalBooking.property &&
                    apiBooking.checkinDate === icalBooking.start &&
                    apiBooking.checkoutDate === icalBooking.end
                );

                if (matchingAPI) {
                    // Merge API data into iCal booking
                    mergedBookings[index] = {
                        ...icalBooking,
                        guestName: matchingAPI.guestName,
                        phone: matchingAPI.phone,
                        email: matchingAPI.email,
                        guestCount: matchingAPI.guestCount,
                        totalAmount: matchingAPI.totalAmount,
                        specialRequests: matchingAPI.specialRequests,
                        bookingReference: matchingAPI.bookingReference,
                        apiEnhanced: true
                    };
                    
                    console.log(`✅ Enhanced ${icalBooking.property} booking with API data:`, matchingAPI.guestName);
                }
            }
        });

        // Add any API bookings not found in iCal
        apiBookings.forEach(apiBooking => {
            const existsInICal = icalBookings.some(icalBooking =>
                icalBooking.property === apiBooking.property &&
                icalBooking.start === apiBooking.checkinDate &&
                icalBooking.end === apiBooking.checkoutDate
            );

            if (!existsInICal) {
                // Convert API booking to iCal format
                const newBooking = {
                    start: apiBooking.checkinDate,
                    end: apiBooking.checkoutDate,
                    summary: `Booking.com - ${apiBooking.guestName}`,
                    property: apiBooking.property,
                    platform: 'booking',
                    guestName: apiBooking.guestName,
                    phone: apiBooking.phone,
                    email: apiBooking.email,
                    guestCount: apiBooking.guestCount,
                    totalAmount: apiBooking.totalAmount,
                    specialRequests: apiBooking.specialRequests,
                    bookingReference: apiBooking.bookingReference,
                    apiEnhanced: true,
                    apiOnly: true
                };
                
                mergedBookings.push(newBooking);
                console.log(`➕ Added API-only booking: ${apiBooking.guestName} at ${apiBooking.property}`);
            }
        });

        console.log(`🎯 Merge complete: ${mergedBookings.length} total bookings (${apiBookings.length} API enhanced)`);
        return mergedBookings;
    }
}

// Initialize enhanced system
const enhancedHostEasePro = new EnhancedHostEasePro();

// Export for global use
if (typeof window !== 'undefined') {
    window.liveAPI = enhancedHostEasePro;
    window.enhancedHostEasePro = enhancedHostEasePro; // Keep backward compatibility
}

console.log('🎉 HostEasePro API Integration loaded and ready!');
console.log('📞 Credentials configured for both Speranta and TV House');
console.log('🚀 Run enhancedHostEasePro.initializeAPI() to start API integration');
