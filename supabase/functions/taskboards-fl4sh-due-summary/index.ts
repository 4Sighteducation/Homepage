import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  assertCanAccessTarget,
  corsHeaders,
  ensureDefaultBoard,
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

type DueResponse = {
  ok: boolean;
  due?: { count: number; as_of: string };
  task?: { created_or_updated: boolean; id?: string | null };
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
    const targetEmail = (requestedTarget || actor.email).toLowerCase();

    const staff = await getStaffRecord(db, actor.email);
    const isStaff = Boolean(staff?.email && staff.active);
    const viewerRole = isStaff ? "staff" : "student";

    if (targetEmail !== actor.email) {
      if (!staff) throw new Error("Not authorized");
      await assertCanAccessTarget({ db, actor, staff, targetEmail });
    }

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

    const nowIso = new Date().toISOString();

    // Best-effort: if FL4SH Lite tables exist in this Supabase project, compute due count.
    // If they don't exist, return ok=false with an explanatory message.
    let dueCount = 0;
    try {
      const { data: liteUser, error: uErr } = await db
        .from("fl4sh_lite_users")
        .select("id,email")
        .eq("email", targetEmail)
        .maybeSingle();
      if (uErr) throw uErr;

      if (!liteUser?.id) {
        // no user yet in FL4SH Lite
        dueCount = 0;
      } else {
        const { count, error: cErr } = await db
          .from("fl4sh_lite_cards")
          .select("id", { count: "exact", head: true })
          .eq("user_id", liteUser.id)
          .lte("next_review_at", nowIso);
        if (cErr) throw cErr;
        dueCount = Number(count || 0);
      }
    } catch (e) {
      return json(
        200,
        {
          ok: false,
          error:
            "FL4SH Lite tables are not available in this Supabase project yet (or access failed). " +
            "Once FL4SH Lite lives in the same Supabase project, this endpoint will return due counts.",
        },
        headers,
      );
    }

    const createTask = Boolean(body.create_task === true);
    let taskId: string | null = null;
    let createdOrUpdated = false;

    if (createTask) {
      const today = new Date().toISOString().slice(0, 10);
      const title = `FL4SH: Review due cards (${dueCount})`;
      const details = dueCount > 0
        ? `You have ${dueCount} card(s) due today. Open FL4SH Lite and complete your review session.`
        : "No cards due right now. If you add cards, they’ll appear here when due.";

      const { data, error: upsertErr } = await db
        .from("taskboards_tasks")
        .upsert({
          user_id: targetUser.id,
          board_id: board.id,
          category_id: null,
          source_type: "fl4sh_due_daily",
          source_id: today,
          title,
          details,
          estimated_minutes: Math.max(10, Math.min(60, dueCount * 2)),
          target_date: today,
          start_time: null,
          status: "Pending",
          priority: "Hot",
          manual_priority: true,
        }, { onConflict: "user_id,source_type,source_id" })
        .select("id")
        .single();

      if (upsertErr) throw new Error(upsertErr.message);
      taskId = data?.id || null;
      createdOrUpdated = true;
    }

    await db.from("taskboards_audit_log").insert({
      actor_email: actor.email,
      actor_role: viewerRole,
      target_email: targetEmail,
      action: "fl4sh_due_summary",
      metadata: { due_count: dueCount, created_task: createTask, task_id: taskId },
    });

    const resp: DueResponse = {
      ok: true,
      due: { count: dueCount, as_of: nowIso },
      task: createTask ? { created_or_updated: createdOrUpdated, id: taskId } : undefined,
    };
    return json(200, resp, headers);
  } catch (e) {
    return json(500, { ok: false, error: (e as Error)?.message || "Internal error" }, headers);
  }
});

