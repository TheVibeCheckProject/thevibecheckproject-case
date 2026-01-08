export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);

		// ---- Basic CORS (tighten later) ----
		const corsHeaders = {
			"Access-Control-Allow-Origin": "https://case.thevibecheckproject.com",
			"Access-Control-Allow-Methods": "POST, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type, X-Case-Portal-Token",
		};

		if (request.method === "OPTIONS") {
			return new Response(null, { status: 204, headers: corsHeaders });
		}

		// Only allow our API routes
		if (!url.pathname.startsWith("/api/")) {
			return new Response("Not Found", { status: 404 });
		}

		// Enforce POST only for API
		if (request.method !== "POST") {
			return new Response("Method Not Allowed", {
				status: 405,
				headers: corsHeaders,
			});
		}

		// ---- Shared secret auth ----
		const token = request.headers.get("X-Case-Portal-Token");
		if (!token || token !== env.CASE_PORTAL_TOKEN) {
			return new Response("Unauthorized", { status: 401, headers: corsHeaders });
		}

		// Parse JSON body safely
		let body;
		try {
			body = await request.json();
		} catch {
			return new Response("Bad JSON", { status: 400, headers: corsHeaders });
		}

		// ROUTES
		if (url.pathname === "/api/agent/step") {
			// For now: echo + basic shape validation
			return Response.json(
				{
					ok: true,
					route: "step",
					received_keys: Object.keys(body ?? {}),
					next_action: "none",
					note: "Worker is alive and authenticated. AI not wired yet.",
				},
				{ headers: corsHeaders }
			);
		}

		if (url.pathname === "/api/agent/chat") {
			const message = body?.message;
			return Response.json(
				{
					ok: true,
					route: "chat",
					echo: typeof message === "string" ? message : null,
					reply:
						"Connected. Next step is to enable AI + citation-guarded outputs.",
				},
				{ headers: corsHeaders }
			);
		}

		return new Response("Not Found", { status: 404, headers: corsHeaders });
	},
};
