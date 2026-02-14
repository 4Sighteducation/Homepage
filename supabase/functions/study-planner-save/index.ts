import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type SaveSession = {
  id?: string | null;
  day_of_week: number;
  start_time: string;
  actual_start_time?: string | null;
  duration_minutes: number;
  sprint_type_id?: string | null;
  subject?: string | null;
  topic?: string | null;
  notes?: string | null;
  exam_board?: string | null;
};

type SavePlanRequest = {
  planId?: string | null;
  weekStartDate: string;
  status?: string | null;
  sessions?: SaveSession[];
  email?: string | null;
  name?: string | null;
  school_name?: string | null;
  qualification_level?: string | null; // GCSE / A_LEVEL
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

function json(status: number, body: Record<string, unknown>, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

function normalizeQualificationLevel(raw: unknown): string | null {
  const v = String(raw || "").trim();
  if (!v) return null;
  const u = v.toUpperCase().replace(/\s+/g, "_");
  if (u.includes("GCSE") || u === "KS4" || u.includes("KEY_STAGE_4")) return "GCSE";
  if (
    u.includes("A_LEVEL") ||
    u.includes("A-LEVEL") ||
    u.includes("ALEVEL") ||
    u.includes("AS_LEVEL") ||
    u.includes("AS-LEVEL") ||
    u.includes("SIXTH_FORM") ||
    u.includes("KS5") ||
    u.includes("KEY_STAGE_5")
  ) return "A_LEVEL";
  const m = u.match(/\b(\d{1,2})\b/);
  const n = m ? Number(m[1]) : NaN;
  if (n === 10 || n === 11) return "GCSE";
  if (n === 12 || n === 13) return "A_LEVEL";
  if (u === "GCSE" || u === "A_LEVEL") return u;
  return null;
}

async function resolveQualificationLevelFromSupabase(email: string): Promise<string | null> {
  const { data: student, error } = await supabase
    .from("students")
    .select("year_group, course, created_at")
    .eq("email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !student) return null;
  return normalizeQualificationLevel(student.year_group) || normalizeQualificationLevel(student.course) || null;
}

function buildSubjectPrefsFromSessions(sessions: SaveSession[]) {
  const counts = new Map<string, Map<string, number>>(); // subject -> examBoard -> count
  for (const s of sessions) {
    const subject = String(s.subject || "").trim();
    if (!subject) continue;
    const board = String(s.exam_board || "").trim().toUpperCase();
    if (!counts.has(subject)) counts.set(subject, new Map());
    if (board) {
      const m = counts.get(subject)!;
      m.set(board, (m.get(board) || 0) + 1);
    }
  }

  const subjects = Array.from(counts.keys()).sort((a, b) => a.localeCompare(b));
  const subjectPrefs = subjects.map((subject) => {
    const boardCounts = counts.get(subject) || new Map();
    let bestBoard: string | null = null;
    let bestCount = -1;
    for (const [b, c] of boardCounts.entries()) {
      if (c > bestCount) {
        bestBoard = b;
        bestCount = c;
      }
    }
    return { subject, exam_board: bestBoard };
  });

  // Default exam board: most common across all sessions
  const globalBoardCounts = new Map<string, number>();
  for (const s of sessions) {
    const b = String(s.exam_board || "").trim().toUpperCase();
    if (!b) continue;
    globalBoardCounts.set(b, (globalBoardCounts.get(b) || 0) + 1);
  }
  let defaultExamBoard: string | null = null;
  let defaultCount = -1;
  for (const [b, c] of globalBoardCounts.entries()) {
    if (c > defaultCount) {
      defaultExamBoard = b;
      defaultCount = c;
    }
  }

  return { subjectPrefs, defaultExamBoard };
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = cors(origin);

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" }, corsHeaders);

  const userToken = getKnackUserToken(req);
  const body = (await req.json().catch(() => null)) as SavePlanRequest | null;

  // Prefer explicit email from client.
  let email = String(body?.email || "").trim().toLowerCase();
  let displayName = String(body?.name || "").trim() || null;

  // Fallback to Knack lookup if email wasn't provided.
  const knackUser = email ? null : await getKnackSessionUser(userToken);
  if (!email) {
    email = String(knackUser?.email || "").trim().toLowerCase();
    displayName = displayName || knackUser?.name || null;
  }

  if (!email) {
    return json(401, { ok: false, error: "Missing or invalid Knack user token" }, corsHeaders);
  }

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
        student_name: displayName,
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
      actual_start_time: session.actual_start_time || null,
      duration_minutes: session.duration_minutes,
      sprint_type_id: session.sprint_type_id || null,
      subject: session.subject || null,
      topic: session.topic || null,
      notes: session.notes || null,
      exam_board: session.exam_board || null,
    }));
    const { error } = await supabase.from("study_planner_plan_sessions").insert(inserts);
    if (error) {
      return json(500, { ok: false, error: error.message }, corsHeaders);
    }
  }

  // Upsert reusable student preferences (subjects/exam boards/level)
  try {
    const { subjectPrefs, defaultExamBoard } = buildSubjectPrefsFromSessions(sessions);
    let q = normalizeQualificationLevel(body?.qualification_level);
    if (!q) q = await resolveQualificationLevelFromSupabase(email);
    const { error: prefErr } = await supabase
      .from("study_planner_student_preferences")
      .upsert({
        student_email: email,
        qualification_level: q,
        subjects: subjectPrefs,
        default_exam_board: defaultExamBoard,
        updated_at: new Date().toISOString(),
      }, { onConflict: "student_email" });
    if (prefErr) {
      console.warn("[study-planner-save] Preference upsert failed:", prefErr.message);
    }
  } catch (e) {
    console.warn("[study-planner-save] Preference upsert error:", e?.message || e);
  }

  return json(
    200,
    { ok: true, planId: planRecord.id, message: status === "confirmed" ? "Plan confirmed." : "Draft saved." },
    corsHeaders,
  );
});
