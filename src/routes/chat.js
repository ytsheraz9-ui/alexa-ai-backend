const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { chatLimiter } = require("../middleware/rateLimit");
const { TOOLS_SCHEMA, executeTool } = require("../lib/tools");
const { extractAndSaveMemory } = require("../lib/memory");
const { checkContentSafety } = require("../lib/contentSafety");

const router = express.Router();

// Maps short model keys (used by the frontend) to actual Groq model IDs
const GROQ_MODELS = {
  "llama-3.3-70b": "llama-3.3-70b-versatile",
  "llama-3.1-8b": "llama-3.1-8b-instant",
  "llama-4-scout": "qwen/qwen3.6-27b", // vision-capable model (llama-4-scout was deprecated by Groq)
  "qwen3-32b": "qwen/qwen3-32b",
  "kimi-k2": "moonshotai/kimi-k2"
};

// Calls Groq, and if the AI decides it needs live data (weather/web search),
// runs those tools and feeds the results back in before returning the final reply.
async function callGroqWithTools(modelName, messages, forcedTool, skipTools) {
  const callGroq = (msgs, useTools, toolChoiceOverride) => fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: modelName,
      max_tokens: 1024,
      temperature: 0.7,
      messages: msgs,
      ...(useTools ? {
        tools: TOOLS_SCHEMA,
        tool_choice: toolChoiceOverride || "auto"
      } : {})
    })
  }).then(r => r.json());

  if (skipTools) {
    // Vision requests: no tool-calling at all, just a direct answer.
    const data = await callGroq(messages, false);
    return { data, reply: data.choices?.[0]?.message?.content };
  }

  // If we detected a strong keyword match (e.g. "weather"), force that specific tool
  // instead of leaving it to the model's judgement — more reliable for smaller/faster models.
  const toolChoiceOverride = forcedTool
    ? { type: "function", function: { name: forcedTool } }
    : undefined;

  // First call — AI decides (or is told) if it needs to use a tool
  let data = await callGroq(messages, true, toolChoiceOverride);
  const choice = data.choices?.[0];

  if (!choice) {
    console.log("⚠️ No choice in Groq response:", JSON.stringify(data));
    return { data, reply: null };
  }

  const toolCalls = choice.message?.tool_calls;
  console.log(toolCalls ? `🔧 AI wants to call: ${toolCalls.map(t => t.function.name).join(", ")}` : "ℹ️ AI answered directly (no tool call)");

  if (!toolCalls || toolCalls.length === 0) {
    // No tool needed — this is the final answer
    return { data, reply: choice.message?.content };
  }

  // AI wants to use one or more tools — run them
  const toolResultMessages = [];
  for (const call of toolCalls) {
    let args = {};
    try { args = JSON.parse(call.function.arguments); } catch (e) {}
    const result = await executeTool(call.function.name, args);
    toolResultMessages.push({
      role: "tool",
      tool_call_id: call.id,
      content: result
    });
  }

  // Second call — give the AI the tool results so it can write the final answer
  const followUpMessages = [
    ...messages,
    choice.message, // the assistant's tool_calls message
    ...toolResultMessages
  ];
  const finalData = await callGroq(followUpMessages, false);
  return { data: finalData, reply: finalData.choices?.[0]?.message?.content };
}

// ---------------------------------------------
// POST /api/chat
// Sends a message to Groq AI and saves both the user message
// and the AI reply to the database, tied to a chat session.
// Protected: requires login + rate-limited to prevent abuse.
// ---------------------------------------------
router.post("/", requireAuth, chatLimiter, async (req, res) => {
  try {
    const { message, sessionId, model, image } = req.body;

    if ((!message || !message.trim()) && !image) {
      return res.status(400).json({ error: "Message cannot be empty." });
    }

    // ---- Content safety check (runs before any AI call) ----
    const safetyCheck = checkContentSafety(message);
    if (!safetyCheck.safe) {
      console.log(`🛑 Content safety filter blocked a message from user ${req.user.userId}`);
      return res.status(200).json({ status: "ok", sessionId: sessionId || null, reply: safetyCheck.reason });
    }

    // ---- Free-tier daily limit check ----
    const FREE_DAILY_LIMIT = 20;
    const user = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { plan: true } });

    if (user.plan !== "pro") {
      const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
      const messagesToday = await prisma.message.count({
        where: { role: "user", session: { userId: req.user.userId }, createdAt: { gte: startOfDay } }
      });
      if (messagesToday >= FREE_DAILY_LIMIT) {
        return res.status(403).json({
          error: `You've reached your free plan's daily limit (${FREE_DAILY_LIMIT} messages). Upgrade to Pro for unlimited access.`,
          upgradeRequired: true
        });
      }
    }

    // Images require a vision-capable model — override whatever the user had selected.
    const modelName = image ? GROQ_MODELS["llama-4-scout"] : (GROQ_MODELS[model] || GROQ_MODELS["llama-3.3-70b"]);

    // Find existing session, or create a new one for this user
    let session;
    if (sessionId) {
      session = await prisma.chatSession.findFirst({
        where: { id: sessionId, userId: req.user.userId }
      });
    }
    if (!session) {
      session = await prisma.chatSession.create({
        data: {
          userId: req.user.userId,
          title: (message || "Image").slice(0, 40) // first 40 chars as a default title
        }
      });
    }

    // What gets stored in the database as this turn's text (images aren't persisted as
    // bytes in the messages table — just a short marker so history still reads naturally).
    const storedUserContent = image
      ? `🖼️ [Image uploaded]${message ? " " + message : ""}`
      : message;

    // Save the user's message
    await prisma.message.create({
      data: { sessionId: session.id, role: "user", content: storedUserContent }
    });

    // Pull recent conversation history for context (last 20 messages)
    const history = await prisma.message.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: "asc" },
      take: 20
    });

    // Fetch this user's name and long-term memory (facts learned across all past conversations)
    const userRecord = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { name: true, memory: true }
    });

    const memorySection = userRecord?.memory
      ? `\n\nYou already know these things about this user, learned from past conversations:\n${userRecord.memory}\n\nUse them naturally where relevant, like an old friend would — don't explicitly say this came from "memory".`
      : "";

    const systemMessage = {
      role: "system",
      content: `You are Alexa, a professional and friendly AI assistant, talking with ${userRecord?.name || "the user"}.

LANGUAGE RULE (very important):
- Always reply in clear, professional English, regardless of what language the user writes in.

BEHAVIOR RULES:
- Answer casual greetings, jokes, and normal conversation directly — don't use a tool for these.
- ONLY use tools (get_weather, web_search) when the user clearly asks for live/current data (e.g. "what's the weather today", "what's the latest news").
- Keep the tone professional, warm, and helpful at all times — suitable to present to any business or industry client.${memorySection}`
    };

    // Build the message list Groq will see. For every turn except the current one,
    // just use the stored text. For the CURRENT turn, if an image was attached,
    // send Groq the real image data (never saved to the database) as multimodal content.
    const pastMessages = history.slice(0, -1).map(m => ({ role: m.role, content: m.content }));
    const currentUserMessage = image
      ? {
          role: "user",
          content: [
            { type: "text", text: message || "Describe this image in detail." },
            { type: "image_url", image_url: { url: image } }
          ]
        }
      : { role: "user", content: message };

    const groqMessages = [systemMessage, ...pastMessages, currentUserMessage];

    // Simple keyword check — if the message clearly asks about weather,
    // force the weather tool instead of hoping the model picks it up on its own
    const weatherKeywords = /\b(weather|mausam|temperature|garmi|sardi|barish|dhoop)\b/i;
    const forcedTool = !image && message && weatherKeywords.test(message) ? "get_weather" : undefined;

    // Vision calls skip tool-calling entirely — mixing image content with tool_choice
    // is unreliable on most models, and a description request never needs a tool anyway.
    const { data: groqData, reply: toolAwareReply } = image
      ? await callGroqWithTools(modelName, groqMessages, undefined, true)
      : await callGroqWithTools(modelName, groqMessages, forcedTool);

    if (!groqData.choices) {
      console.error("Groq API error:", groqData);
      return res.status(502).json({ error: "There was a problem getting a reply from the AI. Please try again." });
    }

    const reply = toolAwareReply || "Sorry, no response was received.";

    // Save the AI's reply
    await prisma.message.create({
      data: { sessionId: session.id, role: "assistant", content: reply }
    });

    // Learn from this message in the background — doesn't delay the response to the user
    if (message) extractAndSaveMemory(req.user.userId, message);

    res.json({ status: "ok", sessionId: session.id, reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error. Please try again later." });
  }
});

// ---------------------------------------------
// GET /api/chat/sessions
// Lists all chat sessions belonging to the logged-in user
// ---------------------------------------------
router.get("/sessions", requireAuth, async (req, res) => {
  const sessions = await prisma.chatSession.findMany({
    where: { userId: req.user.userId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, createdAt: true, updatedAt: true }
  });
  res.json({ status: "ok", sessions });
});

// ---------------------------------------------
// GET /api/chat/sessions/:id
// Fetches full message history for one chat session
// ---------------------------------------------
router.get("/sessions/:id", requireAuth, async (req, res) => {
  const session = await prisma.chatSession.findFirst({
    where: { id: req.params.id, userId: req.user.userId },
    include: { messages: { orderBy: { createdAt: "asc" } } }
  });

  if (!session) {
    return res.status(404).json({ error: "Chat session not found." });
  }

  res.json({ status: "ok", session });
});

// ---------------------------------------------
// DELETE /api/chat/sessions/:id
// Permanently deletes a chat session and all its messages.
// ---------------------------------------------
router.delete("/sessions/:id", requireAuth, async (req, res) => {
  const session = await prisma.chatSession.findFirst({
    where: { id: req.params.id, userId: req.user.userId }
  });
  if (!session) {
    return res.status(404).json({ error: "Chat session not found." });
  }
  await prisma.chatSession.delete({ where: { id: session.id } }); // messages cascade-delete automatically
  res.json({ status: "ok" });
});

module.exports = router;