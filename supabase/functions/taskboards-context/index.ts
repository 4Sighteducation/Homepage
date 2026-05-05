import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  assertCanAccessTarget,
  corsHeaders,
  ensureDefaultBoard,
  ensureDefaultCategories,
  ensureUser,
  getStaffRecord,
  getSupabaseServiceClient,
  handlePreflight,
  json,
  parseActor,
  parseTargetEmail,
  requirePost,
  verifyOptionalBridgeSecret,
} from "../_shared/taskboards.ts";

type ContextResponse = {
  ok: boolean;
  viewer?: {
    email: string;
    role: "student" | "staff";
    permission: "read" | "edit" | "admin" | null;
  };
  target?: {
    email: string;
    full_name: string | null;
    school_name: string | null;
    qualification_level: string | null;
  };
  board?: { id: string; name: string };
  categories?: Array<{ id: string; name: string; color_hex: string; sort_order: number | null }>;
  tasks?: Array<Record<string, unknown>>;
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

    const requestedTarget = parseTargetEmail(body);
    const staff = await getStaffRecord(db, actor.email);

    const isStaff = Boolean(staff?.email && staff.active);
    const viewerRole = isStaff ? "staff" : "student";
    const viewerPerm = isStaff ? staff!.permission : null;

    const targetEmail = (requestedTarget || actor.email).toLowerCase();

    // If staff is requesting another user, validate access.
    if (targetEmail !== actor.email) {
      if (!staff) throw new Error("Not authorized");
      await assertCanAccessTarget({ db, actor, staff, targetEmail });
    }

    // Upsert actor identity (best-effort). For staff viewing a student, we upsert the target too.
    const actorUser = await ensureUser(db, actor);
    let targetUser = actorUser;
    if (targetEmail !== actor.email) {
      const minimalTarget = {
        ...actor,
        email: targetEmail,
        // Do not overwrite student identity with staff info
        fullName: null,
        schoolName: null,
        qualificationLevel: null,
        knackUserId: null,
      };
      targetUser = await ensureUser(db, minimalTarget);
    }

    // Ensure board + defaults
    const board = await ensureDefaultBoard(db, targetUser.id);
    await ensureDefaultCategories(db, targetUser.id);

    // Load categories
    const { data: categories, error: catErr } = await db
      .from("taskboards_categories")
      .select("id,name,color_hex,sort_order")
      .eq("user_id", targetUser.id)
      .order("sort_order", { ascending: true, nullsLast: true })
      .order("name", { ascending: true });
    if (catErr) throw new Error(catErr.message);

    // Load tasks
    const { data: tasks, error: taskErr } = await db
      .from("taskboards_tasks")
      .select(
        "id,user_id,board_id,category_id,title,details,estimated_minutes,target_date,start_time,status,priority,manual_priority,completed_at,archived_at,created_at,updated_at",
      )
      .eq("user_id", targetUser.id)
      .order("updated_at", { ascending: false });
    if (taskErr) throw new Error(taskErr.message);

    // If staff: build roster (explicit mappings + school-scope)
    let roster: Array<{ email: string; full_name: string | null; school_name: string | null }> =
      [];
    if (isStaff) {
      const explicit = await db
        .from("taskboards_staff_student_access")
        .select("student_email")
        .eq("staff_email", actor.email);
      if (explicit.error) throw new Error(explicit.error.message);

      const explicitEmails = (explicit.data || []).map((r: any) =>
        String(r.student_email || "").toLowerCase()
      ).filter(Boolean);

      const schoolScope = staff?.allow_school_scope && staff?.school_name
        ? await db
          .from("taskboards_users")
          .select("email,full_name,school_name")
          .eq("school_name", staff.school_name)
          .limit(500)
        : { data: [], error: null };
      if (schoolScope.error) throw new Error(schoolScope.error.message);

      const combined = new Map<string, { email: string; full_name: string | null; school_name: string | null }>();
      for (const e of explicitEmails) combined.set(e, { email: e, full_name: null, school_name: null });
      for (const u of (schoolScope.data || []) as any[]) {
        const e = String(u.email || "").toLowerCase();
        if (!e) continue;
        combined.set(e, { email: e, full_name: u.full_name ?? null, school_name: u.school_name ?? null });
      }
      // Remove staff themselves if present
      combined.delete(actor.email);
      roster = Array.from(combined.values()).sort((a, b) => a.email.localeCompare(b.email));
    }

    // Audit
    await db.from("taskboards_audit_log").insert({
      actor_email: actor.email,
      actor_role: viewerRole,
      target_email: targetEmail,
      action: "context",
      metadata: { viewer_role: viewerRole, viewer_permission: viewerPerm },
    });

    const resp: ContextResponse = {
      ok: true,
      viewer: { email: actor.email, role: viewerRole, permission: viewerPerm },
      target: {
        email: targetUser.email,
        full_name: targetUser.full_name ?? null,
        school_name: targetUser.school_name ?? null,
        qualification_level: targetUser.qualification_level ?? null,
      },
      board: { id: board.id, name: board.name },
      categories: (categories || []) as any,
      tasks: (tasks || []) as any,
      roster,
    };
    return json(200, resp, headers);
  } catch (e) {
    return json(500, { ok: false, error: (e as Error)?.message || "Internal error" }, headers);
  }
});

