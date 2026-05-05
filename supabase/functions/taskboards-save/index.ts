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

type SaveResponse = { ok: boolean; error?: string; saved?: { taskCount: number; categoryCount: number } };

const db = getSupabaseServiceClient();

function asIsoDate(value: unknown): string | null {
  const s = String(value || "").trim();
  if (!s) return null;
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

function asTime(value: unknown): string | null {
  const s = String(value || "").trim();
  if (!s) return null;
  // HH:MM or HH:MM:SS
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(s)) return s.length === 5 ? `${s}:00` : s;
  return null;
}

function clampMinutes(n: unknown): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return 60;
  return Math.max(1, Math.min(600, Math.round(x)));
}

function normalizeStatus(v: unknown): "Pending" | "Doing" | "Done" | "Archived" {
  const s = String(v || "").trim();
  if (s === "Pending" || s === "Doing" || s === "Done" || s === "Archived") return s;
  return "Pending";
}

function normalizePriority(v: unknown): "Hot" | "Warm" | "Cold" | "Awaiting" {
  const s = String(v || "").trim();
  if (s === "Hot" || s === "Warm" || s === "Cold" || s === "Awaiting") return s;
  return "Awaiting";
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
    const viewerPerm = isStaff ? staff!.permission : null;

    if (targetEmail !== actor.email) {
      if (!staff) throw new Error("Not authorized");
      await assertCanAccessTarget({ db, actor, staff, targetEmail });
    }

    // Upsert actor and target users
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

    // Categories upsert (optional)
    const categoriesIn = Array.isArray(body.categories) ? body.categories as any[] : [];
    if (categoriesIn.length) {
      const rows = categoriesIn.map((c) => ({
        id: c.id || undefined,
        user_id: targetUser.id,
        name: String(c.name || "").trim(),
        color_hex: String(c.color_hex || c.color || "#00E5DB").trim() || "#00E5DB",
        sort_order: (c.sort_order === null || c.sort_order === undefined) ? null : Number(c.sort_order),
      })).filter((r) => r.name);
      if (rows.length) {
        const { error } = await db.from("taskboards_categories").upsert(rows, {
          onConflict: "user_id,name",
        });
        if (error) throw new Error(error.message);
      }
    }

    // Create a category lookup by name (for tasks that send category.name)
    const { data: catRows, error: catErr } = await db
      .from("taskboards_categories")
      .select("id,name,color_hex")
      .eq("user_id", targetUser.id);
    if (catErr) throw new Error(catErr.message);
    const catByName = new Map<string, { id: string; name: string; color_hex: string }>();
    for (const c of (catRows || []) as any[]) {
      const n = String(c.name || "").trim().toLowerCase();
      if (n) catByName.set(n, c);
    }

    // Tasks
    const tasksIn = Array.isArray(body.tasks) ? body.tasks as any[] : [];
    const taskRows = tasksIn.map((t) => {
      const status = normalizeStatus(t.status);
      const priority = normalizePriority(t.priority);
      const completedAt = t.completed_at || t.completedAt || null;
      const archivedAt = t.archived_at || t.archivedAt || null;

      // Resolve category_id
      let categoryId: string | null = null;
      if (t.category_id) categoryId = String(t.category_id);
      else if (t.category && typeof t.category === "object") {
        if (t.category.id) categoryId = String(t.category.id);
        const nm = String(t.category.name || "").trim().toLowerCase();
        if (!categoryId && nm && catByName.has(nm)) categoryId = catByName.get(nm)!.id;
      } else if (t.category_name) {
        const nm = String(t.category_name || "").trim().toLowerCase();
        if (nm && catByName.has(nm)) categoryId = catByName.get(nm)!.id;
      }

      // Best-effort timestamps
      const nowIso = new Date().toISOString();
      const nextCompletedAt =
        status === "Done" ? String(completedAt || nowIso) : (status === "Archived" ? String(completedAt || nowIso) : null);
      const nextArchivedAt = status === "Archived" ? String(archivedAt || nowIso) : null;

      return {
        id: t.id || undefined,
        user_id: targetUser.id,
        board_id: board.id,
        category_id: categoryId,
        title: String(t.title || "").trim(),
        details: String(t.details || "").trim() || null,
        estimated_minutes: clampMinutes(t.estimated_minutes ?? t.estimated ?? 60),
        target_date: asIsoDate(t.target_date ?? t.targetDate),
        start_time: asTime(t.start_time ?? t.startTime),
        status,
        priority,
        manual_priority: Boolean(t.manual_priority ?? t.manualPriority ?? false),
        completed_at: nextCompletedAt,
        archived_at: nextArchivedAt,
      };
    }).filter((r) => r.title);

    if (taskRows.length) {
      const { error } = await db.from("taskboards_tasks").upsert(taskRows, { onConflict: "id" });
      if (error) throw new Error(error.message);
    }

    // Explicit deletions
    const deleteIds = Array.isArray(body.delete_task_ids) ? body.delete_task_ids as unknown[] : [];
    const cleanDeleteIds = deleteIds.map((x) => String(x || "").trim()).filter(Boolean);
    if (cleanDeleteIds.length) {
      const { error } = await db
        .from("taskboards_tasks")
        .delete()
        .eq("user_id", targetUser.id)
        .in("id", cleanDeleteIds);
      if (error) throw new Error(error.message);
    }

    // Optional: auto-archive done tasks older than N days (default 7)
    const doAutoArchive = Boolean(body.auto_archive === true);
    const days = Number(body.auto_archive_days ?? 7);
    if (doAutoArchive && Number.isFinite(days) && days >= 1) {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      await db
        .from("taskboards_tasks")
        .update({ status: "Archived", archived_at: new Date().toISOString() })
        .eq("user_id", targetUser.id)
        .eq("status", "Done")
        .lte("completed_at", cutoff);
    }

    // Optional: gamification blob
    if (body.gamification !== undefined) {
      const { error } = await db
        .from("taskboards_users")
        .update({ gamification: body.gamification })
        .eq("id", targetUser.id);
      if (error) throw new Error(error.message);
    }

    // Audit
    await db.from("taskboards_audit_log").insert({
      actor_email: actor.email,
      actor_role: viewerRole,
      target_email: targetEmail,
      action: "save",
      metadata: {
        viewer_permission: viewerPerm,
        task_count: taskRows.length,
        category_count: categoriesIn.length,
        delete_count: cleanDeleteIds.length,
      },
    });

    const resp: SaveResponse = {
      ok: true,
      saved: { taskCount: taskRows.length, categoryCount: categoriesIn.length },
    };
    return json(200, resp, headers);
  } catch (e) {
    return json(500, { ok: false, error: (e as Error)?.message || "Internal error" }, headers);
  }
});

