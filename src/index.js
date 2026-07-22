require("dotenv").config();
const express = require("express");
const cors = require("cors");
const prisma = require("./lib/prisma");
const authRoutes = require("./routes/auth");
const chatRoutes = require("./routes/chat");
const generateRoutes = require("./routes/generate");
const { requireAuth } = require("./middleware/auth");
const { generalLimiter, authLimiter } = require("./middleware/rateLimit");

const app = express();

// CORS — allows the frontend (local file, or your deployed Netlify site) to call this API.
// For production, you can restrict this to your exact Netlify domain instead of "*".
app.use(cors());

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

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ Alexa AI backend running on http://localhost:${PORT}`);
});