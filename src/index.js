require("dotenv").config();
const express = require("express");
const cors = require("cors");
const prisma = require("./lib/prisma");
const authRoutes = require("./routes/auth");
const chatRoutes = require("./routes/chat");
const generateRoutes = require("./routes/generate");
const adminRoutes = require("./routes/admin");
const todoRoutes = require("./routes/todos");
const noteRoutes = require("./routes/notes");
const { router: billingRoutes, webhookHandler } = require("./routes/billing");
const { requireAuth } = require("./middleware/auth");
const { generalLimiter, authLimiter } = require("./middleware/rateLimit");

const app = express();
app.set("trust proxy", 1);

// Paddle webhook needs the RAW (unparsed) body to verify its signature,
// so this must be mounted BEFORE express.json() below.
app.post("/api/billing/webhook", express.raw({ type: "application/json" }), webhookHandler);

// CORS — sirf apne actual frontend domains se requests allow karo.
// "your-netlify-site" ki jagah apna asli Netlify URL daalna zaroori hai.
const allowedOrigins = [
  "https://alexa-ai-1.netlify.app",
  "http://localhost:3000",
  "http://127.0.0.1:5500"
];

app.use(cors({
  origin: function (origin, callback) {
    // Postman/curl jaise tools mein origin nahi hota — unhe allow rehne do
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("CORS: Ye domain allowed nahi hai"));
    }
  },
  credentials: true
}));

app.use(express.json({ limit: "5mb" })); // 5mb limit to allow base64 images later

// General rate limit — applies to every request as basic abuse protection
app.use(generalLimiter);

// Health check — confirms server is running
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Alexa AI backend is running" });
});

// DB check — confirms the database connection itself works
app.get("/api/db-check", async (req, res) => {
  try {
    const userCount = await prisma.user.count();
    res.json({ status: "ok", message: "Database connected", userCount });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// Auth routes: /api/auth/signup, /api/auth/login
// authLimiter adds extra brute-force protection specifically for these routes
app.use("/api/auth", authLimiter, authRoutes);

// Protected test route — only accessible with a valid login token.
// Use this to confirm the auth system works end-to-end.
app.get("/api/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { id: true, name: true, email: true, role: true, createdAt: true }
  });
  res.json({ status: "ok", user });
});

// Chat routes: /api/chat (send message), /api/chat/sessions (history)
app.use("/api/chat", chatRoutes);

// Generic AI routes: /api/ai/generate (used by resume, email, and other one-shot tools)
app.use("/api/ai", generateRoutes);

// Admin-only routes: /api/admin/users (real analytics dashboard data)
app.use("/api/admin", adminRoutes);

// Todos & Notes — real database persistence (replaces LocalStorage)
app.use("/api/todos", todoRoutes);
app.use("/api/notes", noteRoutes);

// Billing — plan status + Paddle checkout info (webhook is mounted separately above)
app.use("/api/billing", billingRoutes);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ Alexa AI backend running on http://localhost:${PORT}`);
});