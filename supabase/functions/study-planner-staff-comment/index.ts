import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type SaveCommentRequest = {
  session_id?: string | null;
  comment?: string | null;
  staff_email?: string | null;
  staff_name?: string | null;
  student_email?: string | null;
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
const ALLOWED_ORIGINS = envAny(["ALLOWED_ORIGINS"], "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

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

  const body = (await req.json().catch(() => null)) as SaveCommentRequest | null;
  const sessionId = String(body?.session_id || "").trim();
  const comment = String(body?.comment || "").trim();
  const staffEmail = String(body?.staff_email || "").trim().toLowerCase() || null;
  const staffName = String(body?.staff_name || "").trim() || null;
  const studentEmail = String(body?.student_email || "").trim().toLowerCase() || null;

  if (!sessionId) {
    return json(400, { ok: false, error: "Missing session_id" }, corsHeaders);
  }

  const { data: sessionRow, error: lookupError } = await supabase
    .from("study_planner_plan_sessions")
    .select("id, plan_id")
    .eq("id", sessionId)
    .maybeSingle();

  if (lookupError) return json(500, { ok: false, error: lookupError.message }, corsHeaders);
  if (!sessionRow?.id) return json(404, { ok: false, error: "Session not found" }, corsHeaders);

  if (studentEmail) {
    const { data: planRow, error: planError } = await supabase
      .from("study_planner_plans")
      .select("id, student_email")
      .eq("id", sessionRow.plan_id)
      .maybeSingle();
    if (planError) return json(500, { ok: false, error: planError.message }, corsHeaders);
    if (!planRow?.id || String(planRow.student_email || "").trim().toLowerCase() !== studentEmail) {
      return json(403, { ok: false, error: "Session does not belong to supplied student" }, corsHeaders);
    }
  }

  const payload = {
    staff_comment: comment || null,
    staff_comment_by_email: comment ? staffEmail : null,
    staff_comment_by_name: comment ? staffName : null,
    staff_comment_updated_at: comment ? new Date().toISOString() : null,
  };

  const { error: updateError } = await supabase
    .from("study_planner_plan_sessions")
    .update(payload)
    .eq("id", sessionId);

  if (updateError) return json(500, { ok: false, error: updateError.message }, corsHeaders);
  return json(200, { ok: true, session_id: sessionId, ...payload }, corsHeaders);
});
