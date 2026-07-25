const rateLimit = require("express-rate-limit");

// General API rate limiter — protects all routes from abuse/spam
// Allows 100 requests per 15 minutes per IP address
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests have been sent. Please try again after some time." }

});

// Stricter limiter for auth routes (signup/login) — prevents brute-force
// password guessing attacks. Allows 10 attempts per 15 minutes per IP.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login/signup attempts. Please try again after 15 minutes." }
});

// Chat/AI limiter — this is the most important one. It protects the Groq
// API key from being spammed by a single user, which would run up costs.
// Allows 20 AI requests per 5 minutes per logged-in user (or per IP if not logged in).
const chatLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.userId || req.ip, // per-user if logged in, else per-IP
  message: { error: "You have sent too many messages to the AI. Please try again in 5 minutes." }

});

module.exports = { generalLimiter, authLimiter, chatLimiter };