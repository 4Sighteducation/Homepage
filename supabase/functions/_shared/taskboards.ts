import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type TaskboardsStaffPermission = "read" | "edit" | "admin";

export type Actor = {
  email: string;
  fullName: string | null;
  schoolName: string | null;
  qualificationLevel: string | null;
  knackUserId: string | null;
};

export type Viewer = {
  role: "student" | "staff";
  permission: TaskboardsStaffPermission | null;
};

export type StaffRecord = {
  email: string;
  full_name: string | null;
  school_name: string | null;
  permission: TaskboardsStaffPermission;
  allow_school_scope: boolean;
  active: boolean;
};

export function envAny(keys: string[], fallback = ""): string {
  for (const k of keys) {
    const v = Deno.env.get(k);
    if (v && v.trim()) return v.trim();
  }
  return fallback;
}

export function getSupabaseServiceClient() {
  const url = envAny(["SB_URL", "SUPABASE_URL"]);
  const key = envAny(["SB_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"]);
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

export function getAllowedOrigins() {
  return envAny(["ALLOWED_ORIGINS"], "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function corsHeaders(origin: string | null) {
  const allowed = getAllowedOrigins();
  const allowOrigin =
    origin && (allowed.length === 0 || allowed.includes(origin)) ? origin : "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers":
      "content-type, authorization, apikey, x-taskboards-secret",
  };
}

export function json(status: number, body: unknown, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

export function handlePreflight(req: Request, headers: Record<string, string>) {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  return null;
}

export function requirePost(req: Request, headers: Record<string, string>) {
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" }, headers);
  return null;
}

export function verifyOptionalBridgeSecret(req: Request) {
  // Optional hardening: if TASKBOARDS_BRIDGE_SECRET is set, require header match.
  const expected = envAny(["TASKBOARDS_BRIDGE_SECRET", "TASKBOARDS_SECRET"], "");
  if (!expected) return { ok: true as const };
  const got = (req.headers.get("x-taskboards-secret") || "").trim();
  if (!got) return { ok: false as const, error: "Missing x-taskboards-secret" };
  if (got !== expected) return { ok: false as const, error: "Invalid bridge secret" };
  return { ok: true as const };
}

export function parseActor(body: Record<string, unknown>) : Actor | null {
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email) return null;
  return {
    email,
    fullName: String(body.name ?? body.full_name ?? "").trim() || null,
    schoolName: String(body.school_name ?? "").trim() || null,
    qualificationLevel: String(body.qualification_level ?? "").trim() || null,
    knackUserId: String(body.knack_user_id ?? "").trim() || null,
  };
}

export function parseTargetEmail(body: Record<string, unknown>) {
  const raw = String(body.target_email ?? body.as_student_email ?? "").trim().toLowerCase();
  return raw || null;
}

export function permRank(p: TaskboardsStaffPermission): number {
  if (p === "admin") return 3;
  if (p === "edit") return 2;
  return 1;
}

export async function getStaffRecord(db: any, email: string): Promise<StaffRecord | null> {
  const { data, error } = await db
    .from("taskboards_staff")
    .select("email,full_name,school_name,permission,allow_school_scope,active")
    .eq("email", email)
    .maybeSingle();
  if (error) return null;
  return (data as StaffRecord) || null;
}

export async function ensureUser(db: any, actor: Actor) {
  const { data, error } = await db
    .from("taskboards_users")
    .upsert({
      email: actor.email,
      knack_user_id: actor.knackUserId,
      full_name: actor.fullName,
      school_name: actor.schoolName,
      qualification_level: actor.qualificationLevel,
    }, { onConflict: "email" })
    .select("id,email,full_name,school_name,qualification_level,gamification")
    .single();
  if (error || !data?.id) throw new Error(error?.message || "Could not upsert taskboards user");
  return data;
}

export async function ensureDefaultBoard(db: any, userId: string) {
  const { data: existing, error: getErr } = await db
    .from("taskboards_boards")
    .select("id,name,is_default")
    .eq("user_id", userId)
    .eq("is_default", true)
    .maybeSingle();
  if (getErr) throw new Error(getErr.message);
  if (existing?.id) return existing;

  const { data, error } = await db
    .from("taskboards_boards")
    .insert({ user_id: userId, name: "My Taskboard", is_default: true })
    .select("id,name,is_default")
    .single();
  if (error || !data?.id) throw new Error(error?.message || "Could not create default board");
  return data;
}

export async function ensureDefaultCategories(db: any, userId: string) {
  const defaults = [
    { name: "Homework", color_hex: "#00E5DB", sort_order: 10 },
    { name: "Coursework", color_hex: "#00ADA5", sort_order: 20 },
    { name: "Exam Revision", color_hex: "#112F62", sort_order: 30 },
    { name: "Planning", color_hex: "#079BAA", sort_order: 40 },
    { name: "Practicing", color_hex: "#005FE6", sort_order: 50 },
    { name: "Event", color_hex: "#87DDFD", sort_order: 60 },
  ];

  // Upsert by (user_id,name) unique constraint.
  const { error } = await db
    .from("taskboards_categories")
    .upsert(defaults.map((d) => ({ ...d, user_id: userId })), { onConflict: "user_id,name" });
  if (error) throw new Error(error.message);
}

export async function assertCanAccessTarget(params: {
  db: any;
  actor: Actor;
  staff: StaffRecord;
  targetEmail: string;
}) {
  const { db, actor, staff, targetEmail } = params;
  if (!staff.active) throw new Error("Staff account is inactive");
  if (permRank(staff.permission) < permRank("edit")) throw new Error("Insufficient staff permission");

  // Admin can access anyone.
  if (staff.permission === "admin") return;

  // Explicit mapping grants access.
  const { data: mapping, error: mapErr } = await db
    .from("taskboards_staff_student_access")
    .select("staff_email,student_email,can_edit")
    .eq("staff_email", actor.email)
    .eq("student_email", targetEmail)
    .maybeSingle();
  if (mapErr) throw new Error(mapErr.message);
  if (mapping?.staff_email && mapping?.student_email) {
    if (!mapping.can_edit) throw new Error("Staff mapping is read-only");
    return;
  }

  // School-scope: staff.school_name must match student.school_name.
  if (!staff.allow_school_scope) throw new Error("No access to this student");
  const staffSchool = String(staff.school_name || "").trim();
  if (!staffSchool) throw new Error("Staff is missing school scope");

  const { data: student, error: stuErr } = await db
    .from("taskboards_users")
    .select("email,school_name")
    .eq("email", targetEmail)
    .maybeSingle();
  if (stuErr) throw new Error(stuErr.message);
  const studentSchool = String(student?.school_name || "").trim();
  if (!student?.email || !studentSchool) throw new Error("Student not found or missing school");
  if (studentSchool !== staffSchool) throw new Error("No access to this student");
}

