export interface Env {
  OPENAI_API_KEY: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // CORS Headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Case-Portal-Token",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Path Routing
    if (url.pathname === "/api/agent/step" && request.method === "POST") {
      return handleAgentStep(request, env, corsHeaders);
    } else if (url.pathname === "/api/agent/chat" && request.method === "POST") {
      return handleAgentChat(request, env, corsHeaders);
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  },
};

// --- HANDLERS ---

async function handleAgentStep(request: Request, env: Env, corsHeaders: any) {
  try {
    const caseState = await request.json() as any;

    // 1. Prepare Documents for LLM
    // Limit to reasonable size to avoid context overflow.
    // We send just the text and doc IDs.
    const docsForAnalysis = caseState.documents.map((d: any) => ({
      doc_id: d.doc_id,
      text: d.pages.map((p: any) => `[Page ${p.page}]: ${p.text}`).join('\n').slice(0, 10000) // Truncate per doc for safety
    }));

    if (docsForAnalysis.length === 0) {
      return new Response(JSON.stringify({ message: "No documents to analyze." }), { headers: corsHeaders });
    }

    const systemPrompt = `You are an expert legal case analyst. 
    Your task is to analyze the provided documents and extract:
    1. Entities (People, Orgs, Locations, IDs, Dates)
    2. Proposed Timeline Events (Chronological facts)
    3. Proposed Evidence Items (Documents/Physical items referred to)
    
    RULES:
    1. Output strict JSON only.
    2. EVERY item (entity, event, evidence) MUST include citations: { doc_id, page, quote }. 
    3. Quotes must be short (< 25 words).
    4. If uncertain or uncited, DO NOT include.
    5. Avoid legal conclusions in summaries; stick to observable facts.
    6. Timeline significance should be one line.
    
    SCHEMA:
    {
      "people": [{ "name": "Exact Name", "mentions": [{ "doc_id": "...", "page": 1, "quote": "..." }] }],
      "orgs": [{ "name": "Org Name", "mentions": [...] }],
      "locations": [{ "name": "Location Name", "mentions": [...] }],
      "identifiers": [{ "type": "Case Number|Badge|etc", "value": "...", "mentions": [...] }],
      "dates": [{ "value": "YYYY-MM-DD", "mentions": [...] }],
      "proposed_timeline_events": [
        { 
          "datetime": "YYYY-MM-DD or ISO", 
          "summary": "Factual description of event", 
          "source_tags": ["Report", "Testimony", etc], 
          "significance": "Why this matters (1 line)",
          "citations": [{ "doc_id": "...", "page": 1, "quote": "..." }]
        }
      ],
      "proposed_evidence_items": [
        { 
          "title": "Name of item/doc", 
          "status": "produced|missing|destroyed|unknown", 
          "tags": ["audio", "doc", "physical"],
          "citations": [{ "doc_id": "...", "page": 1, "quote": "..." }]
        }
      ]
    }`;

    // 2. Call OpenAI
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4-1106-preview", // Use JSON mode capable model
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(docsForAnalysis) }
        ]
      })
    });

    const aiData = await response.json() as any;
    const content = aiData.choices[0].message.content;
    const extractedData = JSON.parse(content);

    // 3. Construct Response
    return new Response(JSON.stringify({
      message: "Entity extraction complete.",
      entities: extractedData,
      agent_status: {
        last_run_ts: new Date().toISOString(),
        tasks: ["Extracted entities from " + docsForAnalysis.length + " documents."],
        plan: []
      }
    }), { headers: { "Content-Type": "application/json", ...corsHeaders } });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}

async function handleAgentChat(request: Request, env: Env, corsHeaders: any) {
  try {
    const body = await request.json() as any;
    const { message, case_state } = body;

    const systemPrompt = "You are a helpful legal assistant. Answer questions based on the provided case data.";

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Context: ${JSON.stringify(case_state.case_meta)}\n\nQuery: ${message}` }
        ]
      })
    });

    const aiData = await response.json() as any;
    return new Response(JSON.stringify({
      message: aiData.choices[0].message.content,
      agent_status: { last_run_ts: new Date().toISOString(), tasks: ["Chatted with user"] }
    }), { headers: { "Content-Type": "application/json", ...corsHeaders } });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}
