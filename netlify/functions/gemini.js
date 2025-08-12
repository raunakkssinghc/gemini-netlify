// netlify/functions/gemini.js
export async function handler(event) {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: JSON.stringify({ error: "Use POST" }) };
    }
  
    try {
      const bodyIn = JSON.parse(event.body || "{}");
      const { prompt, model, urls, generationConfig } = bodyIn;  // ← accept generationConfig
  
      const API_KEY = "AIzaSyB5MqP-jnqzUl5IPPGXLoORrMzil_uNnfI";
      const MODEL_ID = model || process.env.GEMINI_MODEL_ID || "models/gemini-2.5-pro";
  
      if (!prompt) {
        return { statusCode: 400, body: JSON.stringify({ error: "Missing 'prompt' (string)" }) };
      }
  
             const tools = [{ google_search: {} }];
       if (Array.isArray(urls) && urls.length > 0) tools.push({ url_context: {} });

       // inside your handler, after you build `tools`:
       const cfg = generationConfig || { temperature: 0, maxOutputTokens: 1024 };

       // If tools are present, JSON mode isn't supported → remove it safely
       if (tools && tools.length > 0) {
         delete cfg.responseMimeType;
         delete cfg.response_mime_type;
       }

       const req = {
         contents: [{ parts: [{ text: prompt || "" }] }],
         tools,
         generationConfig: cfg
       };
  
      if (Array.isArray(urls) && urls.length > 0) {
        req.contents.push({
          parts: [{ text: "Use these URLs as context:\n" + urls.join("\n") }]
        });
      }
  
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${MODEL_ID}:generateContent?key=${API_KEY}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) }
      );
  
      const data = await resp.json();
      const text =
        data?.candidates?.[0]?.content?.parts?.map(p => p?.text).filter(Boolean).join("\n") || null;
  
      // Keep 200 on error so Zapier can inspect and decide to retry
      if (!resp.ok || !text) {
        return {
          statusCode: 200,
          body: JSON.stringify({ error: data?.error?.message || "No text", raw: data, model: MODEL_ID })
        };
      }
  
      const sources =
        data?.candidates?.[0]?.groundingMetadata?.groundingChunks?.map(c => c?.web?.uri)?.filter(Boolean) || [];
      const urlMeta = data?.candidates?.[0]?.urlContextMetadata?.url_metadata || [];
  
      return {
        statusCode: 200,
        body: JSON.stringify({ result: text, sources, urlContext: urlMeta, model: MODEL_ID })
      };
    } catch (e) {
      // Keep 200 (we’ll catch this in Zapier and retry)
      return { statusCode: 200, body: JSON.stringify({ error: String(e) }) };
    }
  }
  