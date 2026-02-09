import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type SaveSession = {
  id?: string | null;
  day_of_week: number;
  start_time: string;
  duration_minutes: number;
  sprint_type_id?: string | null;
  subject?: string | null;
  topic?: string | null;
  notes?: string | null;
};

type SavePlanRequest = {
  planId?: string | null;
  weekStartDate: string;
  status?: string | null;
  sessions?: SaveSession[];
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
  console.error("[study-planner-save] Missing SB_URL/SUPABASE_URL or SB_SERVICE_ROLE_KEY/SUPABASE_SERVICE_ROLE_KEY");
}
if (!KNACK_APP_ID || !KNACK_API_KEY) {
  console.error("[study-planner-save] Missing KNACK_APP_ID or KNACK_API_KEY");
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
  // IMPORTANT: `authorization` is reserved for Supabase gateway auth (Bearer <anonKey>).
  // We pass the Knack user token via `x-knack-user-token`.
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

function json(status: number, body: Record<string, unknown>, headers: Record<string, string>) {
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

  const userToken = getKnackUserToken(req);
  const knackUser = await getKnackSessionUser(userToken);
  const email = String(knackUser?.email || "").trim().toLowerCase();

  if (!email) {
    return json(401, { ok: false, error: "Missing or invalid Knack user token" }, corsHeaders);
  }

  const body = (await req.json().catch(() => null)) as SavePlanRequest | null;
  if (!body?.weekStartDate) {
    return json(400, { ok: false, error: "Missing weekStartDate" }, corsHeaders);
  }

  const status = body.status ?? "draft";
  const planId = body.planId || null;

  let planRecord = null as { id: string } | null;

  if (planId) {
    const { data: existing, error } = await supabase
      .from("study_planner_plans")
      .select("id, student_email")
      .eq("id", planId)
      .maybeSingle();
    if (error) {
      return json(500, { ok: false, error: error.message }, corsHeaders);
    }
    if (existing && existing.student_email !== email) {
      return json(403, { ok: false, error: "Plan does not belong to this user" }, corsHeaders);
    }
    if (existing) planRecord = { id: existing.id };
  }

  if (!planRecord) {
    const { data: created, error } = await supabase
      .from("study_planner_plans")
      .insert({
        student_email: email,
        student_name: knackUser?.name || null,
        week_start_date: body.weekStartDate,
        status,
      })
      .select("id")
      .single();
    if (error) {
      return json(500, { ok: false, error: error.message }, corsHeaders);
    }
    planRecord = { id: created.id };
  } else {
    const { error } = await supabase
      .from("study_planner_plans")
      .update({
        status,
        week_start_date: body.weekStartDate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", planRecord.id);
    if (error) {
      return json(500, { ok: false, error: error.message }, corsHeaders);
    }
  }

  const sessions = Array.isArray(body.sessions) ? body.sessions : [];
  await supabase.from("study_planner_plan_sessions").delete().eq("plan_id", planRecord.id);

  if (sessions.length) {
    const inserts = sessions.map((session) => ({
      plan_id: planRecord?.id,
      day_of_week: session.day_of_week,
      start_time: session.start_time,
      duration_minutes: session.duration_minutes,
      sprint_type_id: session.sprint_type_id || null,
      subject: session.subject || null,
      topic: session.topic || null,
      notes: session.notes || null,
    }));
    const { error } = await supabase.from("study_planner_plan_sessions").insert(inserts);
    if (error) {
      return json(500, { ok: false, error: error.message }, corsHeaders);
    }
  }

  return json(
    200,
    { ok: true, planId: planRecord.id, message: status === "confirmed" ? "Plan confirmed." : "Draft saved." },
    corsHeaders,
  );
});
