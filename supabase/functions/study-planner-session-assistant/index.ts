import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type AssistRequest = {
  // Identity (optional, mainly for audit/logging)
  email?: string | null;
  name?: string | null;

  // Session context
  sprint_type_key?: string | null;
  subject?: string | null;
  topic?: string | null;
  exam_board?: string | null;
  qualification_level?: string | null;

  // User intent
  study_idea_key?: string | null;
};

type AssistResponse = {
  ok: boolean;
  topic_suggestions?: string[];
  steps?: string[];
  retrieval_questions?: string[];
  notes?: string;
  error?: string;
  debug?: Record<string, unknown>;
};

function envAny(keys: string[], fallback = ""): string {
  for (const k of keys) {
    const v = Deno.env.get(k);
    if (v && v.trim()) return v.trim();
  }
  return fallback;
}

const OPENAI_API_KEY = envAny(["OPENAI_API_KEY"]);
const OPENAI_MODEL = envAny(["COACH_MODEL", "OPENAI_MODEL"], "gpt-4o-mini");

// FLASH (sister project) Supabase credentials (server-side only)
const FLASH_SUPABASE_URL = envAny(["FLASH_SUPABASE_URL"]);
const FLASH_SUPABASE_SERVICE_ROLE_KEY = envAny([
  "FLASH_SUPABASE_SERVICE_ROLE_KEY",
  "FLASH_SERVICE_ROLE_KEY",
]);

const ALLOWED_ORIGINS = envAny(["ALLOWED_ORIGINS"], "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (!OPENAI_API_KEY) {
  console.error("[study-planner-session-assistant] Missing OPENAI_API_KEY");
}
if (!FLASH_SUPABASE_URL || !FLASH_SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("[study-planner-session-assistant] Flash DB not configured (FLASH_SUPABASE_URL / FLASH_SUPABASE_SERVICE_ROLE_KEY)");
}

const flash = (FLASH_SUPABASE_URL && FLASH_SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(FLASH_SUPABASE_URL, FLASH_SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

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

function json(status: number, body: AssistResponse, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

const STUDY_IDEAS: Record<string, { title: string; description: string }> = {
  retrieval: {
    title: "Retrieval practice (self-quiz)",
    description: "Generate quick questions and answers. Focus on weak spots.",
  },
  exam_questions: {
    title: "Exam-style questions",
    description: "Generate questions in the style of the exam/spec, plus mark scheme bullets.",
  },
  flashcards: {
    title: "Flashcards",
    description: "Generate 6–10 crisp Q/A flashcards for the topic.",
  },
  blurting: {
    title: "Blurting",
    description: "Write what you know from memory, then patch gaps using notes/spec.",
  },
  past_paper: {
    title: "Past paper focus",
    description: "Pick likely question areas and plan a short drill + review loop.",
  },
  teach_back: {
    title: "Teach it back",
    description: "Explain the topic simply, spot gaps, then re-explain with correct detail.",
  },
};

async function flashLookupTopics(params: {
  subject: string;
  topic: string;
  exam_board?: string | null;
  qualification_level?: string | null;
  limit?: number;
}) {
  if (!flash) return [];

  const subject = params.subject.trim();
  const topic = params.topic.trim();
  const examBoard = (params.exam_board || "").trim().toUpperCase() || null;
  const qual = (params.qualification_level || "").trim().toUpperCase() || null;
  const limit = Math.max(1, Math.min(10, params.limit ?? 6));

  // Resolve exam board + qualification IDs (optional filters)
  const [{ data: ebRow }, { data: qtRow }] = await Promise.all([
    examBoard
      ? flash.from("exam_boards").select("id, code").eq("code", examBoard).maybeSingle()
      : Promise.resolve({ data: null }),
    qual
      ? flash.from("qualification_types").select("id, code").eq("code", qual).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const examBoardId = (ebRow as any)?.id ?? null;
  const qualId = (qtRow as any)?.id ?? null;

  let ebsQuery = flash
    .from("exam_board_subjects")
    .select("id, subject_name, exam_board_id, qualification_type_id, is_current")
    .ilike("subject_name", `%${subject}%`)
    .eq("is_current", true)
    .limit(8);
  if (examBoardId) ebsQuery = ebsQuery.eq("exam_board_id", examBoardId);
  if (qualId) ebsQuery = ebsQuery.eq("qualification_type_id", qualId);

  const { data: ebs, error: ebsErr } = await ebsQuery;
  if (ebsErr) throw new Error(`Flash lookup failed (exam_board_subjects): ${ebsErr.message}`);

  const ebsIds = (ebs || []).map((r: any) => r.id).filter(Boolean);
  if (!ebsIds.length) return [];

  let topicsQuery = flash
    .from("curriculum_topics")
    .select("id, topic_name, display_name, topic_level, parent_topic_id, sort_order, exam_board_subject_id")
    .in("exam_board_subject_id", ebsIds)
    .order("topic_level", { ascending: true })
    .order("sort_order", { ascending: true })
    .limit(limit);

  if (topic) {
    // PostgREST OR syntax:
    // column.operator.value,column.operator.value
    topicsQuery = topicsQuery.or(
      `topic_name.ilike.%${topic}%,display_name.ilike.%${topic}%`,
    );
  }

  const { data: topics, error: tErr } = await topicsQuery;
  if (tErr) throw new Error(`Flash lookup failed (curriculum_topics): ${tErr.message}`);

  const topicIds = (topics || []).map((t: any) => t.id).filter(Boolean);
  if (!topicIds.length) return [];

  const { data: meta, error: mErr } = await flash
    .from("topic_ai_metadata")
    .select(
      "topic_id, plain_english_summary, difficulty_band, exam_importance, subject_name, exam_board, qualification_level, topic_level, full_path",
    )
    .in("topic_id", topicIds);
  if (mErr) throw new Error(`Flash lookup failed (topic_ai_metadata): ${mErr.message}`);

  const metaById = new Map((meta || []).map((m: any) => [m.topic_id, m]));

  return (topics || []).map((t: any) => {
    const m = metaById.get(t.id) || {};
    return {
      id: t.id,
      name: (t.display_name || t.topic_name || "").trim(),
      topic_name: t.topic_name || null,
      display_name: t.display_name || null,
      topic_level: t.topic_level ?? null,
      summary: m.plain_english_summary || null,
      exam_importance: m.exam_importance ?? null,
      difficulty_band: m.difficulty_band || null,
      full_path: Array.isArray(m.full_path) ? m.full_path : null,
      exam_board: m.exam_board || null,
      qualification_level: m.qualification_level || null,
      subject_name: m.subject_name || null,
    };
  });
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = cors(origin);

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" }, corsHeaders);
  if (!OPENAI_API_KEY) return json(500, { ok: false, error: "Study Assistant not configured" }, corsHeaders);

  const body = (await req.json().catch(() => null)) as AssistRequest | null;
  const subject = String(body?.subject || "").trim();
  const topic = String(body?.topic || "").trim();
  const examBoard = String(body?.exam_board || "").trim();
  const qualificationLevel = String(body?.qualification_level || "").trim();
  const sprintTypeKey = String(body?.sprint_type_key || "").trim() || "short";
  const studyIdeaKey = String(body?.study_idea_key || "").trim() || "retrieval";

  if (!subject && !topic) {
    return json(400, { ok: false, error: "Please provide a subject and/or a topic." }, corsHeaders);
  }

  const idea = STUDY_IDEAS[studyIdeaKey] || STUDY_IDEAS.retrieval;

  // Pull structured topic context from Flash (best-effort).
  let flashTopics: any[] = [];
  try {
    if (subject) {
      flashTopics = await flashLookupTopics({
        subject,
        topic,
        exam_board: examBoard || null,
        qualification_level: qualificationLevel || null,
        limit: 6,
      });
    }
  } catch (e) {
    console.warn("[study-planner-session-assistant] Flash lookup failed:", e?.message || e);
  }

  const topicContext = flashTopics.slice(0, 4).map((t) => {
    const path = Array.isArray(t.full_path) ? t.full_path.join(" → ") : null;
    return {
      name: t.name,
      path,
      summary: t.summary,
      exam_importance: t.exam_importance,
      difficulty_band: t.difficulty_band,
      exam_board: t.exam_board,
      qualification_level: t.qualification_level,
      subject_name: t.subject_name,
    };
  });

  const system = [
    "You are VESPA Study Assistant for a single study session (UK).",
    "Return ONLY strict JSON (no markdown).",
    "Be concise and practical. Avoid fluff.",
    "",
    "Goal: help the student make this one session actionable.",
    "Use the selected study idea and the sprint type to shape the plan.",
    "",
    "Output JSON shape:",
    "{",
    '  "topic_suggestions": ["..."],',
    '  "steps": ["..."],',
    '  "retrieval_questions": ["..."],',
    '  "notes": "..."',
    "}",
    "",
    "Rules:",
    "- If the topic is missing or vague, suggest 3–6 specific topic names.",
    "- Steps should fit the sprint type duration roughly (short/quick/serious/standard_30/standard_60).",
    "- If exam board is provided, tailor to it (but never invent spec codes).",
    "- Retrieval questions should be short and checkable.",
  ].join("\n");

  const userMsg = JSON.stringify(
    {
      sprint_type_key: sprintTypeKey,
      subject: subject || null,
      topic: topic || null,
      exam_board: examBoard || null,
      qualification_level: qualificationLevel || null,
      study_idea: { key: studyIdeaKey, ...idea },
      flash_topic_context: topicContext,
    },
    null,
    2,
  );

  const oaiResp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMsg },
      ],
    }),
  });

  if (!oaiResp.ok) {
    const t = await oaiResp.text().catch(() => "");
    return json(500, { ok: false, error: `OpenAI error: ${t || oaiResp.status}` }, corsHeaders);
  }

  const oaiJson = await oaiResp.json().catch(() => null);
  const content = String(oaiJson?.choices?.[0]?.message?.content || "").trim();
  if (!content) return json(500, { ok: false, error: "Empty Study Assistant response" }, corsHeaders);

  let parsed: any = null;
  try {
    parsed = JSON.parse(content);
  } catch {
    // tolerate any pre/post text by extracting first JSON object
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start >= 0 && end > start) {
      parsed = JSON.parse(content.slice(start, end + 1));
    } else {
      return json(500, { ok: false, error: "Study Assistant returned invalid JSON" }, corsHeaders);
    }
  }

  const topicSuggestions = Array.isArray(parsed?.topic_suggestions) ? parsed.topic_suggestions.map((x: any) => String(x).trim()).filter(Boolean) : [];
  const steps = Array.isArray(parsed?.steps) ? parsed.steps.map((x: any) => String(x).trim()).filter(Boolean) : [];
  const retrievalQuestions = Array.isArray(parsed?.retrieval_questions) ? parsed.retrieval_questions.map((x: any) => String(x).trim()).filter(Boolean) : [];
  const notes = parsed?.notes ? String(parsed.notes).trim() : "";

  return json(
    200,
    {
      ok: true,
      topic_suggestions: topicSuggestions.slice(0, 8),
      steps: steps.slice(0, 10),
      retrieval_questions: retrievalQuestions.slice(0, 12),
      notes,
      debug: {
        used_flash: Boolean(flashTopics.length),
        flash_topic_count: flashTopics.length,
      },
    },
    corsHeaders,
  );
});

