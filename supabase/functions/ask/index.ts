// ATIC assistant: answers questions about stock, forecast, plan, recipes and production.
// Runs as a Supabase Edge Function. Only signed-in users can call it (Supabase checks the login token).
// Secret needed (Supabase → Edge Functions → Secrets): ANTHROPIC_API_KEY
// Optional secret: ASSISTANT_MODEL (default claude-haiku-5-5, the fast model)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM = `You are the ATIC Oman planning assistant inside the company's website.
ATIC makes grenadine molasses (GM), lemon substitute (LS), white vinegar (WV), rose water (RW) and blossom water (BW) on two lines (Section 1 / Line 1 and Section 2 / Line 2). Friday is the day off.
You get a DATA block with today's numbers from the website: stock, estimated stock now, use per day, run-out dates (without and with deliveries), order-by dates, open deliveries, the factory plan, recipes per batch, recent batches from the Line Planner, and the lot number.
Rules:
- Answer only from the DATA block. If the data does not have it, say so in one line and say where in the website to enter it.
- Be short and direct: the answer first, then at most 3 short lines of why. Use the units given (kg, bags, buckets, cans) and give both when a pack size is known.
- Do not round more than the data does. Dates like "10 Nov".
- When asked "what should I order" or similar, use status, order-by dates and run-out dates.
- Reply in the language of the question (English or Arabic).`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    /* only people signed in to the ATIC website (a real user token, not just the public key) */
    const who = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, { headers: { Authorization: req.headers.get("Authorization") || "", apikey: Deno.env.get("SUPABASE_ANON_KEY") || "" } });
    if (!who.ok) return json({ error: "Please sign in to the ATIC website first." }, 401);
    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) return json({ error: "The assistant is not set up yet: add the ANTHROPIC_API_KEY secret in Supabase." }, 500);
    const { question, context, history } = await req.json();
    if (!question || String(question).length > 2000) return json({ error: "Ask a question (up to 2,000 characters)." }, 400);
    const msgs = (Array.isArray(history) ? history.slice(-6) : [])
      .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m: any) => ({ role: m.role, content: m.content.slice(0, 4000) }));
    msgs.push({ role: "user", content: `DATA (from the website, ${new Date().toISOString().slice(0, 10)}):\n${String(context || "").slice(0, 60000)}\n\nQUESTION: ${question}` });
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: Deno.env.get("ASSISTANT_MODEL") || "claude-haiku-5-5", max_tokens: 700, system: SYSTEM, messages: msgs }),
    });
    const d = await r.json();
    if (!r.ok) return json({ error: (d && d.error && d.error.message) || "The AI service returned an error." }, 502);
    const answer = (d.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n").trim();
    return json({ answer });
  } catch (e) {
    return json({ error: String((e && (e as Error).message) || e) }, 500);
  }
});

function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { ...CORS, "content-type": "application/json" } });
}
