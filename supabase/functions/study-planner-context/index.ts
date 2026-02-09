import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type StudyPlannerContext = {
  ok: boolean;
  user?: {
    name?: string | null;
    email?: string | null;
    school_name?: string | null;
  };
  sprintTypes?: Array<{
    id: string;
    type_key: string;
    display_name: string;
    duration_minutes: number;
    color_hex?: string | null;
    sort_order?: number | null;
  }>;
  plans?: Array<{
    id: string;
    week_start_date: string;
    status: string | null;
    session_count?: number;
  }>;
  activePlan?: {
    id: string;
    week_start_date: string;
    status: string | null;
  } | null;
  sessions?: Array<{
    id: string;
    plan_id: string;
    day_of_week: number;
    start_time: string;
    duration_minutes: number;
    sprint_type_id: string | null;
    subject: string | null;
    topic: string | null;
  }>;
  error?: string;
};

type ContextRequestBody = {
  email?: string | null;
  name?: string | null;
  school_name?: string | null;
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

const ALLOWED_ORIGINS = envAny(["ALLOWED_ORIGINS"], "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[study-planner-context] Missing SB_URL/SUPABASE_URL or SB_SERVICE_ROLE_KEY/SUPABASE_SERVICE_ROLE_KEY");
}
if (!KNACK_APP_ID || !KNACK_API_KEY) {
  console.error("[study-planner-context] Missing KNACK_APP_ID or KNACK_API_KEY");
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
    "Access-Control-Allow-Headers":
      "content-type, authorization, apikey, x-knack-user-token",
  };
}

function getKnackUserToken(req: Request) {
  // Supabase gateway auth may use:
  // - Authorization: Bearer <anonKey>, or
  // - apikey: <anonKey>
  //
  // In VESPA/Knack integrations, the Knack user token is often sent as Authorization: <token>.
  // We accept BOTH to be resilient across environments.
  const auth = req.headers.get("authorization")?.trim() || "";
  if (auth && !/^Bearer\s+/i.test(auth)) return auth;
  return req.headers.get("x-knack-user-token")?.trim() || "";
}

async function getKnackSessionUser(userToken: string) {
  const clean = String(userToken || "").trim().replace(/^Bearer\s+/i, "");
  if (!clean) return null;
  const url = `${KNACK_API_URL.replace(/\/$/, "")}/session`;
  const resp = await fetch(url, {
    method: "GET",
    headers: {
      "X-Knack-Application-Id": KNACK_APP_ID,
      "X-Knack-REST-API-Key": KNACK_API_KEY,
      "Content-Type": "application/json",
      Authorization: clean,
    },
  });
  if (!resp.ok) return null;
  const data = await resp.json().catch(() => null);
  const user = data?.user ?? data?.session?.user ?? null;
  return user;
}

function json(status: number, body: StudyPlannerContext, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = cors(origin);

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" }, corsHeaders);

  const body = (await req.json().catch(() => null)) as ContextRequestBody | null;
  const bodyEmail = String(body?.email || "").trim().toLowerCase();

  // Prefer explicit email from the (Knack-authenticated) client.
  // This avoids brittle token forwarding and matches other Knack-embedded apps.
  let email = bodyEmail;
  let displayName = String(body?.name || "").trim() || null;
  let schoolName = String(body?.school_name || "").trim() || null;

  // Fallback: derive email from Knack token if provided.
  let knackUser: any = null;
  if (!email) {
    const userToken = getKnackUserToken(req);
    knackUser = await getKnackSessionUser(userToken);
    email = String(knackUser?.email || "").trim().toLowerCase();
    displayName = displayName || knackUser?.name || null;
    schoolName = schoolName || knackUser?.school || knackUser?.field_122_raw || null;
  }

  if (!email) {
    return json(401, { ok: false, error: "Missing or invalid Knack user token" }, corsHeaders);
  }

  const [sprintTypesResp, plansResp] = await Promise.all([
    supabase
      .from("study_planner_sprint_types")
      .select("id, type_key, display_name, duration_minutes, color_hex, sort_order")
      .order("sort_order", { ascending: true })
      .order("display_name", { ascending: true }),
    supabase
      .from("study_planner_plans")
      .select("id, week_start_date, status, updated_at")
      .eq("student_email", email)
      .order("week_start_date", { ascending: false })
      .limit(5),
  ]);

  if (sprintTypesResp.error) {
    return json(500, { ok: false, error: sprintTypesResp.error.message }, corsHeaders);
  }
  if (plansResp.error) {
    return json(500, { ok: false, error: plansResp.error.message }, corsHeaders);
  }

  const plans = plansResp.data || [];
  const planIds = plans.map((plan) => plan.id);

  const sessionsResp = planIds.length
    ? await supabase
        .from("study_planner_plan_sessions")
        .select("id, plan_id, day_of_week, start_time, duration_minutes, sprint_type_id, subject, topic")
        .in("plan_id", planIds)
    : { data: [], error: null };

  if (sessionsResp.error) {
    return json(500, { ok: false, error: sessionsResp.error.message }, corsHeaders);
  }

  const sessions = sessionsResp.data || [];
  const sessionCounts = sessions.reduce<Record<string, number>>((acc, item) => {
    acc[item.plan_id] = (acc[item.plan_id] || 0) + 1;
    return acc;
  }, {});

  const enrichedPlans = plans.map((plan) => ({
    id: plan.id,
    week_start_date: plan.week_start_date,
    status: plan.status,
    session_count: sessionCounts[plan.id] || 0,
  }));

  const activePlan = enrichedPlans[0] || null;
  const activeSessions = activePlan
    ? sessions.filter((session) => session.plan_id === activePlan.id)
    : [];

  return json(
    200,
    {
      ok: true,
      user: {
        name: displayName,
        email,
        school_name: schoolName,
      },
      sprintTypes: sprintTypesResp.data || [],
      plans: enrichedPlans,
      activePlan,
      sessions: activeSessions,
    },
    corsHeaders,
  );
});
