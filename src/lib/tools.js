// ============================================================
// AI TOOLS — Real-time data the AI can fetch when it needs to.
// This is what makes weather/news/current-events questions accurate,
// instead of the AI just guessing from its training data.
// ============================================================

// ---- Tool definitions (told to Groq so it knows what it can call) ----
const TOOLS_SCHEMA = [
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Provides the current weather conditions and temperature for any city or location. Whenever a user asks about the weather, climate, temperature, rain, sunshine, or related conditions, this function must always be used.",

      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "name of city, example 'Rahim Yar Khan', 'Lahore', 'Karachi'" }
        },
        required: ["city"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Searches the internet for the latest information — such as breaking news, sports scores, stock prices, or any other topic that may not be in the AI's training data. Use this function when a user asks about current events or information they are unsure about.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query — the topic you want to search for" }
        },
        required: ["query"]
      }
    }
  }
];

// ---- get_weather implementation (Open-Meteo — free, no API key needed) ----
async function getWeather(city) {
  try {
    // Step 1: convert city name to coordinates
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en`
    );
    const geoData = await geoRes.json();
    if (!geoData.results || geoData.results.length === 0) {
      return `Location for "${city}" not found.`;
    }
    const { latitude, longitude, name, country } = geoData.results[0];

    // Step 2: fetch current weather for those coordinates
    const weatherRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`
    );
    const weatherData = await weatherRes.json();
    const cur = weatherData.current;

    const weatherDescriptions = {
      0: "Saaf aasman", 1: "Zyadatar saaf", 2: "Thora abr aalood", 3: "Abr aalood",
      45: "Dhund", 48: "Ghani dhund", 51: "Halki phuhar", 53: "Phuhar", 55: "Tez phuhar",
      61: "Halki baarish", 63: "Baarish", 65: "Tez baarish", 71: "Halki barfbari",
      73: "Barfbari", 75: "Tez barfbari", 80: "Halki bauchaar", 81: "Bauchaar",
      82: "Tez bauchaar", 95: "Tofani", 96: "Olay ke sath tofan", 99: "Tez olay ke sath tofan"
    };

    return JSON.stringify({
      location: `${name}, ${country}`,
      temperature_celsius: cur.temperature_2m,
      condition: weatherDescriptions[cur.weather_code] || "unknown",
      humidity_percent: cur.relative_humidity_2m,
      wind_speed_kmh: cur.wind_speed_10m
    });
  } catch (err) {
    return `Error fetching weather data: ${err.message}`;
  }
}

// ---- web_search implementation (Tavily — free tier, AI-optimized results) ----
async function webSearch(query) {
  if (!process.env.TAVILY_API_KEY) {
    return "Web search is not configured (TAVILY_API_KEY missing).";
  }
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query,
        search_depth: "basic",
        max_results: 4,
        include_answer: true
      })
    });
    const data = await res.json();

    if (data.answer) {
      return JSON.stringify({
        summary: data.answer,
        sources: (data.results || []).slice(0, 3).map(r => ({ title: r.title, url: r.url }))
      });
    }
    return JSON.stringify({
      sources: (data.results || []).slice(0, 4).map(r => ({ title: r.title, content: r.content, url: r.url }))
    });
  } catch (err) {
    return `Error fetching web search results: ${err.message}`;
  }
}

// ---- Dispatcher — runs whichever tool the AI decided to call ----
async function executeTool(name, args) {
  if (name === "get_weather") return getWeather(args.city);
  if (name === "web_search") return webSearch(args.query);
  return "Unknown tool.";
}

module.exports = { TOOLS_SCHEMA, executeTool };