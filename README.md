# 🏠 Property Management System

A comprehensive property management platform for short-term rental properties, built specifically for managing Speranta and TV House properties in Cape Town.

## 🚀 Features

### **Core Management**
- **Property Overview**: Complete property details for Speranta (35 Athens Road Blouberg) and TV House (110 Athens Road Tableview)
- **Booking Management**: Integration with Booking.com, Airbnb, LekkeSlaap, and FeWo
- **Check-in System**: Monthly inspections with 5 comprehensive categories
- **Task Management**: Inline editing and task tracking
- **Financial Tracking**: Dual-currency support (EUR/ZAR)

### **Security & Access Control**
- **Role-based Authentication**: Three user levels with customized access
- **Dynamic UI**: Users only see tabs they're authorized to access
- **Secure Credentials**: Encrypted password storage with bcrypt

### **Analytics & Reporting**
- **Live Metrics Dashboard**: Compact occupancy rate and revenue tracking
- **Advanced Analytics**: Performance insights for occupancy optimization
- **Financial Reports**: Comprehensive reporting system

## 🔐 User Accounts

### Admin Access (Full Access)
- **Email**: `sn_apt_management@outlook.com`
- **Password**: `Sevilla2015!`
- **Users**: Nicole and Silja
- **Access**: All 9 tabs (Properties, Bookings, Check-in, Domestic, Tasks, Knowledge Base, Invoices, Reports, Financial)

### Property Manager (Restricted)
- **Email**: `vanwyk.nina@gmail.com`
- **Password**: `HelloWorld1!`
- **User**: Nina Williams
- **Phone**: +27 083 702 2421
- **Access**: All tabs except Reports & Financial (tabs hidden from UI)

### Customer Account (Limited)
- **Email**: `customer@nyxtraining.com`
- **Password**: `password123`
- **Access**: Basic functionality only

## 🏗️ Architecture

### Frontend
- **Framework**: HTML/CSS/JavaScript with Material-UI styling
- **Features**: Responsive design, tabbed navigation, role-based UI
- **Main File**: `demo/index_fixed.html`

### Backend
- **Database**: MongoDB with User, Property, and KnowledgeBase models
- **Authentication**: bcrypt password hashing
- **Setup**: `backend/setup.js` for database initialization

## 📂 Project Structure

```
├── demo/
│   ├── index_fixed.html          # Main application (working version)
│   └── index.html                # Legacy version
├── backend/
│   ├── setup.js                  # Database initialization
│   └── src/                      # Additional backend services
├── frontend/                     # Additional frontend resources
├── deploy.bat/.sh               # Deployment scripts
└── README.md                    # This file
```

## 🚀 Quick Start

### 1. Open the Application
Simply open `demo/index_fixed.html` in your web browser.

### 2. Login
Use the convenient auto-fill buttons:
- Click **"Fill Admin"** for admin access
- Click **"Fill Nina"** for property manager access
- Then click **"Login"**

### 3. Navigate
Each user will see only the tabs they're authorized to access.

## 💾 Database Setup (Optional)

If you want to run the full backend:

1. Install MongoDB
2. Run the setup script:
   ```bash
   cd backend
   node setup.js
   ```

## 🎯 Key Features by Tab

### **Properties Tab**
- Property details for both locations
- Contact information and access codes
- Property-specific settings

### **Check-in Tab**
- Monthly inspection system
- 5 inspection categories: Cleanliness, Maintenance, Inventory, Safety, Guest Experience
- Status tracking and notes

### **Tasks Tab**
- Inline task editing
- Priority levels and assignment
- Progress tracking

### **Bookings Tab**
- Platform integration management
- Booking calendar and status
- Guest communication tools

### **Financial Tab** (Admin only)
- Revenue tracking (EUR/ZAR)
- Expense management
- Financial reporting

### **Knowledge Base Tab**
- Property information database
- WiFi passwords and access codes
- Local area information

## 🔧 Technical Details

### Authentication System
- JWT-like session management
- Role-based access control
- Personalized greetings

### Responsive Design
- Mobile-friendly interface
- Tablet optimization
- Desktop full-feature experience

### Data Integration
- Real Trello data integration
- Live metrics calculation
- Platform booking synchronization

## 📱 iPad/Mobile Usage

This system works great on iPad through:
- **GitHub Codespaces**: Full VS Code experience
- **vscode.dev**: Browser-based editing
- **Direct Browser**: Application usage

## 🛠️ Development

### Making Changes
1. Edit `demo/index_fixed.html` for frontend changes
2. Update `backend/setup.js` for database changes
3. Test with different user roles

### Adding New Users
Update the users object in the login function with new credentials and restrictions.

### Adding New Tabs
1. Add tab button in navigation
2. Create tab content section
3. Update `hideRestrictedTabs` function if needed

## 📞 Support

For questions or issues with this property management system, contact the development team.

---

**Built with ❤️ for efficient property management** - Property Management System

A comprehensive property management platform for short-term rental businesses. Built for managing multiple properties across various booking platforms (Airbnb, Booking.com, LekkeSlaap, Fewo) with automated calendar synchronization, check-in management, financial tracking, and reporting capabilities.

## 🏠 Features

### Core Functionality
- **Multi-Property Management**: Manage Speranta and TV House properties
- **Platform Integration**: Automated iCal sync from Booking.com, LekkeSlaap, Fewo, and Airbnb
- **Role-Based Access**: Admin, Property Manager (Nina), and Customer roles
- **Real-time Dashboard**: Overview of bookings, revenue, and occupancy

### Booking Management
- **Automated Synchronization**: iCal feeds automatically import bookings
- **Manual Booking Entry**: Add domestic bookings directly
- **Status Tracking**: Pending, confirmed, checked-in, checked-out status management
- **Guest Information**: Complete guest profiles and communication history

### Check-in Management (Nina's Interface)
- **Check-in Processing**: Digital check-in with notes and key handover tracking
- **Check-out Management**: Damage reports, cleaning notes, and key return
- **Priority System**: Today/tomorrow bookings highlighted for immediate attention
- **Mobile-Friendly**: Optimized for tablet/mobile use during property visits

### Knowledge Base System
- **Centralized Documentation**: Procedures, troubleshooting guides, emergency info
- **Categorized Articles**: Procedures, maintenance, guest info, emergency protocols
- **Search Functionality**: Quick access to relevant information
- **Team Collaboration**: All team members can contribute and access knowledge

### Financial Management & Reporting
- **Income Tracking**: Booking revenue, cleaning fees, additional charges
- **Expense Management**: Cleaning, maintenance, supplies, platform fees
- **Financial Reports**: Income statements, expense reports, profit margins
- **Invoice Generation**: Automated invoicing system for accounting
- **Tax Reporting**: Generate reports for accounting and tax compliance

## 🚀 Technology Stack

### Backend
- **Node.js** with Express framework
- **MongoDB** with Mongoose ODM
- **JWT Authentication** with role-based access control
- **iCal Parser** for calendar synchronization
- **PDF Generation** for invoices and reports

### Frontend
- **React 18** with functional components and hooks
- **Material-UI (MUI)** for professional interface design
- **React Query** for server state management
- **React Router** for navigation
- **Axios** for API communication

## 📋 Prerequisites

Before running the application, ensure you have:

- **Node.js** (v16 or higher)
- **MongoDB** (local installation or MongoDB Atlas)
- **Git** for version control

## 🛠️ Installation & Setup

### 1. Clone the Repository
```bash
git clone https://github.com/yourusername/nyx-training.git
cd nyx-training
```

### 2. Backend Setup
```bash
cd backend
npm install
```

Create environment file:
```bash
cp .env.example .env
```

Edit `.env` file with your configuration:
```env
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://localhost:27017/nyx-training
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
CORS_ORIGIN=http://localhost:3000
```

### 3. Frontend Setup
```bash
cd ../frontend
npm install
```

### 4. Database Initialization
```bash
cd ../backend
node setup.js
```

This will create:
- Admin user: sn_apt_management@outlook.com / Speranta2015!
- Property Manager: nina@nyxtraining.com / password123
- Customer user: customer@nyxtraining.com / password123
- Sample properties (Speranta and TV House) with iCal integrations
- Initial knowledge base articles

## 🎯 Running the Application

### Start MongoDB
Ensure MongoDB is running on your system.

### Start Backend Server
```bash
cd backend
npm run dev
```
Backend will run on http://localhost:5000

### Start Frontend Application
```bash
cd frontend
npm start
```
Frontend will run on http://localhost:3000

## 👥 User Roles & Access

### Admin Role (You & Silja)
- Full system access
- Property management (create, edit, delete)
- User management
- Financial reports and invoice generation
- iCal synchronization management
- All booking operations

### Property Manager Role (Nina)
- Check-in/check-out management
- Booking status updates
- Guest communication
- Knowledge base contribution
- Financial record entry (cleaning, maintenance)
- Property maintenance reporting

### Customer Role
- View personal bookings
- Access knowledge base (guest information)
- Limited dashboard access

## 🔄 iCal Integration

The system automatically synchronizes with your booking platforms:

### Speranta Property
- Booking.com: `https://ical.booking.com/v1/export?t=8123e217-45b4-403d-8fa0-9dcc65c26800`
- LekkeSlaap: `https://www.lekkeslaap.co.za/suppliers/icalendar.ics?t=bXEzOHNicTJQT3Nkd1dHb1ZSaXhRUT09`
- Fewo: `http://www.fewo-direkt.de/icalendar/12b719114ecd42adab4e9ade2d2458e6.ics?nonTentative`
- Airbnb: `https://www.airbnb.com/calendar/ical/1237076374831130516.ics?s=01582d0497e99114aa6013156146cea4&locale=en-GB`

### TV House Property
- Booking.com: `https://ical.booking.com/v1/export?t=ea29c451-4d0b-4fa4-b7a8-e879a33a8940`
- LekkeSlaap: `https://www.lekkeslaap.co.za/suppliers/icalendar.ics?t=QzZ2aFlFVHhxYnoxdGRVL3ZwelRGUT09`
- Airbnb: `https://www.airbnb.com/calendar/ical/1402174824640448492.ics?s=373c5a71c137230a72f928e88728dcf3&locale=en-GB`

**Auto-sync**: Every 2 hours (configurable)
**Manual sync**: Available via admin interface

## 📱 Usage Guide

### For Administrators (You & Silja)

1. **Dashboard**: View overall business metrics, upcoming check-ins/outs
2. **Properties**: Manage property details and platform integrations
3. **Bookings**: View all bookings with filtering and search
4. **Financial**: Track income/expenses, generate reports
5. **Knowledge Base**: Manage team documentation

### For Property Manager (Nina)

1. **Check-in Management**: 
   - View today's and upcoming arrivals
   - Process check-ins with digital forms
   - Note any issues or special requests
   
2. **Check-out Management**:
   - Process departures
   - Record cleaning requirements
   - Report any damages

3. **Knowledge Base**: Access procedures and troubleshooting guides

### Daily Workflow for Nina

1. **Morning**: Check dashboard for today's check-ins/outs
2. **Pre-arrival**: Ensure properties are ready (use cleaning checklist)
3. **Check-in**: Process arrivals using mobile interface
4. **Check-out**: Complete departure procedures and cleaning notes
5. **Evening**: Update any maintenance or supply needs

## 🔧 Configuration

### iCal Sync Settings
- Interval: Set in `ICAL_SYNC_INTERVAL_HOURS` (default: 2 hours)
- Manual sync available via admin interface

### Email Notifications (Optional)
Configure SMTP settings in `.env` for automated notifications:
```env
SMTP_HOST=your-smtp-host
SMTP_PORT=587
SMTP_USER=your-email
SMTP_PASS=your-password
```

## 📊 Financial Management

### Automated Revenue Tracking
- Booking revenue automatically calculated from iCal imports
- Platform fees and cleaning fees tracked separately
- Multi-currency support (default: ZAR)

### Expense Tracking
- Manual entry for cleaning, maintenance, supplies
- Categorized expenses for reporting
- Receipt attachment support

### Reporting
- Monthly/quarterly profit & loss statements
- Tax-ready reports for accounting
- Property-specific performance metrics

## 🛡️ Security Features

- JWT-based authentication
- Role-based access control
- Rate limiting on API endpoints
- Input validation and sanitization
- Secure password hashing (bcrypt)

## 🔍 Troubleshooting

### Common Issues

1. **MongoDB Connection Error**
   - Ensure MongoDB is running
   - Check MONGODB_URI in .env file

2. **iCal Sync Not Working**
   - Verify iCal URLs are accessible
   - Check internet connectivity
   - Review sync logs in backend console

3. **Login Issues**
   - Ensure backend server is running
   - Check network connectivity
   - Verify user exists (run setup.js if needed)

### Development Mode
```bash
# Backend with auto-restart
cd backend && npm run dev

# Frontend with hot reload
cd frontend && npm start
```

## 🚀 Deployment

### Production Checklist
1. Set NODE_ENV=production
2. Use strong JWT_SECRET
3. Configure production MongoDB instance
4. Set up SSL certificates
5. Configure reverse proxy (nginx)
6. Set up backup strategy
7. Monitor application logs

## 🤝 Support & Maintenance

### Regular Tasks
- Weekly: Review financial reports
- Monthly: Update knowledge base articles
- Quarterly: Backup database
- As needed: Update property information and platform integrations

### Additional Features Roadmap
- Mobile app for Nina
- WhatsApp integration for guest communication
- Automated cleaning scheduling
- Smart lock integration
- Advanced analytics and forecasting

## 📞 Contact

For technical support or feature requests, contact the development team.

---

**Built with ❤️ for Nyx Training Property Management**
\n+## 🌐 Online Deployment (No Local CLI)

This project deploys database migrations and the `import_ical` Edge Function automatically using **GitHub Actions**. You do **not** need to install the Supabase CLI on your work laptop.

### 1. Prerequisites
| Item | Where to find |
|------|---------------|
| Supabase Project Ref | In project URL (already: `dkyzbzlshrxdwetykmdo`) |
| Supabase Access Token | Supabase dashboard → Avatar → Account → Access Tokens |
| GitHub Repo Admin Rights | Needed to add secrets |

### 2. GitHub Secret Setup
1. Create access token in Supabase (Account → Access Tokens → New Token).
2. In GitHub repo: Settings → Secrets and variables → Actions → New repository secret.
3. Name: `SUPABASE_ACCESS_TOKEN` | Value: paste token.
4. Save.

You do **not** need the service role key for the workflow. Keep it private for server-only use.

### 3. Workflow File
The workflow lives at: `.github/workflows/supabase-deploy.yml`
It runs on pushes to `main` affecting migrations or the Edge Function.

### 4. What Happens On Push
1. Checkout repository.
2. Install Supabase CLI in runner.
3. Link to project using `SUPABASE_ACCESS_TOKEN` + project ref.
4. Apply migrations in `supabase/migrations/` (001 → 040).
5. Deploy edge function `import_ical`.

### 5. Seeding Data (Manual)
Seeds are **not** auto‑run for safety (contain private feed URLs). Run manually in Supabase SQL Editor:
Order:
```sql
-- 1. Core organization + admin/manager
-- Open file: supabase/seeds/001_seed_core.sql and execute its contents.

-- 2. Ensure properties exist (Speranta Flat, TV House)
INSERT INTO public.properties (org_id, name, status)
SELECT id, 'Speranta Flat', 'active' FROM public.organizations
WHERE NOT EXISTS (SELECT 1 FROM public.properties WHERE name='Speranta Flat') LIMIT 1;

INSERT INTO public.properties (org_id, name, status)
SELECT id, 'TV House', 'active' FROM public.organizations
WHERE NOT EXISTS (SELECT 1 FROM public.properties WHERE name='TV House') LIMIT 1;

-- 3. iCal feed URLs
-- Open file: supabase/seeds/010_seed_ical_feeds.sql and execute.
```

### 6. Scheduling Automatic Imports
To enable hourly calendar sync, edit the workflow file and change:
```yaml
      - name: (Optional) Schedule hourly import
   if: ${{ false }}
```
to
```yaml
   if: always()
```
Commit the change; next run creates the cron schedule.

### 7. Manual Invocation (Testing)
After deployment: Supabase dashboard → Functions → `import_ical` → Invoke.
Or HTTP request:
```
GET https://dkyzbzlshrxdwetykmdo.functions.supabase.co/import_ical
```

### 8. Verification Queries
Run in SQL Editor:
```sql
SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('organizations','properties','bookings','ical_feeds');
SELECT COUNT(*) FROM public.organizations;
SELECT platform, feed_url FROM public.ical_feeds;
```

### 9. Adding Future Migrations
1. Create new file in `supabase/migrations/` with next number (e.g., `050_new_feature.sql`).
2. Commit & push to `main`.
3. Action runs automatically.

### 10. Rollback Strategy (Simple)
If a migration breaks something:
1. Create a new migration file to reverse/unwind (avoid editing old files).
2. Push; workflow applies forward-only fix.

### 11. Security Notes
- Keep repo **private** while ICS feed URLs remain in seed file.
- Never commit real secrets: use GitHub secrets for tokens/keys.
- Consider moving iCal URLs to a protected table accessible only by admin policies (already done) and removing them from the repo later.

### 12. Next Improvements
- Add automated seed job once feeds moved to env variables.
- Introduce `current_user_roles()` helper to simplify policy conditions.
- Add pgTAP tests for triggers/functions.

Online deployment is now hands‑off: push code → CI updates Supabase automatically.
