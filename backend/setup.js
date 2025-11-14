const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Import models
const User = require('./src/models/User');
const Property = require('./src/models/Property');
const KnowledgeBase = require('./src/models/KnowledgeBase');

async function setupInitialData() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/nyx-training');
    console.log('Connected to MongoDB');

    // Clear existing data (optional - comment out in production)
    await User.deleteMany({});
    await Property.deleteMany({});
    await KnowledgeBase.deleteMany({});
    console.log('Cleared existing data');

    // Create initial users
    const salt = await bcrypt.genSalt(10);
    const adminPassword = await bcrypt.hash('Sevilla2015!', salt);
    const defaultPassword = await bcrypt.hash('password123', salt);
    const ninaPassword = await bcrypt.hash('HelloWorld1!', salt);

    // Admin user
    const admin = await User.create({
      email: 'sn_apt_management@outlook.com',
      password: adminPassword,
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
      phone: '+27 11 123 4567'
    });

    // Property manager (Nina Williams)
    const propertyManager = await User.create({
      email: 'vanwyk.nina@gmail.com',
      password: ninaPassword,
      firstName: 'Nina',
      lastName: 'Williams',
      role: 'property-manager',
      phone: '+27 083 702 2421',
      accessRestrictions: ['reports', 'financial']
    });

    // Customer user
    const customer = await User.create({
      email: 'customer@nyxtraining.com',
      password: defaultPassword,
      firstName: 'Test',
      lastName: 'Customer',
      role: 'customer',
      phone: '+27 11 999 8888'
    });

    console.log('Created initial users');

    // Create properties
    const speranta = await Property.create({
      name: 'Speranta',
      description: 'Modern apartment in the heart of the city with stunning views and premium amenities.',
      address: {
        street: '123 Main Street',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2000',
        country: 'South Africa'
      },
      propertyType: 'apartment',
      bedrooms: 2,
      bathrooms: 2,
      maxGuests: 4,
      amenities: ['WiFi', 'Air Conditioning', 'Kitchen', 'Parking', 'City View'],
      pricing: {
        basePrice: 850,
        currency: 'ZAR',
        cleaningFee: 150,
        securityDeposit: 1000
      },
      platformIntegrations: {
        bookingCom: {
          icalUrl: 'https://ical.booking.com/v1/export?t=8123e217-45b4-403d-8fa0-9dcc65c26800',
          isActive: true
        },
        lekkeSlaap: {
          icalUrl: 'https://www.lekkeslaap.co.za/suppliers/icalendar.ics?t=bXEzOHNicTJQT3Nkd1dHb1ZSaXhRUT09',
          isActive: true
        },
        fewo: {
          icalUrl: 'http://www.fewo-direkt.de/icalendar/12b719114ecd42adab4e9ade2d2458e6.ics?nonTentative',
          isActive: true
        },
        airbnb: {
          icalUrl: 'https://www.airbnb.com/calendar/ical/1237076374831130516.ics?s=01582d0497e99114aa6013156146cea4&locale=en-GB',
          isActive: true
        }
      },
      checkInInfo: {
        checkInTime: '15:00',
        checkOutTime: '11:00',
        instructions: 'Keys are in the lockbox by the front door. Code: 1234',
        keyLocation: 'Lockbox by main entrance',
        wifiPassword: 'SperantaGuest2024',
        emergencyContact: '+27 11 123 4567'
      },
      owner: admin._id
    });

    const tvHouse = await Property.create({
      name: 'TV House',
      description: 'Spacious house perfect for families and groups, featuring a large garden and entertainment area.',
      address: {
        street: '456 Oak Avenue',
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '8001',
        country: 'South Africa'
      },
      propertyType: 'house',
      bedrooms: 3,
      bathrooms: 2,
      maxGuests: 6,
      amenities: ['WiFi', 'Garden', 'BBQ', 'Kitchen', 'Parking', 'TV Room'],
      pricing: {
        basePrice: 1200,
        currency: 'ZAR',
        cleaningFee: 200,
        securityDeposit: 1500
      },
      platformIntegrations: {
        bookingCom: {
          icalUrl: 'https://ical.booking.com/v1/export?t=ea29c451-4d0b-4fa4-b7a8-e879a33a8940',
          isActive: true
        },
        lekkeSlaap: {
          icalUrl: 'https://www.lekkeslaap.co.za/suppliers/icalendar.ics?t=QzZ2aFlFVHhxYnoxdGRVL3ZwelRGUT09',
          isActive: true
        },
        airbnb: {
          icalUrl: 'https://www.airbnb.com/calendar/ical/1402174824640448492.ics?s=373c5a71c137230a72f928e88728dcf3&locale=en-GB',
          isActive: true
        },
        fewo: {
          icalUrl: '',
          isActive: false
        }
      },
      checkInInfo: {
        checkInTime: '16:00',
        checkOutTime: '10:00',
        instructions: 'Ring the bell at the gate. Caretaker will meet you.',
        keyLocation: 'Hand delivery from caretaker',
        wifiPassword: 'TVHouseGuest2024',
        emergencyContact: '+27 21 987 6543'
      },
      owner: admin._id
    });

    console.log('Created properties');

    // Create initial knowledge base articles
    const articles = [
      {
        title: 'Guest Check-in Procedure',
        content: `# Guest Check-in Procedure

## Before Guest Arrival
1. Confirm booking details 24 hours before check-in
2. Ensure property is cleaned and ready
3. Check all amenities are working
4. Prepare welcome materials

## During Check-in
1. Greet guest warmly
2. Show them around the property
3. Explain WiFi password and amenities
4. Provide local area information
5. Confirm contact details
6. Hand over keys

## After Check-in
1. Update booking status in system
2. Note any special requests or issues
3. Send welcome message with important information`,
        category: 'procedures',
        tags: ['check-in', 'guest-service', 'procedures'],
        priority: 'high',
        author: propertyManager._id
      },
      {
        title: 'Cleaning Checklist',
        content: `# Property Cleaning Checklist

## Kitchen
- [ ] Clean all surfaces and countertops
- [ ] Clean appliances (microwave, fridge, oven)
- [ ] Empty dishwasher and restock
- [ ] Replace dish towels and cleaning cloths
- [ ] Restock consumables (coffee, tea, sugar)

## Bathroom
- [ ] Clean and disinfect toilet
- [ ] Clean shower/bathtub
- [ ] Clean mirrors and surfaces
- [ ] Replace towels and toiletries
- [ ] Empty bins

## Bedrooms
- [ ] Change bed linens
- [ ] Vacuum carpets/mop floors
- [ ] Dust surfaces
- [ ] Check wardrobe space

## Living Areas
- [ ] Vacuum/mop floors
- [ ] Dust all surfaces
- [ ] Clean windows
- [ ] Arrange furniture properly
- [ ] Check remote controls work

## Final Check
- [ ] Test all lights and switches
- [ ] Check WiFi is working
- [ ] Set air conditioning/heating
- [ ] Lock all windows and doors`,
        category: 'procedures',
        tags: ['cleaning', 'maintenance', 'checklist'],
        priority: 'high',
        author: propertyManager._id
      },
      {
        title: 'Emergency Contact Information',
        content: `# Emergency Contact Information

## Primary Contacts
- **Property Manager (Nina Williams)**: +27 083 702 2421
- **Admin**: +27 11 123 4567
- **Backup Contact**: +27 11 888 9999

## Emergency Services
- **Police**: 10111
- **Fire Department**: +27 11 407 6911
- **Ambulance**: 10177
- **Poison Information**: 0861 555 777

## Local Services
- **Electricity (Load Shedding)**: Check EskomSePush app
- **Water Issues**: +27 11 414 7000
- **Security Company**: +27 11 555 1234

## Property Specific
### Speranta
- Building Management: +27 11 234 5678
- Nearest Hospital: Milpark Hospital (+27 11 480 7111)

### TV House
- Caretaker: +27 21 123 4567
- Nearest Hospital: Groote Schuur Hospital (+27 21 404 9111)`,
        category: 'emergency',
        tags: ['emergency', 'contacts', 'safety'],
        priority: 'critical',
        author: admin._id
      },
      {
        title: 'WiFi and Technology Troubleshooting',
        content: `# WiFi and Technology Troubleshooting

## WiFi Issues
1. Check if router lights are on (power and internet)
2. Restart router by unplugging for 30 seconds
3. Check WiFi password is correct
4. Try connecting different device
5. Contact ISP if still not working

## TV Issues
1. Check all cables are properly connected
2. Try different HDMI input
3. Restart TV and decoder
4. Check remote battery
5. Consult TV manual for advanced settings

## Air Conditioning
1. Check remote battery
2. Ensure correct mode is selected (cool/heat)
3. Check filters are clean
4. Ensure vents are not blocked
5. Contact maintenance if still not working

## Other Appliances
- Check power connections
- Look for reset buttons
- Check circuit breakers
- Consult user manuals
- Contact maintenance for repairs`,
        category: 'troubleshooting',
        tags: ['technology', 'wifi', 'troubleshooting'],
        priority: 'medium',
        author: propertyManager._id
      }
    ];

    for (const articleData of articles) {
      await KnowledgeBase.create(articleData);
    }

    console.log('Created knowledge base articles');
    console.log('\n=== Setup Complete ===');
    console.log('Admin login: sn_apt_management@outlook.com / Sevilla2015!');
    console.log('Property Manager login: vanwyk.nina@gmail.com / HelloWorld1!');
    console.log('Customer login: customer@nyxtraining.com / password123');

  } catch (error) {
    console.error('Setup failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

// Run the setup
setupInitialData();
