-- ============================================================
-- SUPABASE DATABASE SCHEMA FOR PROPERTY MANAGEMENT SYSTEM
-- S&N Apt Management - Comprehensive Schema
-- ============================================================

-- Note: Supabase handles JWT secrets automatically
-- No need to set app.jwt_secret manually

-- ============================================================
-- PROPERTIES TABLE
-- ============================================================
CREATE TABLE properties (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    property_type VARCHAR(100),
    max_guests INTEGER,
    wifi_password VARCHAR(100),
    keybox_code VARCHAR(50),
    gate_code VARCHAR(50),
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert your properties
INSERT INTO properties (name, address, property_type, max_guests, wifi_password, keybox_code, gate_code, status) VALUES
('Speranta Property', '35 Athens Road, Blouberg', '2BR Apartment', 4, 'SperantaGuest2024', '3948', '7481', 'active'),
('TV House Property', '110 Athens Road, Tableview', '3BR House', 6, 'TVHouseGuest2024', '2847', NULL, 'active');

-- ============================================================
-- BOOKINGS TABLE
-- ============================================================
CREATE TABLE bookings (
    id SERIAL PRIMARY KEY,
    property_id INTEGER REFERENCES properties(id),
    guest_name VARCHAR(255) NOT NULL,
    guest_email VARCHAR(255),
    guest_phone VARCHAR(50),
    checkin_date DATE NOT NULL,
    checkout_date DATE NOT NULL,
    nights INTEGER GENERATED ALWAYS AS (checkout_date - checkin_date) STORED,
    platform VARCHAR(100), -- 'Airbnb', 'Booking.com', 'LekkeSlaap', 'Direct', etc.
    booking_reference VARCHAR(255),
    total_amount DECIMAL(10,2),
    currency VARCHAR(10) DEFAULT 'ZAR',
    guest_count INTEGER,
    status VARCHAR(50) DEFAULT 'confirmed', -- 'pending', 'confirmed', 'checked-in', 'checked-out', 'cancelled'
    special_requests TEXT,
    notes TEXT,
    domestic_service_arranged BOOLEAN DEFAULT FALSE,
    access_codes_sent BOOLEAN DEFAULT FALSE,
    welcome_package_sent BOOLEAN DEFAULT FALSE,
    -- New granular guest fields & timestamp-based span for ICS ingestion
    guest_first_name TEXT,
    guest_last_name TEXT,
    check_in TIMESTAMPTZ,
    check_out TIMESTAMPTZ,
    source_removed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for performance
CREATE INDEX idx_bookings_dates ON bookings(checkin_date, checkout_date);
CREATE INDEX idx_bookings_property ON bookings(property_id);
CREATE INDEX idx_bookings_status ON bookings(status);
-- Unique span index (active only) for new ICS ingestion columns
-- Mirrors migration 070; safe to ignore if already created
CREATE UNIQUE INDEX IF NOT EXISTS bookings_span_unique ON bookings(property_id, platform, check_in, check_out) WHERE source_removed IS FALSE;

-- ============================================================
-- CONTACTS TABLE
-- ============================================================
CREATE TABLE contacts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(255),
    whatsapp VARCHAR(50),
    category VARCHAR(100) NOT NULL, -- 'domestic', 'team', 'emergency', 'service', 'guest'
    business_area VARCHAR(255),
    role VARCHAR(100), -- 'director', 'manager', 'cleaner', 'maintenance', etc.
    properties_served TEXT[], -- Array of property names
    payment_method VARCHAR(100), -- 'ewallet', 'bank_transfer', 'cash'
    bank_details JSONB, -- Store bank account info as JSON
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert your existing contacts
INSERT INTO contacts (name, phone, email, category, business_area, role, properties_served, payment_method, is_active) VALUES
('Spiwe Gwingwizha', '084 915 0894', NULL, 'domestic', 'Speranta Property Specialist', 'cleaner', ARRAY['Speranta Property'], 'ewallet', true),
('Patricia Mutizwa', '063 735 3892', NULL, 'domestic', 'Multi-Property Cleaning', 'cleaner', ARRAY['Speranta Property', 'TV House Property'], 'bank_transfer', true),
('Silja', NULL, NULL, 'team', 'S&N Apt Management Co-Director', 'director', ARRAY['Speranta Property', 'TV House Property'], NULL, true),
('Nicole Babczyk', NULL, NULL, 'team', 'S&N Apt Management Co-Director', 'director', ARRAY['Speranta Property', 'TV House Property'], NULL, true),
('Nina', NULL, NULL, 'team', 'Guest Coordination', 'coordinator', ARRAY['Speranta Property', 'TV House Property'], NULL, true);

-- ============================================================
-- DOMESTIC SERVICES TABLE
-- ============================================================
CREATE TABLE domestic_services (
    id SERIAL PRIMARY KEY,
    cleaner_id INTEGER REFERENCES contacts(id),
    property_id INTEGER REFERENCES properties(id),
    service_date DATE NOT NULL,
    service_type VARCHAR(100) DEFAULT 'cleaning', -- 'cleaning', 'maintenance', 'inspection'
    amount DECIMAL(8,2),
    currency VARCHAR(10) DEFAULT 'ZAR',
    payment_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'paid', 'overdue'
    payment_date DATE,
    payment_method VARCHAR(100), -- 'ewallet', 'bank_transfer', 'cash'
    booking_id INTEGER REFERENCES bookings(id), -- Link to specific booking if applicable
    notes TEXT,
    before_photos TEXT[], -- Array of photo URLs
    after_photos TEXT[], -- Array of photo URLs
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert your existing domestic services data
INSERT INTO domestic_services (cleaner_id, property_id, service_date, amount, payment_status, payment_date, payment_method) VALUES
-- Spiwe's October services (assuming Spiwe is contact id 1, Speranta is property id 1)
(1, 1, '2025-10-08', 350.00, 'paid', '2025-10-08', 'ewallet'),
(1, 1, '2025-10-13', 350.00, 'paid', '2025-10-13', 'ewallet'),
(1, 1, '2025-10-20', 350.00, 'paid', '2025-10-20', 'ewallet'),
(1, 1, '2025-10-28', 350.00, 'paid', '2025-10-28', 'ewallet'),
-- Spiwe's November scheduled
(1, 1, '2025-11-03', 350.00, 'pending', NULL, 'ewallet'),
-- Patricia's September services (assuming Patricia is contact id 2, TV House is property id 2)
(2, 2, '2025-09-03', 350.00, 'paid', '2025-09-03', 'bank_transfer'),
(2, 2, '2025-09-10', 350.00, 'paid', '2025-09-10', 'bank_transfer'),
(2, 2, '2025-09-15', 350.00, 'paid', '2025-09-15', 'bank_transfer'),
-- Patricia's October services
(2, 2, '2025-10-05', 350.00, 'paid', '2025-10-05', 'bank_transfer'),
(2, 2, '2025-10-15', 350.00, 'paid', '2025-10-15', 'bank_transfer'),
(2, 2, '2025-10-21', 350.00, 'paid', '2025-10-21', 'bank_transfer'),
(2, 2, '2025-10-29', 350.00, 'paid', '2025-10-29', 'bank_transfer'),
-- Patricia's November scheduled
(2, 2, '2025-11-04', 350.00, 'pending', NULL, 'bank_transfer'),
(2, 2, '2025-11-12', 350.00, 'pending', NULL, 'bank_transfer');

-- ============================================================
-- FINANCIAL TRANSACTIONS TABLE
-- ============================================================
CREATE TABLE financial_transactions (
    id SERIAL PRIMARY KEY,
    booking_id INTEGER REFERENCES bookings(id),
    domestic_service_id INTEGER REFERENCES domestic_services(id),
    transaction_type VARCHAR(50) NOT NULL, -- 'income', 'expense', 'refund'
    category VARCHAR(100), -- 'booking_payment', 'cleaning_expense', 'maintenance', 'utilities'
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'ZAR',
    description TEXT,
    transaction_date DATE NOT NULL,
    payment_method VARCHAR(100), -- 'bank_transfer', 'ewallet', 'cash', 'platform_payout'
    reference_number VARCHAR(255),
    status VARCHAR(50) DEFAULT 'completed', -- 'pending', 'completed', 'failed', 'refunded'
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- SHOPPING EXPENSES TABLE
-- ============================================================
CREATE TABLE shopping_expenses (
    id SERIAL PRIMARY KEY,
    property_id INTEGER REFERENCES properties(id),
    store_name VARCHAR(255) NOT NULL, -- 'Checkers Sixtysix', 'Pick n Pay', 'Woolworths', etc.
    transaction_date DATE NOT NULL,
    receipt_number VARCHAR(255),
    total_amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'ZAR',
    payment_method VARCHAR(100), -- 'card', 'cash', 'ewallet'
    category VARCHAR(100) DEFAULT 'groceries', -- 'groceries', 'cleaning_supplies', 'maintenance', 'amenities'
    items JSONB, -- Store individual items as JSON: [{"name": "item", "price": 0.00, "quantity": 1}]
    purpose VARCHAR(255), -- 'guest_supplies', 'cleaning_stock', 'maintenance', 'amenities'
    purchased_by VARCHAR(255), -- Who made the purchase
    receipt_photo_url TEXT, -- URL to receipt photo
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for shopping expenses
CREATE INDEX idx_shopping_expenses_property ON shopping_expenses(property_id);
CREATE INDEX idx_shopping_expenses_date ON shopping_expenses(transaction_date);
CREATE INDEX idx_shopping_expenses_store ON shopping_expenses(store_name);

-- ============================================================
-- TASKS TABLE
-- ============================================================
CREATE TABLE tasks (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100), -- 'maintenance', 'cleaning', 'guest_communication', 'admin'
    priority VARCHAR(50) DEFAULT 'medium', -- 'low', 'medium', 'high', 'urgent'
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'cancelled'
    assigned_to INTEGER REFERENCES contacts(id),
    property_id INTEGER REFERENCES properties(id),
    booking_id INTEGER REFERENCES bookings(id),
    due_date DATE,
    completed_date DATE,
    created_by VARCHAR(255), -- User who created the task
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- KNOWLEDGE BASE TABLE
-- ============================================================
CREATE TABLE knowledge_base (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    category VARCHAR(100), -- 'property_info', 'guest_instructions', 'emergency', 'local_area', 'troubleshooting'
    tags TEXT[], -- Array of tags for searching
    property_id INTEGER REFERENCES properties(id), -- NULL if applies to all properties
    is_public BOOLEAN DEFAULT FALSE, -- Whether guests can access this
    created_by VARCHAR(255),
    last_updated_by VARCHAR(255),
    view_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- SYSTEM SETTINGS TABLE
-- ============================================================
CREATE TABLE system_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(255) UNIQUE NOT NULL,
    setting_value JSONB,
    description TEXT,
    category VARCHAR(100), -- 'app_config', 'integrations', 'notifications'
    updated_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default settings
INSERT INTO system_settings (setting_key, setting_value, description, category) VALUES
('booking_platforms', '["Airbnb", "Booking.com", "LekkeSlaap", "Direct"]', 'Available booking platforms', 'app_config'),
('default_currency', '"ZAR"', 'Default currency for financial calculations', 'app_config'),
('cleaning_rate', '350.00', 'Standard cleaning rate per session', 'app_config'),
('notification_preferences', '{"email": true, "sms": false, "whatsapp": true}', 'Default notification settings', 'notifications');

-- ============================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update triggers to all tables
CREATE TRIGGER update_properties_updated_at BEFORE UPDATE ON properties FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_domestic_services_updated_at BEFORE UPDATE ON domestic_services FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_financial_transactions_updated_at BEFORE UPDATE ON financial_transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_shopping_expenses_updated_at BEFORE UPDATE ON shopping_expenses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_knowledge_base_updated_at BEFORE UPDATE ON knowledge_base FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_system_settings_updated_at BEFORE UPDATE ON system_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================

-- View for upcoming bookings with property info
CREATE VIEW upcoming_bookings AS
SELECT 
    b.*,
    p.name as property_name,
    p.address as property_address
FROM bookings b
JOIN properties p ON b.property_id = p.id
WHERE b.checkout_date >= CURRENT_DATE
ORDER BY b.checkin_date;

-- View for domestic services with cleaner and property info
CREATE VIEW domestic_services_detailed AS
SELECT 
    ds.*,
    c.name as cleaner_name,
    c.phone as cleaner_phone,
    p.name as property_name
FROM domestic_services ds
JOIN contacts c ON ds.cleaner_id = c.id
JOIN properties p ON ds.property_id = p.id;

-- View for monthly earnings summary
CREATE VIEW monthly_earnings AS
SELECT 
    DATE_TRUNC('month', service_date) as month,
    cleaner_id,
    c.name as cleaner_name,
    COUNT(*) as services_count,
    SUM(amount) as total_earnings,
    COUNT(CASE WHEN payment_status = 'paid' THEN 1 END) as paid_services,
    SUM(CASE WHEN payment_status = 'paid' THEN amount ELSE 0 END) as paid_amount
FROM domestic_services ds
JOIN contacts c ON ds.cleaner_id = c.id
GROUP BY DATE_TRUNC('month', service_date), cleaner_id, c.name
ORDER BY month DESC, cleaner_name;

-- View for shopping expenses with property details
CREATE VIEW shopping_expenses_detailed AS
SELECT 
    se.*,
    p.name as property_name,
    p.address as property_address
FROM shopping_expenses se
JOIN properties p ON se.property_id = p.id;

-- View for monthly shopping summary
CREATE VIEW monthly_shopping_summary AS
SELECT 
    DATE_TRUNC('month', transaction_date) as month,
    property_id,
    p.name as property_name,
    store_name,
    category,
    COUNT(*) as transaction_count,
    SUM(total_amount) as total_spent,
    AVG(total_amount) as avg_transaction
FROM shopping_expenses se
JOIN properties p ON se.property_id = p.id
GROUP BY DATE_TRUNC('month', transaction_date), property_id, p.name, store_name, category
ORDER BY month DESC, property_name, store_name;

-- ============================================================
-- ROW LEVEL SECURITY (Optional - for multi-user scenarios)
-- ============================================================

-- Enable RLS (uncomment when ready to implement user authentication)
-- ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE domestic_services ENABLE ROW LEVEL SECURITY;

-- Example policy (when implementing auth)
-- CREATE POLICY "Users can view all records" ON bookings FOR SELECT USING (true);
-- CREATE POLICY "Authenticated users can modify" ON bookings FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================
-- SAMPLE QUERIES FOR TESTING
-- ============================================================

/*
-- Get current month domestic services
SELECT * FROM domestic_services_detailed 
WHERE DATE_TRUNC('month', service_date) = DATE_TRUNC('month', CURRENT_DATE);

-- Get upcoming bookings for next 7 days
SELECT * FROM upcoming_bookings 
WHERE checkin_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days';

-- Get monthly earnings for current month
SELECT * FROM monthly_earnings 
WHERE month = DATE_TRUNC('month', CURRENT_DATE);

-- Get all active contacts by category
SELECT * FROM contacts WHERE is_active = true ORDER BY category, name;
*/
