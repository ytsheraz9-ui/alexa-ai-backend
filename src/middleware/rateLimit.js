const rateLimit = require("express-rate-limit");

// General API rate limiter — protects all routes from abuse/spam
// Allows 100 requests per 15 minutes per IP address
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Bohat zyada requests bhej di hain. Thori der baad try karein." }
});

// Stricter limiter for auth routes (signup/login) — prevents brute-force
// password guessing attacks. Allows 10 attempts per 15 minutes per IP.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Bohat zyada login/signup attempts. 15 minute baad try karein." }
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
  message: { error: "AI se bohat zyada messages bhej diye hain. 5 minute baad try karein." }
});

module.exports = { generalLimiter, authLimiter, chatLimiter };