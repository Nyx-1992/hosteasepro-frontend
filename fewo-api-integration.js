/**
 * FeWo-direkt API Integration for HostEasePro
 * Integrates with FeWo-direkt (HomeAway/Vrbo) to enhance booking data
 * Author: HostEasePro Development Team
 * Created: October 17, 2025
 */

class FeWoAPIIntegration {
    constructor() {
        // FeWo-direkt API configuration
        this.baseUrl = 'https://api.homeaway.com';
        this.credentials = {
            // FeWo-direkt uses different authentication
            email: 'sn_apt_management@outlook.com',
            password: 'Sevilla2015!!',
            apiKey: null,
            propertyId: null
        };
        
        this.apiEndpoints = {
            auth: `${this.baseUrl}/oauth/token`,
            properties: `${this.baseUrl}/public/properties`,
            bookings: `${this.baseUrl}/public/bookings`,
            inquiries: `${this.baseUrl}/public/inquiries`
        };
        
        this.accessToken = null;
        this.properties = new Map();
        this.isInitialized = false;
    }

    async initialize() {
        console.log('🏠 Initializing FeWo-direkt API integration...');
        
        try {
            // Note: FeWo-direkt requires property owner verification
            // For now, set up mock integration structure
            await this.setupMockIntegration();
            
            this.isInitialized = true;
            console.log('✅ FeWo-direkt API integration initialized');
            return true;
            
        } catch (error) {
            console.error('❌ FeWo-direkt API initialization failed:', error);
            await this.setupMockIntegration();
            return false;
        }
    }

    async authenticate() {
        console.log('🔐 Authenticating with FeWo-direkt API...');
        
        // Note: FeWo-direkt requires OAuth 2.0 authentication
        try {
            const response = await fetch(this.apiEndpoints.auth, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                },
                body: new URLSearchParams({
                    grant_type: 'password',
                    username: this.credentials.email,
                    password: this.credentials.password,
                    client_id: this.credentials.apiKey
                })
            });

            if (response.ok) {
                const data = await response.json();
                this.accessToken = data.access_token;
                console.log('✅ FeWo-direkt authentication successful');
                return true;
            } else {
                throw new Error(`Authentication failed: ${response.status}`);
            }
        } catch (error) {
            console.warn('⚠️ FeWo-direkt API access requires property owner verification');
            throw error;
        }
    }

    async setupMockIntegration() {
        console.log('🔧 Setting up FeWo-direkt mock integration...');
        
        // Mock property data based on German vacation rentals
        this.properties.set('fewo_speranta', {
            id: 'fewo_speranta',
            name: 'Speranta Holiday Apartment',
            location: 'Speranta, Romania',
            type: 'Apartment',
            platform: 'FeWo-direkt'
        });

        this.properties.set('fewo_tvhouse', {
            id: 'fewo_tvhouse',
            name: 'TV House Holiday Home',
            location: 'Speranta, Romania', 
            type: 'House',
            platform: 'FeWo-direkt'
        });

        console.log('✅ FeWo-direkt mock integration ready');
        return true;
    }

    // Enhanced booking matching for iCal data
    enhanceBookingData(booking) {
        if (!booking.summary || (!booking.summary.toLowerCase().includes('fewo') && 
            !booking.summary.toLowerCase().includes('geblockt') && 
            !booking.summary.toLowerCase().includes('homeaway') &&
            !booking.summary.toLowerCase().includes('vrbo'))) {
            return null;
        }

        console.log(`🔍 Enhancing FeWo-direkt booking: ${booking.summary}`);
        
        // Determine if this is a blocked period or actual booking
        let guestName = 'FeWo Guest';
        let bookingType = 'booking';
        
        if (booking.summary.toLowerCase().includes('geblockt')) {
            guestName = 'BLOCKED PERIOD';
            bookingType = 'blocked';
        } else {
            // Extract guest name or booking reference from summary
            const summaryParts = booking.summary.split('-').map(part => part.trim());
            if (summaryParts.length > 1) {
                // Remove "FeWo" and get guest name
                guestName = summaryParts.find(part => 
                    !part.toLowerCase().includes('fewo') && 
                    !part.toLowerCase().includes('geblockt') &&
                    part.length > 3
                ) || 'FeWo Guest';
            }
        }

        // Determine property based on booking context
        let propertyName = 'Speranta Holiday Apartment';
        if (booking.calendarSource && booking.calendarSource.includes('tvhouse')) {
            propertyName = 'TV House Holiday Home';
        }

        return {
            ...booking,
            enhancedData: {
                guest: {
                    name: guestName,
                    email: bookingType === 'blocked' ? 'N/A - Blocked Period' : 'Check FeWo-direkt dashboard',
                    phone: bookingType === 'blocked' ? 'N/A - Blocked Period' : 'Check FeWo-direkt dashboard',
                    source: 'fewo_ical',
                    type: bookingType
                },
                property: {
                    name: propertyName,
                    platform: 'fewo'
                },
                pricing: {
                    currency: 'EUR',
                    estimated: true,
                    note: bookingType === 'blocked' ? 'Blocked Period - No Payment' : 'Check FeWo-direkt for exact EUR amount'
                },
                specialRequests: bookingType === 'blocked' ? 'Property blocked for maintenance/personal use' : 'Check FeWo-direkt app for guest requests',
                apiEnhanced: true,
                platform: 'fewo',
                isBlocked: bookingType === 'blocked'
            }
        };
    }

    async fetchBookingData(bookingId) {
        if (!this.isInitialized) {
            console.log('⚠️ FeWo-direkt API not initialized, using iCal data only');
            return null;
        }

        console.log(`📋 Fetching FeWo-direkt booking data for ID: ${bookingId}`);
        
        try {
            const response = await fetch(`${this.apiEndpoints.bookings}/${bookingId}`, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Accept': 'application/json'
                }
            });

            if (response.ok) {
                const booking = await response.json();
                
                return {
                    id: booking.id,
                    confirmationCode: booking.confirmation_number,
                    guest: {
                        name: `${booking.guest.first_name} ${booking.guest.last_name}`,
                        email: booking.guest.email,
                        phone: booking.guest.phone_number,
                        nationality: booking.guest.country
                    },
                    dates: {
                        checkIn: booking.start_date,
                        checkOut: booking.end_date,
                        nights: booking.nights
                    },
                    pricing: {
                        baseAmount: booking.subtotal,
                        fees: booking.fees,
                        total: booking.total_amount,
                        currency: 'EUR'
                    },
                    property: {
                        id: booking.property_id,
                        name: this.properties.get(booking.property_id.toString())?.name || 'FeWo Property'
                    },
                    specialRequests: booking.special_requests || '',
                    guestCount: booking.guest_count,
                    status: booking.status,
                    source: 'fewo_api'
                };
            }
        } catch (error) {
            console.error('❌ Failed to fetch FeWo-direkt booking:', error);
        }
        
        return null;
    }

    getConnectionStatus() {
        return {
            platform: 'FeWo-direkt',
            connected: this.isInitialized,
            properties: this.properties.size,
            lastUpdate: new Date().toISOString(),
            apiStatus: 'mock_ready',
            note: 'Contact FeWo-direkt for API access - currently using enhanced iCal data'
        };
    }

    // Helper method to request API access from FeWo-direkt
    getAPIAccessInstructions() {
        return {
            platform: 'FeWo-direkt',
            steps: [
                '1. Contact FeWo-direkt Partner Support',
                '2. Request API access for property management integration',
                '3. Provide your property owner credentials and use case',
                '4. Complete OAuth 2.0 application registration',
                '5. Wait for API key and documentation'
            ],
            currentAccount: this.credentials.email,
            status: 'API access required',
            alternativeAccess: 'Currently using enhanced iCal parsing for booking data'
        };
    }
}

// Export for use in main application  
if (typeof window !== 'undefined') {
    window.fewoAPI = FeWoAPIIntegration;
    window.FeWoAPIIntegration = FeWoAPIIntegration; // Keep backward compatibility
}
