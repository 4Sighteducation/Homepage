import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  corsHeaders,
  getStaffRecord,
  getSupabaseServiceClient,
  handlePreflight,
  json,
  parseActor,
  requirePost,
  verifyOptionalBridgeSecret,
} from "../_shared/taskboards.ts";

type RosterResponse = {
  ok: boolean;
  roster?: Array<{ email: string; full_name: string | null; school_name: string | null }>;
  error?: string;
};

const db = getSupabaseServiceClient();

serve(async (req) => {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  const pre = handlePreflight(req, headers);
  if (pre) return pre;

  const postErr = requirePost(req, headers);
  if (postErr) return postErr;

  const secret = verifyOptionalBridgeSecret(req);
  if (!secret.ok) return json(401, { ok: false, error: secret.error }, headers);

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const actor = parseActor(body);
    if (!actor) return json(400, { ok: false, error: "Missing email" }, headers);

    const staff = await getStaffRecord(db, actor.email);
    if (!staff?.email || !staff.active) return json(403, { ok: false, error: "Not staff" }, headers);

    const explicit = await db
      .from("taskboards_staff_student_access")
      .select("student_email")
      .eq("staff_email", actor.email);
    if (explicit.error) throw new Error(explicit.error.message);

    const explicitEmails = (explicit.data || []).map((r: any) =>
      String(r.student_email || "").toLowerCase()
    ).filter(Boolean);

    const schoolScope = staff.allow_school_scope && staff.school_name
      ? await db
        .from("taskboards_users")
        .select("email,full_name,school_name")
        .eq("school_name", staff.school_name)
        .limit(1000)
      : { data: [], error: null };
    if (schoolScope.error) throw new Error(schoolScope.error.message);

    const combined = new Map<string, { email: string; full_name: string | null; school_name: string | null }>();
    for (const e of explicitEmails) combined.set(e, { email: e, full_name: null, school_name: null });
    for (const u of (schoolScope.data || []) as any[]) {
      const e = String(u.email || "").toLowerCase();
      if (!e) continue;
      combined.set(e, { email: e, full_name: u.full_name ?? null, school_name: u.school_name ?? null });
    }
    combined.delete(actor.email);

    const roster = Array.from(combined.values()).sort((a, b) => a.email.localeCompare(b.email));
    const resp: RosterResponse = { ok: true, roster };
    return json(200, resp, headers);
  } catch (e) {
    return json(500, { ok: false, error: (e as Error)?.message || "Internal error" }, headers);
  }
});

