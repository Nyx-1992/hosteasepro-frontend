import type { NextApiRequest, NextApiResponse } from 'next';

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    bookingId, reference, guestName, guestEmail, guestPhone,
    property, checkIn, checkOut, nights, total,
  } = req.body;

  if (!guestEmail) return res.status(400).json({ error: 'Guest email required' });
  if (!RESEND_API_KEY) return res.status(500).json({ error: 'Email service not configured' });

  const fmt = (n: number) => `R${Number(n).toLocaleString('en-ZA')}`;
  const ref = reference || `NESTORA-${bookingId}`;

  const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"/></head>
    <body style="font-family: Arial, sans-serif; background: #f5f0e8; margin: 0; padding: 24px;">
      <div style="max-width: 560px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header -->
        <div style="background: #0E4D6B; padding: 28px 32px; text-align: center;">
          <div style="font-size: 40px; margin-bottom: 8px;">🎉</div>
          <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 600;">Booking Confirmed!</h1>
          <p style="color: rgba(255,255,255,0.7); margin: 8px 0 0; font-size: 14px;">
            Your stay at ${property} is confirmed
          </p>
        </div>

        <!-- Greeting -->
        <div style="padding: 28px 32px 0;">
          <p style="font-size: 15px; color: #1C1A17; margin: 0 0 20px;">
            Hi ${guestName.split(' ')[0]} 👋,<br/><br/>
            Great news — we've confirmed your booking! Please find all the details below and
            make sure to complete your payment using the reference number provided.
          </p>
        </div>

        <!-- Booking details -->
        <div style="padding: 0 32px 24px;">
          <h2 style="font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #9ca3af; margin: 0 0 14px;">Booking Details</h2>
          <table style="width: 100%; border-collapse: collapse; border-radius: 12px; overflow: hidden; border: 1px solid #e8dcc8;">
            ${[
              ['Property',   property],
              ['Check-in',   checkIn + ' from 15:00'],
              ['Check-out',  checkOut + ' by 10:00'],
              ['Nights',     `${nights}`],
              ['Reference',  ref],
              ['Amount Due', fmt(total)],
            ].map(([label, value], i) => `
              <tr style="background: ${i % 2 === 0 ? '#f9f6f0' : 'white'};">
                <td style="padding: 11px 16px; font-size: 13px; color: #6b7280; font-weight: 600; width: 38%;">${label}</td>
                <td style="padding: 11px 16px; font-size: 13px; color: #1C1A17; font-weight: ${label === 'Amount Due' || label === 'Reference' ? '700' : '400'}; ${label === 'Amount Due' ? 'color: #0E4D6B;' : ''} ${label === 'Reference' ? 'color: #e05a3a;' : ''}">${value}</td>
              </tr>
            `).join('')}
          </table>
        </div>

        <!-- Payment details -->
        <div style="padding: 0 32px 28px;">
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px;">
            <h2 style="font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #15803d; margin: 0 0 14px;">
              💳 Payment Details
            </h2>
            <p style="font-size: 13px; color: #166534; margin: 0 0 12px;">
              Please make your EFT payment within 24 hours to secure your booking.
              Use your reference number so we can match the payment.
            </p>
            <table style="width: 100%; border-collapse: collapse;">
              ${[
                ['Account Name',   'S&N Apt Management'],
                ['Bank',           'Nedbank'],
                ['Account Type',   'Cheque'],
                ['Branch Code',    '198765'],
                ['Account Number', '1292867345'],
                ['Reference',      ref],
                ['Amount',         fmt(total)],
              ].map(([label, value]) => `
                <tr>
                  <td style="padding: 6px 0; font-size: 13px; color: #166534; font-weight: 600; width: 45%;">${label}</td>
                  <td style="padding: 6px 0; font-size: 13px; color: #14532d; font-weight: ${label === 'Amount' || label === 'Reference' ? '700' : '400'};">${value}</td>
                </tr>
              `).join('')}
            </table>
            <p style="font-size: 12px; color: #15803d; margin: 14px 0 0; border-top: 1px solid #bbf7d0; padding-top: 12px;">
              After payment, send your proof of payment to<br/>
              <a href="mailto:sn_apt_management@outlook.com" style="color: #0E4D6B; font-weight: 600;">sn_apt_management@outlook.com</a>
            </p>
          </div>
        </div>

        <!-- Check-in info -->
        <div style="padding: 0 32px 28px;">
          <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 12px; padding: 20px;">
            <h2 style="font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #0369a1; margin: 0 0 12px;">
              🏠 Before You Arrive
            </h2>
            <ul style="margin: 0; padding: 0 0 0 16px; font-size: 13px; color: #0c4a6e; line-height: 1.8;">
              <li>Check-in is from <strong>15:00</strong> on ${checkIn}</li>
              <li>Check-out is by <strong>10:00</strong> on ${checkOut}</li>
              <li>We'll send your access code and WiFi details 24h before arrival</li>
              <li>Contact us anytime on WhatsApp: <strong>+27 79 977 9455</strong></li>
            </ul>
          </div>
        </div>

        <!-- WhatsApp CTA -->
        <div style="padding: 0 32px 28px; text-align: center;">
          <a href="https://wa.me/27799779455?text=Hi!%20I%20have%20a%20confirmed%20booking%20(${encodeURIComponent(ref)})%20and%20have%20questions."
            style="display: inline-block; background: #25D366; color: white; text-decoration: none; padding: 13px 28px; border-radius: 50px; font-size: 14px; font-weight: 600;">
            💬 Message us on WhatsApp
          </a>
        </div>

        <!-- Footer -->
        <div style="background: #f9f6f0; border-top: 1px solid #e8dcc8; padding: 16px 32px; text-align: center;">
          <p style="margin: 0; font-size: 12px; color: #9ca3af;">
            🐚 Nestora · S&N Apt Management · Blouberg, Cape Town<br/>
            <a href="https://nestora-homepage-yb2q.vercel.app" style="color: #0E4D6B; text-decoration: none;">nestora-homepage-yb2q.vercel.app</a>
          </p>
        </div>

      </div>
    </body>
    </html>
  `;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from:    'Nestora Bookings <onboarding@resend.dev>',
        to:      [guestEmail],
        cc:      ['sn_apt_management@outlook.com'],
        subject: `✅ Booking Confirmed — ${property} | ${checkIn} → ${checkOut} | Ref: ${ref}`,
        html:    emailHtml,
      }),
    });

    if (!r.ok) {
      const err = await r.text();
      console.error('[confirm] Resend error:', err);
      return res.status(500).json({ success: false, error: err });
    }

    console.log('[confirm] Guest confirmation sent to', guestEmail);
    return res.status(200).json({ success: true, reference: ref });
  } catch (err) {
    console.error('[confirm] Failed:', err);
    return res.status(500).json({ success: false, error: String(err) });
  }
}
