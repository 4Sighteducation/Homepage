import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type GenerateRequest = {
  prompt?: string;
  weekStartDate?: string;
};

type DraftSession = {
  day_of_week: number; // 1=Mon ... 7=Sun
  start_time: string; // "HH:MM"
  sprint_type_key: string; // e.g. short, quick, serious, standard_30, standard_60, planning
  subject?: string | null;
  topic?: string | null;
  notes?: string | null;
};

type GenerateResponse = {
  ok: boolean;
  draft?: { weekStartDate: string; sessions: DraftSession[] };
  error?: string;
};

function envAny(keys: string[], fallback = ""): string {
  for (const k of keys) {
    const v = Deno.env.get(k);
    if (v && v.trim()) return v.trim();
  }
  return fallback;
}

const SUPABASE_URL = envAny(["SB_URL", "SUPABASE_URL"]);
const SUPABASE_SERVICE_ROLE_KEY = envAny(["SB_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"]);

const KNACK_APP_ID = envAny(["KNACK_APP_ID"]);
const KNACK_API_KEY = envAny(["KNACK_API_KEY"]);
const KNACK_API_URL = envAny(["KNACK_API_URL"], "https://api.knack.com/v1");

const OPENAI_API_KEY = envAny(["OPENAI_API_KEY"]);
const OPENAI_MODEL = envAny(["COACH_MODEL", "OPENAI_MODEL"], "gpt-4o-mini");

const ALLOWED_ORIGINS = envAny(["ALLOWED_ORIGINS"], "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[study-planner-ai] Missing SB_URL/SUPABASE_URL or SB_SERVICE_ROLE_KEY/SUPABASE_SERVICE_ROLE_KEY");
}
if (!KNACK_APP_ID || !KNACK_API_KEY) {
  console.error("[study-planner-ai] Missing KNACK_APP_ID or KNACK_API_KEY");
}
if (!OPENAI_API_KEY) {
  console.error("[study-planner-ai] Missing OPENAI_API_KEY");
}

const supabase = createClient(SUPABASE_URL ?? "", SUPABASE_SERVICE_ROLE_KEY ?? "", {
  auth: { persistSession: false },
});

function cors(origin: string | null) {
  const allowOrigin =
    origin && (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) ? origin : "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-knack-user-token",
  };
}

function json(status: number, body: GenerateResponse, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

function getKnackUserToken(req: Request) {
  // IMPORTANT: `authorization` is reserved for Supabase gateway auth (Bearer <anonKey>).
  // We pass the Knack user token via `x-knack-user-token`.
  return req.headers.get("x-knack-user-token")?.trim() || "";
}

async function getKnackSessionUser(userToken: string) {
  if (!userToken) return null;
  const url = `${KNACK_API_URL.replace(/\/$/, "")}/session`;
  const resp = await fetch(url, {
    method: "GET",
    headers: {
      "X-Knack-Application-Id": KNACK_APP_ID,
      "X-Knack-REST-API-Key": KNACK_API_KEY,
      "Content-Type": "application/json",
      Authorization: userToken,
    },
  });
  if (!resp.ok) return null;
  const data = await resp.json().catch(() => null);
  const user = data?.user ?? data?.session?.user ?? null;
  return user;
}

function nextMondayISO(): string {
  const now = new Date();
  const day = now.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? 1 : 8 - day; // next Monday
  const d = new Date(now);
  d.setDate(now.getDate() + diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // try to extract JSON object
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const slice = text.slice(start, end + 1);
      return JSON.parse(slice);
    }
    throw new Error("Invalid JSON");
  }
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = cors(origin);

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" }, corsHeaders);

  const userToken = getKnackUserToken(req);
  const knackUser = await getKnackSessionUser(userToken);
  const email = String(knackUser?.email || "").trim().toLowerCase();
  if (!email) return json(401, { ok: false, error: "Missing or invalid Knack user token" }, corsHeaders);

  if (!OPENAI_API_KEY) return json(500, { ok: false, error: "AI not configured" }, corsHeaders);

  const body = (await req.json().catch(() => null)) as GenerateRequest | null;
  const prompt = String(body?.prompt || "").trim();
  if (!prompt) return json(400, { ok: false, error: "Missing prompt" }, corsHeaders);

  const weekStartDate = String(body?.weekStartDate || "").trim() || nextMondayISO();

  const { data: sprintTypes, error: stErr } = await supabase
    .from("study_planner_sprint_types")
    .select("type_key, display_name, duration_minutes")
    .order("sort_order", { ascending: true });

  if (stErr) return json(500, { ok: false, error: stErr.message }, corsHeaders);

  const keys = (sprintTypes || []).map((t) => t.type_key);
  const keyList = keys.length ? keys.join(", ") : "short, quick, serious, standard_30, standard_60, planning";

  const system = [
    "You are a UK secondary/college study planner.",
    "Return ONLY strict JSON (no markdown).",
    "Create a one-week plan starting on the provided weekStartDate (Monday).",
    "Rules:",
    "- Create 5–12 sessions total.",
    "- Exactly ONE planning session (type_key: planning) of 60 minutes.",
    "- Other sessions should use the available sprint types.",
    "- Times must be between 06:00 and 22:00 in 30-minute increments.",
    "- day_of_week: 1=Mon ... 7=Sun",
    "- start_time: 'HH:MM' (24h).",
    "- Avoid overlapping sessions on the same day (assume durations).",
    "- Fill subject/topic/notes when obvious from the prompt; otherwise keep them short.",
    `Available sprint_type_key values: ${keyList}`,
    "",
    "JSON shape:",
    "{",
    '  \"weekStartDate\": \"YYYY-MM-DD\",',
    '  \"sessions\": [',
    "    {",
    "      \"day_of_week\": 1,",
    '      \"start_time\": \"16:00\",',
    '      \"sprint_type_key\": \"quick\",',
    '      \"subject\": \"Biology\",',
    '      \"topic\": \"Cell structure\",',
    '      \"notes\": \"Past-paper questions\"',
    "    }",
    "  ]",
    "}",
  ].join("\n");

  const userMsg = [
    `weekStartDate: ${weekStartDate}`,
    `student: ${knackUser?.name || email}`,
    `prompt: ${prompt}`,
  ].join("\n");

  const oaiResp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMsg },
      ],
    }),
  });

  if (!oaiResp.ok) {
    const t = await oaiResp.text().catch(() => "");
    return json(500, { ok: false, error: `OpenAI error: ${t || oaiResp.status}` }, corsHeaders);
  }

  const oaiJson = await oaiResp.json().catch(() => null);
  const content = String(oaiJson?.choices?.[0]?.message?.content || "").trim();
  if (!content) return json(500, { ok: false, error: "Empty AI response" }, corsHeaders);

  let parsed: any = null;
  try {
    parsed = safeParseJson(content);
  } catch (e) {
    return json(500, { ok: false, error: e?.message || "AI returned invalid JSON" }, corsHeaders);
  }

  const sessions = Array.isArray(parsed?.sessions) ? parsed.sessions : [];
  const out: DraftSession[] = sessions
    .map((s: any) => ({
      day_of_week: Number(s?.day_of_week || 0),
      start_time: String(s?.start_time || "").slice(0, 5),
      sprint_type_key: String(s?.sprint_type_key || "").trim(),
      subject: s?.subject ?? null,
      topic: s?.topic ?? null,
      notes: s?.notes ?? null,
    }))
    .filter((s) => s.day_of_week >= 1 && s.day_of_week <= 7 && /^\d{2}:\d{2}$/.test(s.start_time) && !!s.sprint_type_key);

  if (!out.length) return json(500, { ok: false, error: "AI produced no usable sessions" }, corsHeaders);

  // Ensure exactly one planning session; if missing, force earliest session to planning.
  const planningCount = out.filter((s) => s.sprint_type_key === "planning").length;
  if (planningCount === 0) {
    out.sort((a, b) => (a.day_of_week - b.day_of_week) || a.start_time.localeCompare(b.start_time));
    out[0].sprint_type_key = "planning";
  } else if (planningCount > 1) {
    let kept = false;
    for (const s of out) {
      if (s.sprint_type_key !== "planning") continue;
      if (!kept) {
        kept = true;
        continue;
      }
      // downgrade extras to a standard type if available
      s.sprint_type_key = keys.includes("standard_60") ? "standard_60" : "quick";
    }
  }

  return json(200, { ok: true, draft: { weekStartDate, sessions: out } }, corsHeaders);
});

