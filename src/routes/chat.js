const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { chatLimiter } = require("../middleware/rateLimit");
const { TOOLS_SCHEMA, executeTool } = require("../lib/tools");

const router = express.Router();

// Maps short model keys (used by the frontend) to actual Groq model IDs
const GROQ_MODELS = {
  "llama-3.3-70b": "llama-3.3-70b-versatile",
  "llama-3.1-8b": "llama-3.1-8b-instant",
  "llama-4-scout": "meta-llama/llama-4-scout-17b-16e-instruct",
  "qwen3-32b": "qwen/qwen3-32b",
  "kimi-k2": "moonshotai/kimi-k2"
};

// Calls Groq, and if the AI decides it needs live data (weather/web search),
// runs those tools and feeds the results back in before returning the final reply.
async function callGroqWithTools(modelName, messages, forcedTool) {
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
    const { message, sessionId, model } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: "Message khali nahi ho sakta." });
    }

    const modelName = GROQ_MODELS[model] || GROQ_MODELS["llama-3.3-70b"];

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
          title: message.slice(0, 40) // first 40 chars as a default title
        }
      });
    }

    // Save the user's message
    await prisma.message.create({
      data: { sessionId: session.id, role: "user", content: message }
    });

    // Pull recent conversation history for context (last 20 messages)
    const history = await prisma.message.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: "asc" },
      take: 20
    });

    const groqMessages = [
      {
        role: "system",
        content: "Tum Alexa ho, ek friendly AI assistant jo Roman Urdu mein baat karti hai jab tak user English na maange. Casual greetings, jokes, ya normal baaton ka jawab seedha do — koi tool use mat karo. SIRF tab tools (get_weather, web_search) use karo jab user clearly kisi cheez ka live/current data maangay (jaise 'aaj weather kaisa hai', 'latest news kya hai') — casual chat, greetings, ya general knowledge ke sawalon ke liye tools bilkul na use karo."
      },
      ...history.map(m => ({ role: m.role, content: m.content }))
    ];

    // Simple keyword check — if the message clearly asks about weather,
    // force the weather tool instead of hoping the model picks it up on its own
    const weatherKeywords = /\b(weather|mausam|temperature|garmi|sardi|barish|dhoop)\b/i;
    const forcedTool = weatherKeywords.test(message) ? "get_weather" : undefined;

    // Call Groq using the server-side API key — never exposed to the client
    const { data: groqData, reply: toolAwareReply } = await callGroqWithTools(modelName, groqMessages, forcedTool);

    if (!groqData.choices) {
      console.error("Groq API error:", groqData);
      return res.status(502).json({ error: "AI se jawab lene mein masla hua. Dobara try karein." });
    }

    const reply = toolAwareReply || "Maazrat, koi jawab nahi mila.";

    // Save the AI's reply
    await prisma.message.create({
      data: { sessionId: session.id, role: "assistant", content: reply }
    });

    res.json({ status: "ok", sessionId: session.id, reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error. Baad mein try karein." });
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
    return res.status(404).json({ error: "Chat session nahi mili." });
  }

  res.json({ status: "ok", session });
});

module.exports = router;