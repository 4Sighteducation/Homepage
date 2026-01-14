import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SB_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY");
const KNACK_APP_ID = Deno.env.get("KNACK_APP_ID");
const KNACK_API_KEY = Deno.env.get("KNACK_API_KEY");
const KNACK_API_URL = Deno.env.get("KNACK_API_URL") ?? "https://api.knack.com/v1";
const CACHE_TTL_MINUTES = Number(Deno.env.get("CACHE_TTL_MINUTES") ?? "30");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SB_URL or SB_SERVICE_ROLE_KEY");
}

const supabase = createClient(SUPABASE_URL ?? "", SUPABASE_SERVICE_ROLE_KEY ?? "", {
  auth: { persistSession: false },
});

type CacheRequest = {
  action: string;
  cacheKey: string;
  knackObject: string;
  recordId: string;
  force?: boolean;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: CacheRequest;
  try {
    body = await req.json();
  } catch (_err) {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (body.action !== "reportProfilesStudent") {
    return new Response(JSON.stringify({ error: "Unsupported action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!body.cacheKey || !body.knackObject || !body.recordId) {
    return new Response(JSON.stringify({ error: "Missing cacheKey, knackObject, or recordId" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ttlMs = Math.max(CACHE_TTL_MINUTES, 1) * 60 * 1000;

  try {
    if (!body.force) {
      const { data: cached, error: cacheError } = await supabase
        .from("staff_admin_cache")
        .select("payload, updated_at")
        .eq("cache_key", body.cacheKey)
        .maybeSingle();

      if (!cacheError && cached?.payload && cached.updated_at) {
        const updatedAtMs = new Date(cached.updated_at).getTime();
        if (Date.now() - updatedAtMs < ttlMs) {
          return new Response(
            JSON.stringify({
              source: "cache",
              updatedAt: cached.updated_at,
              data: cached.payload,
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
      }
    }

    const knackUrl = `${KNACK_API_URL}/objects/${body.knackObject}/records/${body.recordId}`;
    const knackResponse = await fetch(knackUrl, {
      method: "GET",
      headers: {
        "X-Knack-Application-Id": KNACK_APP_ID ?? "",
        "X-Knack-REST-API-Key": KNACK_API_KEY ?? "",
        "Content-Type": "application/json",
      },
    });

    if (!knackResponse.ok) {
      const errorText = await knackResponse.text();
      return new Response(
        JSON.stringify({ error: "Knack request failed", detail: errorText }),
        {
          status: knackResponse.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const payload = await knackResponse.json();
    const nowIso = new Date().toISOString();

    await supabase.from("staff_admin_cache").upsert({
      cache_key: body.cacheKey,
      payload,
      updated_at: nowIso,
    });

    return new Response(
      JSON.stringify({
        source: "knack",
        updatedAt: nowIso,
        data: payload,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: "Server error", detail: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
