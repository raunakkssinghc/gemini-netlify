// netlify/functions/gemini.js
export async function handler(event) {
  // (Optional) allow local test via GET
  if (event.httpMethod === "GET") {
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Use POST" }) };
  }

  try {
    const { prompt, system, model } = JSON.parse(event.body || "{}");

    if (!prompt || typeof prompt !== "string") {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing 'prompt' (string)" }) };
    }

    // Security: require a shared secret (set in Netlify env) if you want
    const requiredSecret = process.env.PRIVATE_WEBHOOK_SECRET || "";
    const providedSecret = event.headers["x-api-secret"] || event.headers["X-Api-Secret"];
    if (requiredSecret && providedSecret !== requiredSecret) {
      return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
    }

    const API_KEY = "AIzaSyB5MqP-jnqzUl5IPPGXLoORrMzil_uNnfI";
    if (!API_KEY) {
      return { statusCode: 500, body: JSON.stringify({ error: "Server missing GEMINI_API_KEY" }) };
    }

    // Pick a model. You can override by passing { "model": "..." } in the POST body.
    const MODEL_ID = model || process.env.GEMINI_MODEL_ID || "models/gemini-2.5-pro";

    // Build request for Google Generative Language API
    const url = `https://generativelanguage.googleapis.com/v1beta/${MODEL_ID}:generateContent?key=${API_KEY}`;

    const body = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    };

    // Optional "system" instruction (if provided)
    if (system && typeof system === "string") {
      body.systemInstruction = { role: "system", parts: [{ text: system }] };
    }

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await resp.json();

    // Parse out the first text candidate safely
    const text =
      data?.candidates?.[0]?.content?.parts?.map(p => p?.text).filter(Boolean).join("\n") ||
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      null;

    // If the API returned a safety block or error, surface it
    if (!resp.ok || !text) {
      return {
        statusCode: 200, // keep 200 so Zapier can read the JSON result
        body: JSON.stringify({
          error: data?.error?.message || "No text returned",
          raw: data,
        }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ result: text, model: MODEL_ID }),
    };
  } catch (err) {
    return { statusCode: 200, body: JSON.stringify({ error: String(err) }) };
  }
}
