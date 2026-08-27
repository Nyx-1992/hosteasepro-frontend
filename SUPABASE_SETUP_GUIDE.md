# 🚀 Supabase Database Setup Guide
## S&N Apt Management - Property Management System

This guide will help you set up Supabase database integration for your property management system, following your demo → private GitHub → Vercel workflow.

---

## 📋 Phase 1: Supabase Project Creation

### Step 1: Create Supabase Account & Project

1. **Go to [supabase.com](https://supabase.com)**
2. **Sign up** with your email or GitHub account
3. **Create a new project:**
   - Project name: `s-n-apt-management`
   - Database password: `[Choose a strong password]`
   - Region: Choose closest to South Africa (e.g., `eu-west-1`)
   - Pricing: **Free tier** (perfect for your needs)

### Step 2: Get Your Project Credentials

1. **Go to Settings → API** in your Supabase dashboard
2. **Copy these values:**
   ```
   Project URL: https://[your-project-id].supabase.co
   anon/public key: eyJ... (starts with eyJ)
   ```

### Step 3: Set Up Database Schema

1. **Go to SQL Editor** in your Supabase dashboard
2. **Copy and paste** the contents of `database-schema.sql`
3. **Click "Run"** to create all tables and insert initial data

---

## ⚙️ Phase 2: Integration Setup

### Step 1: Configure Database Connection

1. **Open `database.js`** in your project
2. **Replace these lines (around line 12-13):**
   ```javascript
   const SUPABASE_URL = 'your-supabase-url'; // Replace with your actual URL
   const SUPABASE_ANON_KEY = 'your-supabase-anon-key'; // Replace with your actual key
   ```
   
   **With your actual credentials:**
   ```javascript
   const SUPABASE_URL = 'https://[your-project-id].supabase.co';
   const SUPABASE_ANON_KEY = 'eyJ[your-actual-anon-key]';
   ```

### Step 2: Test the Integration

1. **Open your `index.html`** in the browser
2. **Go to the Bookings tab**
3. **You should see a new "Database Management" panel**
4. **Click "🔗 Connect Database"**
5. **If successful, you'll see:** ✅ Database connected successfully!

---

## 📊 Phase 3: Data Migration

### Step 1: Migrate Existing Data

1. **Click "📊 Migrate Data"** in the Database Management panel
2. **This will move your localStorage data to Supabase:**
   - Past bookings
   - Manual contacts
   - Tasks
   - Any other stored data

### Step 2: Verify Migration

1. **Click "📈 Database Stats"** to see your data counts
2. **Check the Past Bookings tab** - should show migrated data
3. **Your data is now safely stored in Supabase!**

---

## 🔄 Phase 4: Your Workflow Integration

### Demo Development (Current Laptop)
```bash
# Your current setup - no changes needed!
# Just continue working as normal
# Data now saves to Supabase automatically
```

### Migration to Private GitHub
1. **Copy all files** to your private repository
2. **Create `.env.local`** file:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://[your-project-id].supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ[your-anon-key]
   ```
3. **Add `.env.local` to `.gitignore`** (never commit credentials!)

### Vercel Deployment
1. **Connect your private GitHub repo to Vercel**
2. **In Vercel Dashboard → Settings → Environment Variables:**
   ```
   NEXT_PUBLIC_SUPABASE_URL = https://[your-project-id].supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY = eyJ[your-anon-key]
   ```
3. **Deploy** - your production site will use the same database!

---

## ✨ Features You Now Have

### 🔄 Real-time Data Sync
- All changes save instantly to cloud database
- No more lost data from localStorage
- Access from any device

### 📱 Multi-device Access
- Same data on laptop, phone, tablet
- Perfect for property management on the go

### 🔒 Data Security
- Professional database backup
- No more risk of losing browser data
- Secure cloud storage

### 🚀 Scalability
- Add team members easily
- Handle unlimited bookings
- Professional-grade infrastructure

---

## 🛠️ Troubleshooting

### Connection Issues
```javascript
// If you see connection errors, check:
1. Supabase URL is correct (includes https://)
2. Anon key is complete (very long, starts with eyJ)
3. No extra spaces or quotes in credentials
```

### Migration Problems
```javascript
// If migration fails:
1. Check browser console for error messages
2. Ensure database schema was created successfully
3. Test connection first before migrating
```

### Fallback Mode
```javascript
// System automatically falls back to localStorage if:
1. Database connection fails
2. You haven't set up Supabase yet
3. Network issues occur
```

---

## 📈 Next Steps After Setup

### Immediate Benefits
- ✅ No more data loss
- ✅ Professional database
- ✅ Multi-device access
- ✅ Easy team collaboration

### Future Enhancements
- 📱 Mobile app support
- 👥 Multi-user access
- 📊 Advanced reporting
- 🔄 API integrations

### Production Readiness
- 🏗️ Scalable infrastructure
- 🔒 Enterprise-grade security
- 📱 Cross-platform compatibility
- 🌍 Global CDN distribution

---

## 💡 Pro Tips

### Development Workflow
```bash
# Demo laptop → make changes → test locally
# Copy to private GitHub → commit & push
# Vercel automatically deploys → production ready!
```

### Data Management
- Use Supabase dashboard to view/edit data
- Export data anytime for backup
- Real-time collaboration with Silja

### Scaling Up
- Free tier: 50K rows, 500MB storage
- Paid tier: Unlimited (starts at $25/month)
- Perfect for growing business

---

## 🎉 You're All Set!

Your property management system now has:
- ✅ Professional cloud database
- ✅ Seamless demo → production workflow
- ✅ Real-time data synchronization
- ✅ Enterprise-grade infrastructure

**Ready to manage Speranta and TV House like a pro! 🏠✨**

---

*Need help? Check the browser console for detailed logs and error messages.*

---

## ⏸ Keeping hep-staging awake (free tier)

**What happened.** Supabase emailed: *"Your project hep-staging is going to
be paused"* — free-tier projects pause after 7 days without activity. By
the time the email was read it had already paused.

**Why staging matters.** Every migration goes to staging first and is
proved there before production. That is how the empty-`months` CHECK, the
rate-seasons hole and the weekend-vs-holiday rule were all caught before
they reached real bookings. Testing straight on production instead is the
expensive way to find those.

**Restoring.** Supabase dashboard → the project → **Restore**. Free, takes
a few minutes. Only possible **within 90 days** of pausing; after that the
project is gone for good.

### What actually keeps it awake

**The first attempt did not work, and it is worth knowing why.** The ping
was put inside `api/cron/trial-reminders.js`, which `vercel.json` schedules
for 07:00 daily. The project paused anyway.

**Vercel's cron is not firing.** Booking.com publishes a rolling block
whose dates shift by a day every day, so any daily sync leaves an
`updated_at` mark on those rows. Across thirty days of bookings there is
**not one mark at 04:00 or 07:00 UTC** — the only two times `vercel.json`
schedules. Every mark that does exist is at an irregular hour, matching the
cron-job.org job and somebody having HEP open.

So the ping now lives in `api/_lib/keepAlive.js` and is called from **both**
cron endpoints, including `/api/cron/ical-sync`, which the external
scheduler demonstrably calls. Each run reports the result
(`stagingKeepalive` / `staging_keepalive`) in its JSON.

### Still worth adding the cron-job.org entry

Belt and braces, because it depends on nothing inside Vercel and you can
see its success log yourself:

| Field    | Value                                                                                          |
|----------|------------------------------------------------------------------------------------------------|
| URL      | `https://rwsfbgtvqbkunbfvviiz.supabase.co/rest/v1/public_holidays?select=country_code&limit=1`  |
| Schedule | Once a day, any time                                                                            |
| Method   | GET                                                                                             |
| Header   | `apikey` = `sb_publishable_ze-KmzAYuc3JRq2RKVhx5w_Pgb1lc46`                                     |

That key is the **publishable** key: public by design, guarded by RLS, and
`public_holidays` is a global table of calendar dates with no agency data.

### The bigger question this uncovered

If Vercel's cron is not running, the **daily booking sync is not running
either** — the job built so bookings arrive without anyone having HEP open.
What has been covering for it is the external cron-job.org job and people
pressing Sync.

Worth checking in **Vercel → the project → Settings → Cron Jobs**, which
shows each job's last run. If they are disabled or have never fired, that
explains more than a paused staging database.

**A ping cannot revive a project that has already paused** — that needs
**Restore** in the Supabase dashboard, within 90 days.

### While you are in there: `old-host-ease-pro`

There is a third project, `old-host-ease-pro`, paused since **October
2025** — well past the 90-day window, so it cannot be restored and is not
coming back. It is dead weight in the dashboard. Deleting it is safe as
far as HEP is concerned; nothing points at it. Left alone here because
deleting somebody's database is their call, not a script's.
