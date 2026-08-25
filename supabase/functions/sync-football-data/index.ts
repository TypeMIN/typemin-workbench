import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type LocalMatch = {
  id: string;
  stage: "r32" | "r16" | "qf" | "sf" | "third" | "final";
  team_a: string;
  team_b: string;
  external_id: string | null;
  synced_pre: boolean;
  result_team: "A" | "B" | null;
  kickoff: string | null;
};

type FootballDataMatch = {
  id: number;
  stage?: string;
  utcDate: string;
  status: string;
  homeTeam: {
    name?: string;
    shortName?: string;
    tla?: string;
    crest?: string;
  };
  awayTeam: {
    name?: string;
    shortName?: string;
    tla?: string;
    crest?: string;
  };
  score: {
    winner?: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;
    duration?: string;
    regularTime?: { home?: number | null; away?: number | null };
    extraTime?: { home?: number | null; away?: number | null };
    penalties?: { home?: number | null; away?: number | null };
    fullTime?: { home?: number | null; away?: number | null };
  };
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
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
    const token = Deno.env.get("FOOTBALL_DATA_TOKEN");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!token || !supabaseUrl || !serviceRoleKey) {
      return json(
        { message: "Missing Supabase or football-data.org secret." },
        500,
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: settings, error: settingsError } = await supabase
      .from("worldcup_settings")
      .select("api_last_sync, api_last_message")
      .eq("id", true)
      .single();

    if (settingsError) throw settingsError;

    if (settings?.api_last_sync) {
      const lastSync = new Date(settings.api_last_sync).getTime();
      if (Date.now() - lastSync < 90_000) {
        return json({
          message: settings.api_last_message || "최근 동기화됨",
          skipped: true,
        });
      }
    }

    const season = Deno.env.get("FOOTBALL_DATA_SEASON") || "2026";
    const response = await fetch(
      `https://api.football-data.org/v4/competitions/WC/matches?season=${season}`,
      { headers: { "X-Auth-Token": token } },
    );

    if (!response.ok) {
      const detail = await response.text();
      return json(
        {
          message: `football-data.org error ${response.status}: ${detail}`,
        },
        502,
      );
    }

    const remote = await response.json();
    const remoteMatches = (remote.matches || []) as FootballDataMatch[];
    const { data: localMatches, error: matchError } = await supabase
      .from("worldcup_matches")
      .select(
        "id, stage, team_a, team_b, external_id, synced_pre, result_team, kickoff",
      )
      .order("id");

    if (matchError) throw matchError;

    let updated = 0;
    for (const local of (localMatches || []) as LocalMatch[]) {
      const remoteMatch = findRemoteMatch(local, remoteMatches);
      if (!remoteMatch) continue;

      const patch = buildPatch(local, remoteMatch);
      if (!patch) continue;

      const { error } = await supabase
        .from("worldcup_matches")
        .update(patch)
        .eq("id", local.id);

      if (error) throw error;
      updated += 1;
    }

    const { error: settingsUpdateError } = await supabase
      .from("worldcup_settings")
      .update({
        api_last_sync: new Date().toISOString(),
        api_last_message: `${updated}개 경기 반영`,
      })
      .eq("id", true);

    if (settingsUpdateError) throw settingsUpdateError;

    if (updated > 0) {
      const { error: touchError } = await supabase.rpc("worldcup_touch");
      if (touchError) throw touchError;
    }

    return json({ message: `${updated}개 경기 반영` });
  } catch (error) {
    console.error(error);
    return json(
      { message: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});

function findRemoteMatch(
  local: LocalMatch,
  remoteMatches: FootballDataMatch[],
) {
  if (local.external_id) {
    return remoteMatches.find(
      (match) => String(match.id) === String(local.external_id),
    );
  }

  const localA = normalizeTeam(local.team_a);
  const localB = normalizeTeam(local.team_b);
  const teamMatch = remoteMatches.find((match) => {
    const home = [
      match.homeTeam.name,
      match.homeTeam.shortName,
      match.homeTeam.tla,
    ].map(normalizeTeam);
    const away = [
      match.awayTeam.name,
      match.awayTeam.shortName,
      match.awayTeam.tla,
    ].map(normalizeTeam);
    return includesTeam(home, localA) && includesTeam(away, localB);
  });
  if (teamMatch) return teamMatch;

  const candidates = remoteMatches
    .filter((match) => normalizeStage(match.stage) === local.stage)
    .sort(
      (first, second) =>
        new Date(first.utcDate).getTime() - new Date(second.utcDate).getTime(),
    );

  return candidates[localStageIndex(local.id)];
}

function buildPatch(local: LocalMatch, match: FootballDataMatch) {
  const patch: Record<string, unknown> = {};
  const homeName = displayTeam(match.homeTeam);
  const awayName = displayTeam(match.awayTeam);
  const hasRealTeams = isRealTeamName(homeName) && isRealTeamName(awayName);

  if (!local.synced_pre && hasRealTeams) {
    patch.external_id = String(match.id);
    patch.team_a = homeName;
    patch.team_b = awayName;
    patch.team_a_crest = match.homeTeam.crest ?? null;
    patch.team_b_crest = match.awayTeam.crest ?? null;
    patch.kickoff = match.utcDate;
    patch.synced_pre = true;
  }

  if (local.result_team == null && match.status === "FINISHED") {
    Object.assign(patch, buildResultPatch(match));
  }

  if (Object.keys(patch).length === 0) return null;
  patch.updated_at = new Date().toISOString();
  return patch;
}

function buildResultPatch(match: FootballDataMatch) {
  const winner =
    match.score.winner === "HOME_TEAM"
      ? "A"
      : match.score.winner === "AWAY_TEAM"
        ? "B"
        : null;
  const duration = match.score.duration;
  const fullTime = match.score.fullTime || {};
  const regularTime = match.score.regularTime;
  const extraTime = match.score.extraTime || {};
  let home: number | null;
  let away: number | null;

  if (regularTime && regularTime.home != null) {
    home = (regularTime.home ?? 0) + (extraTime.home ?? 0);
    away = (regularTime.away ?? 0) + (extraTime.away ?? 0);
  } else {
    home = fullTime.home ?? null;
    away = fullTime.away ?? null;
  }

  const penalties =
    duration === "PENALTY_SHOOTOUT" ? match.score.penalties || {} : null;
  const resultRegular: "win" | "draw" =
    duration === "EXTRA_TIME" || duration === "PENALTY_SHOOTOUT"
      ? "draw"
      : Number(fullTime.home ?? 0) === Number(fullTime.away ?? 0)
        ? "draw"
        : "win";
  let team = winner;

  if (!team) {
    const homeScore = Number(fullTime.home ?? 0);
    const awayScore = Number(fullTime.away ?? 0);
    team = homeScore > awayScore ? "A" : awayScore > homeScore ? "B" : null;
  }

  return {
    result_team: team,
    result_regular: team ? resultRegular : null,
    result_home: home,
    result_away: away,
    result_pen_home: penalties ? (penalties.home ?? null) : null,
    result_pen_away: penalties ? (penalties.away ?? null) : null,
    result_duration: match.score.duration ?? null,
    updated_at: new Date().toISOString(),
  };
}

function displayTeam(team: FootballDataMatch["homeTeam"]) {
  return team.shortName || team.name || "";
}

function isRealTeamName(value: string) {
  const clean = value.trim();
  return clean !== "" && !/^team [ab]$/i.test(clean);
}

function normalizeTeam(value?: string | null) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "");
}

function includesTeam(candidates: string[], target: string) {
  return candidates.some(
    (candidate) =>
      candidate &&
      target &&
      (candidate.includes(target) || target.includes(candidate)),
  );
}

function normalizeStage(stage?: string | null): LocalMatch["stage"] | null {
  const clean = String(stage || "").toUpperCase();
  if (clean.includes("LAST_32") || clean.includes("ROUND_OF_32")) return "r32";
  if (clean.includes("LAST_16") || clean.includes("ROUND_OF_16")) return "r16";
  if (clean.includes("QUARTER")) return "qf";
  if (clean.includes("SEMI")) return "sf";
  if (clean.includes("THIRD")) return "third";
  if (clean.includes("FINAL")) return "final";
  return null;
}

function localStageIndex(id: string) {
  const match = id.match(/(\d+)$/);
  return match ? Math.max(0, Number(match[1]) - 1) : 0;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
