// ============================================================
// USER MEMORY — Extracts durable facts from conversations and
// remembers them across sessions, similar to Claude's memory feature.
// ============================================================
const prisma = require("./prisma");

const MAX_MEMORY_FACTS = 30; // cap so memory doesn't grow forever

// Uses a small, fast model to check if the user's message contains
// a fact worth remembering long-term (name, job, preferences, etc).
async function extractAndSaveMemory(userId, userMessage) {
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant", // fast + cheap, this runs on every message
        max_tokens: 80,
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content: "Tum ek memory-extraction assistant ho. User ke message ko dekho aur decide karo kya usme koi LASTING fact hai jo user ke baare mein hamesha yaad rakhna chahiye — jaise unka naam, job, shehar, pasand-napasand, family details, ongoing project, ya koi aisi cheez jo future conversations mein kaam aaye. Agar haan, to sirf wo fact EK CHOTI LINE mein third-person mein likho (jaise 'User ka naam Ali hai' ya 'User Lahore mein rehta hai'). Agar koi aisi lasting fact nahi hai (sirf casual chat, sawal-jawab, ya generic baat hai), to sirf 'NONE' likho. Kuch aur mat likho."
          },
          { role: "user", content: userMessage }
        ]
      })
    });

    const data = await res.json();
    const fact = data.choices?.[0]?.message?.content?.trim();

    if (!fact || fact.toUpperCase().includes("NONE") || fact.length > 200) return;

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { memory: true } });
    let facts = (user?.memory || "").split("\n").filter(Boolean);

    // Avoid saving near-duplicate facts
    if (facts.some(f => f.toLowerCase() === fact.toLowerCase())) return;

    facts.push(fact);
    if (facts.length > MAX_MEMORY_FACTS) facts = facts.slice(facts.length - MAX_MEMORY_FACTS);

    await prisma.user.update({
      where: { id: userId },
      data: { memory: facts.join("\n") }
    });
  } catch (err) {
    // Memory extraction is a "nice to have" — never break the chat if it fails
    console.error("Memory extraction failed:", err.message);
  }
}

module.exports = { extractAndSaveMemory };