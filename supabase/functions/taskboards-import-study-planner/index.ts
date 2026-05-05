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

type ImportResponse = {
  ok: boolean;
  imported?: { tasks_upserted: number; plan_id: string; week_start_date: string };
  error?: string;
};

const db = getSupabaseServiceClient();

function addDays(isoDate: string, days: number) {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

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
    const targetEmail = (requestedTarget || actor.email).toLowerCase();

    const staff = await getStaffRecord(db, actor.email);
    const isStaff = Boolean(staff?.email && staff.active);
    const viewerRole = isStaff ? "staff" : "student";

    if (targetEmail !== actor.email) {
      if (!staff) throw new Error("Not authorized");
      await assertCanAccessTarget({ db, actor, staff, targetEmail });
    }

    // Ensure Taskboards user + board/categories
    await ensureUser(db, actor);
    const targetUser = targetEmail === actor.email
      ? await ensureUser(db, actor)
      : await ensureUser(db, {
        ...actor,
        email: targetEmail,
        fullName: null,
        schoolName: null,
        qualificationLevel: null,
        knackUserId: null,
      });
    const board = await ensureDefaultBoard(db, targetUser.id);
    await ensureDefaultCategories(db, targetUser.id);

    // Determine which plan to import.
    const explicitPlanId = String(body.plan_id || body.planId || "").trim() || null;
    const explicitWeek = String(body.week_start_date || body.weekStartDate || "").trim() || null;

    let plan: any = null;
    if (explicitPlanId) {
      const { data, error } = await db
        .from("study_planner_plans")
        .select("id,student_email,week_start_date,status")
        .eq("id", explicitPlanId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      plan = data;
    } else {
      let q = db
        .from("study_planner_plans")
        .select("id,student_email,week_start_date,status")
        .eq("student_email", targetEmail)
        .neq("status", "deleted")
        .order("week_start_date", { ascending: false })
        .limit(1);
      if (explicitWeek) q = q.eq("week_start_date", explicitWeek);
      const { data, error } = await q.maybeSingle();
      if (error) throw new Error(error.message);
      plan = data;
    }

    if (!plan?.id || !plan.week_start_date) {
      return json(404, { ok: false, error: "No study plan found to import" }, headers);
    }
    if (String(plan.student_email || "").toLowerCase() !== targetEmail) {
      return json(403, { ok: false, error: "Plan does not belong to target student" }, headers);
    }

    const { data: sessions, error: sesErr } = await db
      .from("study_planner_plan_sessions")
      .select("id,plan_id,day_of_week,start_time,duration_minutes,subject,topic,notes,exam_board")
      .eq("plan_id", plan.id);
    if (sesErr) throw new Error(sesErr.message);

    const weekStart = String(plan.week_start_date);
    const rows = (sessions || []).map((s: any) => {
      const dayIndex = Math.max(1, Math.min(7, Number(s.day_of_week || 1))) - 1;
      const date = addDays(weekStart, dayIndex);
      const startTime = String(s.start_time || "").slice(0, 8) || null;
      const subject = String(s.subject || "").trim();
      const topic = String(s.topic || "").trim();
      const notes = String(s.notes || "").trim();
      const examBoard = String(s.exam_board || "").trim();

      const title = subject ? `Study: ${subject}` : "Study session";
      const detailsParts = [];
      if (topic) detailsParts.push(`Topic: ${topic}`);
      if (examBoard) detailsParts.push(`Exam board: ${examBoard}`);
      if (notes) detailsParts.push(notes);

      return {
        user_id: targetUser.id,
        board_id: board.id,
        category_id: null,
        source_type: "study_planner_session",
        source_id: String(s.id),
        title,
        details: detailsParts.length ? detailsParts.join("\n") : null,
        estimated_minutes: Number(s.duration_minutes || 60),
        target_date: date,
        start_time: startTime,
        status: "Pending",
        priority: "Awaiting",
        manual_priority: false,
      };
    });

    if (!rows.length) {
      return json(200, { ok: true, imported: { tasks_upserted: 0, plan_id: plan.id, week_start_date: weekStart } }, headers);
    }

    const { error: upsertErr } = await db
      .from("taskboards_tasks")
      .upsert(rows, { onConflict: "user_id,source_type,source_id" });
    if (upsertErr) throw new Error(upsertErr.message);

    await db.from("taskboards_audit_log").insert({
      actor_email: actor.email,
      actor_role: viewerRole,
      target_email: targetEmail,
      action: "import_study_planner",
      metadata: { plan_id: plan.id, week_start_date: weekStart, session_count: rows.length },
    });

    const resp: ImportResponse = {
      ok: true,
      imported: { tasks_upserted: rows.length, plan_id: plan.id, week_start_date: weekStart },
    };
    return json(200, resp, headers);
  } catch (e) {
    return json(500, { ok: false, error: (e as Error)?.message || "Internal error" }, headers);
  }
});

