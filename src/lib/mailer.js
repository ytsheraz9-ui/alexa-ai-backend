const nodemailer = require("nodemailer");

// Gmail use kar rahe ho to: Gmail Settings -> Security -> 2-Step Verification -> App Passwords
// se ek "App Password" banao (apna normal Gmail password use MAT karo)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD
  }
});

async function sendResetEmail(toEmail, resetLink) {
  await transporter.sendMail({
    from: `"Alexa AI" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: "Password Reset Request",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto;">
        <h2>Password Reset</h2>
        <p>Aapne apna password reset karne ki request ki hai. Neeche diye button pe click karein:</p>
        <a href="${resetLink}" style="display:inline-block; background:#4f46e5; color:#fff; padding:12px 24px; border-radius:8px; text-decoration:none; margin:16px 0;">Reset Password</a>
        <p style="color:#666; font-size:13px;">Ye link 15 minute mein expire ho jayega. Agar aapne ye request nahi ki, is email ko ignore kar dein.</p>
      </div>
    `
  });
}

module.exports = { sendResetEmail };