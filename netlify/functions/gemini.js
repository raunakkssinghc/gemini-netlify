// netlify/functions/gemini.js
export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Use POST" }) };
  }

  try {
    const bodyIn = JSON.parse(event.body || "{}");
    const { prompt, model, urls } = bodyIn;                 // ← 1) read model from POST

    const API_KEY = "AIzaSyB5MqP-jnqzUl5IPPGXLoORrMzil_uNnfI";
    if (!API_KEY) {
      return { statusCode: 500, body: JSON.stringify({ error: "Server missing GEMINI_API_KEY" }) };
    }

    // 2) choose model: POST > env > default
    const MODEL_ID = model || process.env.GEMINI_MODEL_ID || "models/gemini-2.5-pro";

    if (!prompt) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing 'prompt' (string)" }) };
    }

    // Enable Google Search grounding; optionally also enable URL context
    const tools = [{ google_search: {} }];
    if (Array.isArray(urls) && urls.length > 0) {
      tools.push({ url_context: {} }); // lets Gemini read the URLs you pass
    }

    const req = {
      contents: [{ parts: [{ text: prompt || "" }] }],
      tools, // keep your existing tools/generationConfig if you already had them
    };

    // If you pass URLs, include them as an additional user message so URL Context can kick in
    if (Array.isArray(urls) && urls.length > 0) {
      req.contents.push({ parts: [{ text: "Use these URLs as context:\n" + urls.join("\n") }] });
    }

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${MODEL_ID}:generateContent?key=${API_KEY}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) }
    );

    const data = await resp.json();
    const text =
      data?.candidates?.[0]?.content?.parts?.map(p => p?.text).filter(Boolean).join("\n") || null;

    // Optionally surface sources (from grounding + url context)
    const sources =
      data?.candidates?.[0]?.groundingMetadata?.groundingChunks?.map(c => c?.web?.uri)?.filter(Boolean) || [];
    const urlMeta = data?.candidates?.[0]?.urlContextMetadata?.url_metadata || [];

    if (!resp.ok || !text) {
      return { statusCode: 200, body: JSON.stringify({ error: data?.error?.message || "No text", raw: data, model: MODEL_ID }) };
    }

    // 3) include the model used (handy for debugging)
    return { 
      statusCode: 200, 
      body: JSON.stringify({ 
        result: text, 
        sources,                      // from Google Search grounding
        urlContext: urlMeta,          // from URL context tool
        model: MODEL_ID 
      }) 
    };
  } catch (e) {
    return { statusCode: 200, body: JSON.stringify({ error: String(e) }) };
  }
}
