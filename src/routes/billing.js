const express = require("express");
const crypto = require("crypto");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/status", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { plan: true, subscriptionStatus: true, subscriptionEndsAt: true }
  });
  res.json({ status: "ok", ...user });
});

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

async function webhookHandler(req, res) {
  try {
    const signature = req.headers["paddle-signature"];
    const secret = process.env.PADDLE_WEBHOOK_SECRET;

    if (!secret) {
      console.error("PADDLE_WEBHOOK_SECRET not set — rejecting webhook.");
      return res.status(500).send("Webhook not configured");
    }

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