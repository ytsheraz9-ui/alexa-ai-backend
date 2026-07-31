const express = require("express");
const jwt = require("jsonwebtoken");
const { authenticator } = require("otplib");
const QRCode = require("qrcode");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.post("/setup", requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    const secret = authenticator.generateSecret();

    // Store the pending secret, but keep twoFactorEnabled false until confirmed
    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorSecret: secret }
    });

    const otpauthUrl = authenticator.keyuri(user.email, "Alexa AI", secret);
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    res.json({ status: "ok", qrCode: qrCodeDataUrl, secret });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not start 2FA setup. Please try again." });
  }
});

router.post("/enable", requireAuth, async (req, res) => {
  try {
    const { code } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });

    if (!user.twoFactorSecret) {
      return res.status(400).json({ error: "Start 2FA setup first before confirming a code." });
    }

    const isValid = authenticator.check(code || "", user.twoFactorSecret);
    if (!isValid) {
      return res.status(400).json({ error: "Incorrect code. Please try again." });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: true }
    });

    res.json({ status: "ok", message: "Two-factor authentication is now enabled." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not enable 2FA. Please try again." });
  }
});

router.post("/disable", requireAuth, async (req, res) => {
  try {
    await prisma.user.update({
      where: { id: req.user.userId },
      data: { twoFactorEnabled: false, twoFactorSecret: null }
    });
    res.json({ status: "ok", message: "Two-factor authentication has been disabled." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not disable 2FA. Please try again." });
  }
});

router.post("/verify-login", async (req, res) => {
  try {
    const { tempToken, code } = req.body;
    if (!tempToken || !code) {
      return res.status(400).json({ error: "Verification code is required." });
    }

    let payload;
    try {
      payload = jwt.verify(tempToken, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ error: "This login attempt has expired. Please log in again." });
    }
    if (payload.purpose !== "2fa-pending") {
      return res.status(401).json({ error: "Invalid verification request." });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      return res.status(401).json({ error: "Invalid verification request." });
    }

    const isValid = authenticator.check(code, user.twoFactorSecret);
    if (!isValid) {
      return res.status(400).json({ error: "Incorrect code. Please try again." });
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Login successful.",
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error. Please try again later." });
  }
});

router.get("/status", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { twoFactorEnabled: true } });
  res.json({ status: "ok", enabled: !!user.twoFactorEnabled });
});

module.exports = router;