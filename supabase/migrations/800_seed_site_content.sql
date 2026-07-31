-- 800_seed_site_content.sql
-- Runs on BOTH databases.
--
-- Pre-populates the website editor with THE COPY THAT IS ACTUALLY ON THE
-- SITE TODAY, so editing starts from reality instead of empty boxes.
-- Owner's ask: "the text should pre-populate of what's currently in and
-- be like to like of the webpage."
--
-- Every string below is transcribed verbatim from the live Next.js
-- source (nyx-1992/snapartments-frontend @ eb30ca7): pages/index.tsx,
-- pages/about.tsx, pages/contact.tsx and components/Footer.tsx. Nothing
-- here is invented — if a line reads oddly, that is how the site reads.
--
-- Seeded as site_key 'bookings', because that is what snapartments.co.za
-- currently IS: a guest-facing direct-booking site. Under the owner's
-- split (p2-24) the booking site moves to a new domain and
-- snapartments.co.za becomes the management company site, which is the
-- separate, still-empty 'company' key.
--
-- published = false deliberately. The public site does not read from this
-- table yet (p2-26), so "published" would claim something untrue; and
-- when the site IS wired up, publishing should be a decision someone
-- makes, not a side effect of a migration that ran months earlier.
--
-- NOTE ON THE BRANDING: the home page and SEO strings still say
-- "Nestora", which is the old name (roadmap p0-8, superseded by p2-24 —
-- the booking site is being renamed to a Cape Town name, NOT to S&N).
-- They are seeded exactly as they appear rather than silently corrected,
-- because the point of this table is to reflect what visitors currently
-- see. The about page already says "S&N Apt Management", so the site is
-- mid-rebrand and inconsistent with itself — which is now visible in the
-- editor, and fixable there without a deploy.

INSERT INTO public.site_content (org_id, site_key, page, content, published) VALUES
('5966bc67-5c2f-45ae-8519-9b7eaeee09f4', 'bookings', 'home', jsonb_build_object(
  'badge', 'Book direct · No Airbnb fees · Best rate guaranteed',
  'headline', 'Cape Town',
  'headline_accent', 'beach stays',
  'subhead', 'Wake up to ocean air in Blouberg and Tableview. Book directly with us and skip the platform fees.',
  'cta_label', 'View our stays →',
  'cta_secondary_label', '💬 Ask us anything',
  'intro_eyebrow', 'Why book with Nestora',
  'intro_title', 'Skip the middleman. Get more for less.',
  'b1_title', 'Save up to 20%',
  'b1_desc', 'Platform fees are real. When you book directly with us, those fees stay in your pocket. Same property, better price.',
  'b2_title', 'Direct communication',
  'b2_desc', 'No chatbot, no ticket system. Message us on WhatsApp and get a response within the hour from someone who actually knows the properties.',
  'b3_title', 'Flexible & personal',
  'b3_desc', 'Need early check-in? A late checkout? A restaurant recommendation? We manage these properties ourselves and love making stays special.',
  'closing_title', 'Ready for your Cape Town escape?',
  'closing_body', 'Check availability and book directly. No service fees, no price hikes — just the best rate, straight from us.'
), false),

('5966bc67-5c2f-45ae-8519-9b7eaeee09f4', 'bookings', 'about', jsonb_build_object(
  'eyebrow', 'Who we are',
  'headline', 'S&N Apt Management.',
  'headline_accent', 'Stays with soul.',
  'body', 'Two people. Two properties. One shared love of Cape Town and genuinely good hosting.'
), false),

('5966bc67-5c2f-45ae-8519-9b7eaeee09f4', 'bookings', 'contact', jsonb_build_object(
  'headline', 'Get in touch',
  'body', 'Message us on WhatsApp and we usually reply within the hour.',
  'email', 'sn_apt_management@outlook.com',
  'whatsapp', '27799779455'
), false),

('5966bc67-5c2f-45ae-8519-9b7eaeee09f4', 'bookings', 'seo', jsonb_build_object(
  'title', 'Nestora — Direct Beach Stays in Cape Town',
  'description', 'Book direct and save. Beautiful apartments and houses in Blouberg and Tableview, Cape Town. No platform fees, best rate guaranteed.'
), false)

ON CONFLICT (org_id, site_key, page) DO NOTHING;

-- End 800_seed_site_content.
