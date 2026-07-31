require("dotenv").config();
const Sentry = require("./instrument");

const express = require("express");
const cors = require("cors");
const prisma = require("./lib/prisma");
const authRoutes = require("./routes/auth");
const twoFactorRoutes = require("./routes/twoFactor");
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

app.post("/api/billing/webhook", express.raw({ type: "application/json" }), webhookHandler);

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

app.use(generalLimiter);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Alexa AI backend is running" });
});

app.get("/api/db-check", async (req, res) => {
  try {
    const userCount = await prisma.user.count();
    res.json({ status: "ok", message: "Database connected", userCount });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/auth/2fa", authLimiter, twoFactorRoutes);

app.get("/api/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { id: true, name: true, email: true, role: true, createdAt: true }
  });
  res.json({ status: "ok", user });
});

app.use("/api/chat", chatRoutes);

app.use("/api/ai", generateRoutes);

app.use("/api/admin", adminRoutes);

app.use("/api/todos", todoRoutes);
app.use("/api/notes", noteRoutes);

app.use("/api/billing", billingRoutes);

Sentry.setupExpressErrorHandler(app);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ Alexa AI backend running on http://localhost:${PORT}`);
});