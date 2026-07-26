const express = require("express");
const crypto = require("crypto");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// ---------------------------------------------
// GET /api/billing/status
// Returns the logged-in user's current plan — used by the frontend
// to show "Free" vs "Pro", and to unlock/lock features accordingly.
// ---------------------------------------------
router.get("/status", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { plan: true, subscriptionStatus: true, subscriptionEndsAt: true }
  });
  res.json({ status: "ok", ...user });
});

// ---------------------------------------------
// GET /api/billing/checkout-info
// Gives the frontend what it needs to open the Paddle checkout overlay
// (the price ID + a client token). No secret key is ever sent to the browser.
// ---------------------------------------------
router.get("/checkout-info", requireAuth, async (req, res) => {
  if (!process.env.PADDLE_CLIENT_TOKEN || !process.env.PADDLE_PRICE_ID_PRO) {
    return res.status(503).json({ error: "Payments are not configured yet." });
  }
  res.json({
    status: "ok",
    clientToken: process.env.PADDLE_CLIENT_TOKEN,
    priceId: process.env.PADDLE_PRICE_ID_PRO,
    environment: process.env.PADDLE_ENV || "sandbox" // "sandbox" while testing, "production" when live
  });
});

// ---------------------------------------------
// POST /api/billing/webhook
// Paddle calls this automatically whenever a subscription is created,
// renewed, canceled, or payment fails. This is what actually upgrades
// or downgrades a user's plan — never trust the frontend for this.
//
// IMPORTANT: this handler must receive the RAW request body (not JSON-parsed)
// so the signature can be verified. It's mounted separately in index.js,
// BEFORE the app's normal express.json() middleware runs.
// ---------------------------------------------
async function webhookHandler(req, res) {
  try {
    const signature = req.headers["paddle-signature"];
    const secret = process.env.PADDLE_WEBHOOK_SECRET;

    if (!secret) {
      console.error("PADDLE_WEBHOOK_SECRET not set — rejecting webhook.");
      return res.status(500).send("Webhook not configured");
    }

    // Verify the webhook really came from Paddle (prevents fake "payment success" calls)
    const [tsPart, h1Part] = signature.split(";");
    const timestamp = tsPart.split("=")[1];
    const receivedHash = h1Part.split("=")[1];
    const payload = `${timestamp}:${req.body.toString()}`;
    const expectedHash = crypto.createHmac("sha256", secret).update(payload).digest("hex");

    if (expectedHash !== receivedHash) {
      console.error("Paddle webhook signature mismatch — possible fake request.");
      return res.status(401).send("Invalid signature");
    }

    const event = JSON.parse(req.body.toString());
    const eventType = event.event_type;
    const data = event.data;

    // The email is how we match a Paddle customer back to our own user account
    const customerEmail = data?.customer?.email || data?.customer_email;

    if (eventType === "subscription.created" || eventType === "subscription.updated") {
      const isActive = data.status === "active" || data.status === "trialing";
      await prisma.user.updateMany({
        where: { email: customerEmail },
        data: {
          plan: isActive ? "pro" : "free",
          subscriptionId: data.id,
          subscriptionStatus: data.status,
          subscriptionEndsAt: data.current_billing_period?.ends_at
            ? new Date(data.current_billing_period.ends_at)
            : null
        }
      });
    }

    if (eventType === "subscription.canceled") {
      await prisma.user.updateMany({
        where: { email: customerEmail },
        data: { plan: "free", subscriptionStatus: "canceled" }
      });
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("Webhook processing error:", err);
    res.status(500).send("Webhook error");
  }
}

module.exports = { router, webhookHandler };