const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendResetEmail(toEmail, resetLink) {
  await resend.emails.send({
    from: "Alexa AI <onboarding@resend.dev>",
    to: toEmail,
    subject: "Password Reset Request",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto;">
        <h2>Password Reset</h2>
        <p>You requested to reset your password. Click the button below to continue:</p>
        <a href="${resetLink}" style="display:inline-block; background:#4f46e5; color:#fff; padding:12px 24px; border-radius:8px; text-decoration:none; margin:16px 0;">Reset Password</a>
        <p style="color:#666; font-size:13px;">This link will expire in 15 minutes. If you didn't request this, you can safely ignore this email.</p>
      </div>
    `
  });
}

module.exports = { sendResetEmail };