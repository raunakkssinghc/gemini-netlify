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

       // pull any cited sources (optional)
       const sources =
         data?.candidates?.[0]?.groundingMetadata?.groundingChunks
           ?.map(c => c?.web?.uri)
           ?.filter(Boolean) || [];
       const urlMeta = data?.candidates?.[0]?.urlContextMetadata?.url_metadata || [];

       // --- NEW: extract a JSON array of names from the model text ---
       function extractJsonArray(s) {
         if (!s) return null;
         // grab the first [...] block in the text
         const m = s.match(/\[[\s\S]*\]/);
         if (!m) return null;
         try {
           const arr = JSON.parse(m[0]);
           return Array.isArray(arr) ? arr : null;
         } catch {
           return null;
         }
       }

       const names = extractJsonArray(text);

       // If we couldn't parse a clean array, bubble an error payload
       if (!names) {
         return {
           statusCode: 200, // keep 200 if you'll handle retries in Zapier Paths; use 503 to trigger Zapier auto-replay
           body: JSON.stringify({
             error: "No parseable JSON array",
             rawText: text,
             model: MODEL_ID
           })
         };
       }

       // Success: always return a stable JSON shape
       return {
         statusCode: 200,
         body: JSON.stringify({
           names,
           sources,
           urlContext: urlMeta,
           model: MODEL_ID
         })
       };
    } catch (e) {
      // Keep 200 (we’ll catch this in Zapier and retry)
      return { statusCode: 200, body: JSON.stringify({ error: String(e) }) };
    }
  }
  