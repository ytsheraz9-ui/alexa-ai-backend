const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { chatLimiter } = require("../middleware/rateLimit");

const router = express.Router();

const GROQ_MODELS = {
  "llama-3.3-70b": "llama-3.3-70b-versatile",
  "llama-3.1-8b": "llama-3.1-8b-instant",
  "llama-4-scout": "qwen/qwen3.6-27b",
  "qwen3-32b": "qwen/qwen3-32b",
  "kimi-k2": "moonshotai/kimi-k2"
};

router.post("/generate", requireAuth, chatLimiter, async (req, res) => {
  try {
    const { messages, model, maxTokens } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Messages array is required." });
    }

    const modelName = GROQ_MODELS[model] || GROQ_MODELS["llama-3.3-70b"];

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: modelName,
        max_tokens: maxTokens || 1024,
        temperature: 0.7,
        messages
      })
    });

    const groqData = await groqRes.json();

    if (!groqRes.ok) {
      console.error("Groq API error:", groqData);
      return res.status(502).json({ error: "There was a problem getting a reply from the AI. Please try again." });
    }

    const reply = groqData.choices?.[0]?.message?.content || "No response was received.";
    res.json({ status: "ok", reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error. Please try again later." });
  }
});

module.exports = router;