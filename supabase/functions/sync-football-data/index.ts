import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.3";

import {
  type FootballDataMatch,
  type LocalMatch,
  prepareFootballDataUpdates,
} from "../_shared/football-data.ts";

const corsHeaders = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

const MIN_SYNC_INTERVAL_MS = 90_000;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  if (Deno.env.get("WORLDCUP_ARCHIVED") !== "false") {
    return json(
      {
        error: "Archived",
        message: "월드컵 예측 프로젝트는 읽기 전용 아카이브입니다.",
      },
      410,
    );
  }

  try {
    const adminPin = await readAdminPin(request);
    if (!adminPin) {
      return json({ error: "관리자 PIN 형식이 올바르지 않습니다." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const secretKey = readSecretKey();
    const footballDataToken = Deno.env.get("FOOTBALL_DATA_TOKEN");
    const season = Deno.env.get("FOOTBALL_DATA_SEASON") ?? "2026";

    if (!supabaseUrl || !secretKey) {
      throw new Error("Supabase service configuration is missing.");
    }

    const supabase = createClient(supabaseUrl, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: isAdmin, error: adminError } = await supabase.rpc(
      "worldcup_is_admin",
      {
        p_pin: adminPin,
      },
    );

    if (adminError) {
      throw adminError;
    }

    if (!isAdmin) {
      return json(
        {
          error: "관리자 PIN이 올바르지 않습니다.",
          reason: "invalid_admin_pin",
        },
        403,
      );
    }

    const { data: settings, error: settingsError } = await supabase
      .from("worldcup_settings")
      .select("api_last_sync")
      .eq("id", true)
      .single();

    if (settingsError) {
      throw settingsError;
    }

    if (settings.api_last_sync) {
      const elapsed = Date.now() - new Date(settings.api_last_sync).getTime();
      if (elapsed < MIN_SYNC_INTERVAL_MS) {
        const retryAfterSeconds = Math.ceil(
          (MIN_SYNC_INTERVAL_MS - elapsed) / 1_000,
        );
        return json(
          {
            error: `${retryAfterSeconds}초 후 다시 동기화할 수 있습니다.`,
            reason: "cooldown",
            retryAfterSeconds,
          },
          429,
          { "Retry-After": String(retryAfterSeconds) },
        );
      }
    }

    if (!footballDataToken) {
      throw new Error("FOOTBALL_DATA_TOKEN is not configured.");
    }

    const response = await fetch(
      `https://api.football-data.org/v4/competitions/WC/matches?season=${encodeURIComponent(season)}`,
      { headers: { "X-Auth-Token": footballDataToken } },
    );

    if (!response.ok) {
      const providerMessage = await response.text();
      throw new Error(
        `football-data.org request failed (${response.status}): ${providerMessage.slice(0, 300)}`,
      );
    }

    const payload = (await response.json()) as {
      matches?: FootballDataMatch[];
    };
    if (!Array.isArray(payload.matches)) {
      throw new Error("football-data.org response did not contain matches.");
    }

    const { data: localMatches, error: matchesError } = await supabase
      .from("worldcup_matches")
      .select(
        "id, stage, external_id, team_a, team_b, team_a_crest, team_b_crest, kickoff, synced_pre, result_team, result_regular, result_home, result_away, result_pen_home, result_pen_away, result_duration",
      );

    if (matchesError) {
      throw matchesError;
    }

    const prepared = prepareFootballDataUpdates(
      (localMatches ?? []) as LocalMatch[],
      payload.matches,
    );
    const syncedAt = new Date().toISOString();
    const message = `${prepared.total}경기 확인 · ${prepared.linked}경기 연동 · ${prepared.finished}경기 결과 반영`;

    const { data: updatedCount, error: applyError } = await supabase.rpc(
      "worldcup_apply_football_sync",
      {
        p_matches: prepared.updates,
        p_message: message,
        p_synced_at: syncedAt,
      },
    );

    if (applyError) {
      throw applyError;
    }

    return json({
      ok: true,
      season,
      checked: prepared.total,
      linked: prepared.linked,
      finished: prepared.finished,
      updated: Number(updatedCount ?? 0),
      syncedAt,
      message,
    });
  } catch (error) {
    console.error(error);
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "동기화 중 오류가 발생했습니다.",
      },
      500,
    );
  }
});

async function readAdminPin(request: Request) {
  try {
    const body = (await request.json()) as { adminPin?: unknown };
    const adminPin =
      typeof body.adminPin === "string" ? body.adminPin.trim() : "";
    return /^\d{4}$/.test(adminPin) ? adminPin : null;
  } catch {
    return null;
  }
}

function readSecretKey() {
  const currentKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (currentKeys) {
    try {
      const parsed = JSON.parse(currentKeys) as { default?: unknown };
      if (typeof parsed.default === "string" && parsed.default) {
        return parsed.default;
      }
    } catch {
      // The legacy service-role key below remains a supported fallback.
    }
  }

  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
}

function json(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      ...extraHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
