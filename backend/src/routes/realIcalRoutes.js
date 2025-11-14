// API Routes for Real iCal Integration
// Add these routes to your backend/src/routes/ical.js

const express = require('express');
const router = express.Router();
const { ICalBookingFetcher, syncAllPlatforms } = require('../services/realIcalIntegration');
const auth = require('../middleware/auth');

// Manual sync trigger (admin only)
router.post('/sync', auth, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Admin access required' });
        }

        const result = await syncAllPlatforms();
        
        res.json({
            success: true,
            message: 'iCal sync completed',
            bookingsCount: result.bookings,
            conflictsCount: result.conflicts,
            timestamp: new Date()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Sync failed',
            error: error.message
        });
    }
});

// Sync specific platform
router.post('/sync/:platform', auth, async (req, res) => {
    try {
        const { platform } = req.params;
        const fetcher = new ICalBookingFetcher();
        
        // Get URLs for all properties for this platform
        const bookings = [];
        for (const property of ['speranta', 'tvhouse']) {
            const url = fetcher.icalUrls[property][platform];
            if (url) {
                const propertyBookings = await fetcher.fetchPlatformBookings(property, platform, url);
                bookings.push(...propertyBookings);
            }
        }
        
        await fetcher.syncToDatabase(bookings);
        
        res.json({
            success: true,
            platform: platform,
            bookingsCount: bookings.length,
            timestamp: new Date()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: `Failed to sync ${req.params.platform}`,
            error: error.message
        });
    }
});

// Get sync status
router.get('/status', auth, async (req, res) => {
    try {
        // This would query your sync status from database
        const SyncStatus = require('../models/SyncStatus'); // You'd create this model
        
        const statuses = await SyncStatus.find().sort({ lastSync: -1 });
        
        res.json({
            success: true,
            syncStatus: statuses,
            autoSyncEnabled: true,
            syncInterval: '4 hours'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Update iCal URLs
router.put('/urls', auth, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Admin access required' });
        }

        const { urls } = req.body;
        
        // Validate URL format
        for (const [property, platformUrls] of Object.entries(urls)) {
            for (const [platform, url] of Object.entries(platformUrls)) {
                if (url && !url.startsWith('http')) {
                    return res.status(400).json({
                        message: `Invalid URL format for ${property} ${platform}`
                    });
                }
            }
        }
        
        // Save URLs to database (encrypted)
        const ICalConfig = require('../models/ICalConfig'); // You'd create this model
        
        await ICalConfig.findOneAndUpdate(
            {},
            { urls: urls, updatedBy: req.user.id, updatedAt: new Date() },
            { upsert: true }
        );
        
        res.json({
            success: true,
            message: 'iCal URLs updated successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Test iCal URL connectivity
router.post('/test-urls', auth, async (req, res) => {
    try {
        const { urls } = req.body;
        const fetcher = new ICalBookingFetcher();
        const testResults = {};
        
        for (const [property, platformUrls] of Object.entries(urls)) {
            testResults[property] = {};
            
            for (const [platform, url] of Object.entries(platformUrls)) {
                if (url) {
                    try {
                        const startTime = Date.now();
                        await fetcher.fetchPlatformBookings(property, platform, url);
                        const responseTime = Date.now() - startTime;
                        
                        testResults[property][platform] = {
                            status: 'success',
                            responseTime: `${responseTime}ms`,
                            message: 'Connection successful'
                        };
                    } catch (error) {
                        testResults[property][platform] = {
                            status: 'error',
                            message: error.message
                        };
                    }
                }
            }
        }
        
        res.json({
            success: true,
            testResults: testResults
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
