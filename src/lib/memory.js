const prisma = require("./prisma");

const MAX_MEMORY_FACTS = 30; // cap so memory doesn't grow forever

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
            content: "You are a memory-extraction assistant. Look at the user's message and decide whether it contains a LASTING fact worth remembering long-term about the user — such as their name, job, city, likes/dislikes, family details, an ongoing project, or anything else useful in future conversations. If so, write ONLY that fact as ONE SHORT LINE in third person, in English (e.g. 'The user's name is Ali' or 'The user lives in Lahore'). If there is no such lasting fact (just casual chat, a question, or something generic), write only 'NONE'. Do not write anything else."
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

    if (facts.some(f => f.toLowerCase() === fact.toLowerCase())) return;

    facts.push(fact);
    if (facts.length > MAX_MEMORY_FACTS) facts = facts.slice(facts.length - MAX_MEMORY_FACTS);

    await prisma.user.update({
      where: { id: userId },
      data: { memory: facts.join("\n") }
    });
  } catch (err) {
    console.error("Memory extraction failed:", err.message);
  }
}

module.exports = { extractAndSaveMemory };