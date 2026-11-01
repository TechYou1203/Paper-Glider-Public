import nodemailer from 'nodemailer';

interface SendVerificationEmailOptions {
  email: string;
  username: string;
  code: string;
  type?: 'signup' | 'login' | 'reset';
}

interface SendEmailResult {
  sent: boolean;
  simulated?: boolean;
  message?: string;
  error?: string;
}

export async function sendVerificationEmail({
  email,
  username,
  code,
  type = 'signup',
}: SendVerificationEmailOptions): Promise<SendEmailResult> {
  const isGmail = Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
  const isSmtp = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  const isResend = Boolean(process.env.RESEND_API_KEY);

  const subject =
    type === 'signup'
      ? `Paper Glider — Your Flight Authorization Code: ${code}`
      : `Paper Glider — Your Login Verification Code: ${code}`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body style="margin: 0; padding: 0; background-color: #faf7ed; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
        <table width="100%" cellpadding="0" cellspacing="0" style="padding: 24px 12px; background-color: #faf7ed;">
          <tr>
            <td align="center">
              <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px; background-color: #ffffff; border: 3px solid #2d2a26; border-radius: 18px; box-shadow: 6px 6px 0px #2d2a26; overflow: hidden;">
                <!-- Header -->
                <tr>
                  <td style="padding: 24px 24px 16px; text-align: center; background-color: #fef9c3; border-bottom: 2px solid #2d2a26;">
                    <div style="font-size: 32px; line-height: 1; margin-bottom: 8px;">✈️</div>
                    <h1 style="margin: 0; font-size: 24px; font-weight: 800; color: #1e293b; letter-spacing: -0.5px;">Paper Glider</h1>
                    <p style="margin: 4px 0 0; font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 1px;">Flight Authorization Office</p>
                  </td>
                </tr>

                <!-- Content -->
                <tr>
                  <td style="padding: 28px 24px;">
                    <p style="margin: 0 0 12px; font-size: 15px; color: #334155;">
                      Hello Pilot <strong style="color: #0284c7;">${username}</strong>,
                    </p>
                    <p style="margin: 0 0 20px; font-size: 14px; color: #64748b; line-height: 1.5;">
                      Enter this 6-digit flight verification code to authorize your Paper Glider account:
                    </p>

                    <!-- Code Box -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0;">
                      <tr>
                        <td align="center">
                          <div style="display: inline-block; padding: 14px 28px; background-color: #f8fafc; border: 2px solid #2d2a26; border-radius: 12px; box-shadow: 3px 3px 0px #2d2a26;">
                            <span style="font-family: monospace, Courier; font-size: 32px; font-weight: 900; letter-spacing: 6px; color: #0f172a;">
                              ${code}
                            </span>
                          </div>
                        </td>
                      </tr>
                    </table>

                    <p style="margin: 20px 0 0; font-size: 12px; color: #94a3b8; text-align: center;">
                      ⏱️ This code expires in <strong>10 minutes</strong>. Never share this code with anyone.
                    </p>

                    <!-- Spam Box Notice -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 24px; background-color: #fffbeb; border: 1.5px solid #fde047; border-radius: 10px; padding: 12px;">
                      <tr>
                        <td style="font-size: 12px; color: #92400e; line-height: 1.4;">
                          💡 <strong>Notice:</strong> If you did not see this email in your inbox, please check your <strong>Spam or Junk folder</strong> in Gmail.
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="padding: 16px 24px; background-color: #f8fafc; border-top: 2px solid #e2e8f0; text-align: center; font-size: 11px; color: #94a3b8;">
                    Paper Glider · Sketchbook Flight Engine · Ready for Departure
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  // 1. Resend API HTTP transport
  if (isResend) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM_EMAIL || 'Paper Glider <auth@paperglider.app>',
          to: [email],
          subject,
          html,
        }),
      });

      if (res.ok) {
        return { sent: true };
      }
      const data = await res.json().catch(() => ({}));
      console.warn('Resend email failed:', data);
    } catch (err: any) {
      console.warn('Resend transport error:', err?.message);
    }
  }

  // 2. Nodemailer SMTP / Gmail transport
  if (isGmail || isSmtp) {
    try {
      const transporter = isGmail
        ? nodemailer.createTransport({
            service: 'gmail',
            auth: {
              user: process.env.GMAIL_USER,
              pass: process.env.GMAIL_APP_PASSWORD,
            },
          })
        : nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT) || 587,
            secure: Number(process.env.SMTP_PORT) === 465,
            auth: {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASS,
            },
          });

      const fromAddress =
        process.env.MAIL_FROM ||
        (isGmail ? process.env.GMAIL_USER : process.env.SMTP_USER) ||
        'Paper Glider <no-reply@paperglider.app>';

      await transporter.sendMail({
        from: fromAddress,
        to: email,
        subject,
        html,
        text: `Paper Glider Flight Authorization Code: ${code}\nThis code expires in 10 minutes.\nIf you did not receive this email in your inbox, please check your spam folder in Gmail.`,
      });

      return { sent: true };
    } catch (err: any) {
      console.warn('Nodemailer dispatch error:', err?.message);
      return {
        sent: false,
        error: err?.message,
      };
    }
  }

  // 3. Fallback simulation (when no SMTP credentials are configured yet in environment)
  console.log(`[Paper Glider Auth] Verification Code for ${email} (${username}): ${code}`);
  return {
    sent: false,
    simulated: true,
    message: 'Verification code generated.',
  };
}
