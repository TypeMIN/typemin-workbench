"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  calculateScore,
  createInitialState,
  firstKickoff,
  formatPick,
  isRoundComplete,
  isRoundLocked,
  isRoundOpen,
  normalizeState,
  parsePick,
  stageLabels,
  stageScores,
  stages,
  type Match,
  type MatchResult,
  type Pick,
  type Stage,
  type WorldCupState,
} from "@/lib/worldcup-prediction/worldcup";

const STORAGE_KEY = "typemin-worldcup-bet-v1";
const SESSION_KEY = "typemin-worldcup-session-v1";

type Session =
  | { role: null }
  | { role: "admin"; pin: string }
  | {
      role: "participant";
      participantIndex: number;
      participantId?: string;
      pin: string;
    };

type RemoteParticipant = {
  id: string;
  slot: number;
  name: string;
  registered: boolean;
};
type RemoteMatch = Match & { result?: MatchResult | null };
type RemoteState = {
  participants?: RemoteParticipant[];
  matches?: RemoteMatch[];
  predictions?: Record<string, Record<string, Pick>>;
  api?: { lastSync?: string; lastMessage?: string };
};

function loadLocalState(): WorldCupState {
  if (typeof window === "undefined") return createInitialState();
  try {
    return normalizeState(
      JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"),
    );
  } catch {
    return createInitialState();
  }
}

function loadSession(): Session {
  if (typeof window === "undefined") return { role: null };
  try {
    const saved = JSON.parse(
      localStorage.getItem(SESSION_KEY) || "null",
    ) as Session | null;
    return saved?.role ? saved : { role: null };
  } catch {
    return { role: null };
  }
}

function mergeRemote(remote: RemoteState): WorldCupState {
  const next = createInitialState();
  remote.participants?.forEach((participant) => {
    const index = participant.slot - 1;
    if (index < 0 || index >= 5) return;
    next.participants[index] = participant.name;
    next.registered[index] = participant.registered;
  });
  remote.matches?.forEach((remoteMatch) => {
    const index = next.matches.findIndex(
      (match) => match.id === remoteMatch.id,
    );
    if (index < 0) return;
    next.matches[index] = { ...next.matches[index], ...remoteMatch };
    if (remoteMatch.result) next.results[remoteMatch.id] = remoteMatch.result;
  });
  Object.entries(remote.predictions || {}).forEach(([slot, predictions]) => {
    next.predictions[Number(slot) - 1] = predictions;
  });
  next.api = {
    lastSync: String(remote.api?.lastSync || ""),
    lastMessage: String(remote.api?.lastMessage || ""),
  };
  return next;
}

function formatKickoff(value: string): string {
  if (!value) return "시작 시각 미정";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "시작 시각 확인 필요";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function pickValue(pick: Pick | undefined): string {
  return pick ? `${pick.team}:${pick.regular}` : "";
}

export default function Home() {
  const [state, setState] = useState<WorldCupState>(createInitialState);
  const [session, setSession] = useState<Session>({ role: null });
  const sessionRef = useRef<Session>({ role: null });
  const [stage, setStage] = useState<Stage>("r32");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState("브라우저에 자동 저장됩니다.");
  const [ready, setReady] = useState(false);
  const [dark, setDark] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const remoteEnabled = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim(),
  );
  const syncEnabled = process.env.NEXT_PUBLIC_WORLDCUP_SYNC_ENABLED === "true";

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setState(loadLocalState());
      const storedSession = loadSession();
      sessionRef.current = storedSession;
      setSession(storedSession);
      setDark(localStorage.getItem("worldcup-theme") === "dark");
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [ready, state]);

  useEffect(() => {
    if (!ready || !remoteEnabled) return;
    const client = createClient();
    let active = true;
    const refresh = async () => {
      const rpc =
        session.role === "admin"
          ? "worldcup_admin_state"
          : "worldcup_public_state";
      const args =
        session.role === "admin"
          ? { p_admin_pin: session.pin }
          : session.role === "participant"
            ? {
                p_participant_id: session.participantId || null,
                p_pin: session.pin,
              }
            : { p_participant_id: null, p_pin: null };
      const { data, error } = await client.rpc(rpc, args);
      if (!active) return;
      if (error) {
        setMessage("원격 데이터 연결에 실패해 브라우저 저장으로 실행합니다.");
        return;
      }
      setState(mergeRemote(data as RemoteState));
      if (!sessionRef.current.role) setMessage("Supabase에 연결했습니다.");
    };
    void refresh();
    const channel = client
      .channel("worldcup-events")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "worldcup_events" },
        refresh,
      )
      .subscribe();
    return () => {
      active = false;
      void client.removeChannel(channel);
    };
  }, [ready, remoteEnabled, session]);

  const activeParticipants = useMemo(
    () =>
      state.participants
        .map((participantName, index) => ({ name: participantName, index }))
        .filter(({ index }) => state.registered[index]),
    [state.participants, state.registered],
  );
  const leaderboard = useMemo(
    () =>
      activeParticipants
        .map((participant) => ({
          ...participant,
          score: calculateScore(state, participant.index),
        }))
        .sort((a, b) => b.score - a.score || a.index - b.index),
    [activeParticipants, state],
  );

  const selectedMatches = state.matches.filter(
    (match) => match.stage === stage,
  );
  const roundOpen = isRoundOpen(state, stage);
  const roundLocked = isRoundLocked(state, stage);

  function saveSession(next: Session) {
    sessionRef.current = next;
    setSession(next);
    if (next.role) localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    else localStorage.removeItem(SESSION_KEY);
  }

  async function login() {
    const cleanName = name.trim();
    if (!cleanName || !/^\d{4}$/.test(pin)) {
      setMessage("이름과 4자리 숫자 PIN을 입력해 주세요.");
      return;
    }

    if (remoteEnabled) {
      const { data, error } = await createClient().rpc("worldcup_join", {
        p_name: cleanName,
        p_pin: pin,
      });
      if (error) {
        setMessage("참가/로그인에 실패했습니다.");
        return;
      }
      const result = data as {
        role?: string;
        slot?: number;
        participantId?: string;
        name?: string;
        reason?: string;
      };
      if (result.role === "admin") {
        saveSession({ role: "admin", pin });
        setMessage("관리자로 로그인했습니다.");
      } else if (result.role === "participant" && result.slot) {
        saveSession({
          role: "participant",
          participantIndex: result.slot - 1,
          participantId: result.participantId,
          pin,
        });
        setMessage(`${result.name || cleanName}님으로 참가했습니다.`);
      } else
        setMessage(
          result.reason === "full"
            ? "참가 인원이 이미 5명입니다."
            : "이름 또는 PIN을 확인해 주세요.",
        );
      return;
    }

    if (
      (cleanName === "관리자" || cleanName.toLowerCase() === "admin") &&
      pin === "0000"
    ) {
      saveSession({ role: "admin", pin });
      setMessage("관리자로 로그인했습니다.");
      return;
    }

    const existing = state.participants.findIndex(
      (participantName, index) =>
        state.registered[index] && participantName === cleanName,
    );
    if (existing >= 0) {
      if (state.pins[existing] !== pin) {
        setMessage("이미 등록된 이름입니다. PIN을 확인해 주세요.");
        return;
      }
      saveSession({ role: "participant", participantIndex: existing, pin });
      setMessage(`${cleanName}님으로 로그인했습니다.`);
      return;
    }
    const empty = state.registered.findIndex((registered) => !registered);
    if (empty < 0) {
      setMessage("참가 인원이 이미 5명입니다.");
      return;
    }
    setState((current) => {
      const next = structuredClone(current);
      next.participants[empty] = cleanName;
      next.pins[empty] = pin;
      next.registered[empty] = true;
      return next;
    });
    saveSession({ role: "participant", participantIndex: empty, pin });
    setMessage(`${cleanName}님으로 참가했습니다.`);
  }

  async function updatePrediction(match: Match, value: string) {
    if (session.role !== "participant" || !roundOpen || roundLocked) return;
    const pick = parsePick(value);
    setState((current) => {
      const next = structuredClone(current);
      const predictions = (next.predictions[session.participantIndex] ||= {});
      if (pick) predictions[match.id] = pick;
      else delete predictions[match.id];
      return next;
    });
    if (remoteEnabled && session.participantId) {
      const { error } = await createClient().rpc("worldcup_save_prediction", {
        p_participant_id: session.participantId,
        p_pin: session.pin,
        p_match_id: match.id,
        p_team: pick?.team || null,
        p_regular: pick?.regular || null,
      });
      setMessage(
        error
          ? "예측을 원격 DB에 저장하지 못했습니다."
          : "예측을 저장했습니다.",
      );
    } else setMessage("예측을 저장했습니다.");
  }

  async function saveAdminSetup(next: WorldCupState) {
    setState(next);
    if (!remoteEnabled || session.role !== "admin") return;
    const { error } = await createClient().rpc("worldcup_admin_save_setup", {
      p_admin_pin: session.pin,
      p_participants: next.participants.map((participantName, index) => ({
        slot: index + 1,
        name: participantName,
        registered: next.registered[index],
      })),
      p_matches: next.matches.map((match) => ({
        id: match.id,
        teamA: match.teamA,
        teamB: match.teamB,
        kickoff: match.kickoff,
        externalId: match.externalId,
      })),
    });
    setMessage(
      error
        ? "관리자 설정을 원격 DB에 저장하지 못했습니다."
        : "관리자 설정을 저장했습니다.",
    );
  }

  async function saveResult(match: Match, value: string) {
    if (session.role !== "admin") return;
    const pick = parsePick(value);
    const next = structuredClone(state);
    if (pick) next.results[match.id] = pick;
    else delete next.results[match.id];
    setState(next);
    if (remoteEnabled) {
      const { error } = await createClient().rpc("worldcup_admin_set_result", {
        p_admin_pin: session.pin,
        p_match_id: match.id,
        p_team: pick?.team || null,
        p_regular: pick?.regular || null,
      });
      setMessage(
        error
          ? "경기 결과를 원격 DB에 저장하지 못했습니다."
          : "경기 결과를 저장했습니다.",
      );
    }
  }

  async function syncFootballData() {
    if (!remoteEnabled || !syncEnabled || syncing) return;
    setSyncing(true);
    setMessage("football-data.org 경기 정보를 확인하는 중입니다.");
    try {
      const client = createClient();
      const { data, error } =
        await client.functions.invoke("sync-football-data");
      if (error) throw error;
      const rpc =
        session.role === "admin"
          ? "worldcup_admin_state"
          : "worldcup_public_state";
      const args =
        session.role === "admin"
          ? { p_admin_pin: session.pin }
          : session.role === "participant"
            ? {
                p_participant_id: session.participantId || null,
                p_pin: session.pin,
              }
            : { p_participant_id: null, p_pin: null };
      const refreshed = await client.rpc(rpc, args);
      if (refreshed.error) throw refreshed.error;
      setState(mergeRemote(refreshed.data as RemoteState));
      setMessage(
        String(
          (data as { message?: string } | null)?.message ||
            "경기 정보를 동기화했습니다.",
        ),
      );
    } catch {
      setMessage("경기 정보 API 동기화에 실패했습니다.");
    } finally {
      setSyncing(false);
    }
  }

  function roundStatus(item: Stage) {
    if (!isRoundOpen(state, item)) return "대기";
    if (isRoundComplete(state, item)) return "종료";
    return isRoundLocked(state, item) ? "잠김" : "입력 가능";
  }

  if (!ready) return <main className="loading">예측 보드를 불러오는 중…</main>;

  return (
    <main className={dark ? "bet-app dark" : "bet-app"}>
      <button
        className="theme-toggle"
        type="button"
        aria-label="라이트/다크 전환"
        onClick={() => {
          setDark((current) => {
            localStorage.setItem("worldcup-theme", current ? "light" : "dark");
            return !current;
          });
        }}
      >
        {dark ? "☀" : "☾"}
      </button>

      <header className="hero shell">
        <h1>월드컵 예측 내기</h1>
      </header>

      <div className="app-stack shell">
        <section className="panel login-tool">
          <div className="block-heading">
            <h2>로그인</h2>
            <span>이름 + 4자리 PIN</span>
          </div>
          {session.role ? (
            <div className="login-bar">
              <span>
                <em>현재</em>{" "}
                <strong>
                  {session.role === "admin"
                    ? "관리자"
                    : state.participants[session.participantIndex]}
                </strong>
              </span>
              <button
                className="button ghost"
                type="button"
                onClick={() => saveSession({ role: null })}
              >
                로그아웃
              </button>
            </div>
          ) : (
            <>
              <div className="login-form">
                <input
                  aria-label="이름"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="이름"
                />
                <input
                  aria-label="PIN"
                  value={pin}
                  onChange={(event) =>
                    setPin(event.target.value.replace(/\D/g, "").slice(0, 4))
                  }
                  placeholder="PIN 4자리"
                  inputMode="numeric"
                  type="password"
                />
                <button
                  className="button primary"
                  type="button"
                  onClick={() => void login()}
                >
                  참가 / 로그인
                </button>
              </div>
              <p className="hint">처음 입력한 이름·PIN이 내 계정이 됩니다.</p>
            </>
          )}
          <p className="save-note" role="status">
            {message}
          </p>
        </section>

        <section className="panel scoreboard" aria-label="점수판">
          <SectionHeading eyebrow="Leaderboard" title="점수판">
            끝난 경기만 점수에 반영됩니다. 꼴찌는 최저점 전체가 표시됩니다.
          </SectionHeading>
          <div className="score-graph">
            {leaderboard.length ? (
              leaderboard.map((row, index) => {
                const max = Math.max(
                  1,
                  ...leaderboard.map((item) => item.score),
                );
                const min = Math.min(...leaderboard.map((item) => item.score));
                const isLast =
                  leaderboard.length > 1 &&
                  row.score === min &&
                  Object.keys(state.results).length > 0;
                return (
                  <div
                    className={["rank-row", isLast && "last"]
                      .filter(Boolean)
                      .join(" ")}
                    key={row.index}
                  >
                    <span className="rank">{index + 1}</span>
                    <span className="rank-name">{row.name}</span>
                    <span className="graph-track">
                      <i
                        style={{
                          width: `${Math.max(4, Math.round((row.score / max) * 100))}%`,
                        }}
                      />
                    </span>
                    <strong>{row.score}</strong>
                  </div>
                );
              })
            ) : (
              <p className="empty">
                아직 참가자가 없습니다. 이름과 4자리 PIN으로 참가해 주세요.
              </p>
            )}
          </div>
        </section>

        <section className="panel prediction-board" aria-label="예측">
          <SectionHeading eyebrow="Predictions" title="예측">
            경기 시작 전까지 본인 예측만 수정할 수 있고, 다른 사람의 선택은 경기
            종료 후 공개됩니다.
          </SectionHeading>
          <div className="round-tabs" role="tablist">
            {stages.map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={stage === item}
                className={`round-tab ${stage === item ? "active" : ""}`}
                onClick={() => setStage(item)}
              >
                <strong>{stageLabels[item]}</strong>
                <span>{roundStatus(item)}</span>
              </button>
            ))}
          </div>
          <p className="round-meta">
            정규 {stageScores[stage].regular} · 최종 {stageScores[stage].final}
            {firstKickoff(state, stage)
              ? ` · 마감 ${formatKickoff(new Date(firstKickoff(state, stage)!).toISOString())}`
              : ""}
          </p>
          <div className="round-grid">
            {selectedMatches.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                state={state}
                session={session}
                roundOpen={roundOpen}
                roundLocked={roundLocked}
                participants={activeParticipants}
                onPrediction={updatePrediction}
              />
            ))}
          </div>
        </section>

        {session.role === "admin" && (
          <AdminPanels
            state={state}
            onSetup={saveAdminSetup}
            onResult={saveResult}
            onSync={syncFootballData}
            remoteEnabled={remoteEnabled}
            syncEnabled={syncEnabled}
            syncing={syncing}
          />
        )}
        <p className="credit">
          월드컵 32강부터 결승까지의 결과 예측 보드 ·{" "}
          {remoteEnabled ? "Supabase 연결 모드" : "브라우저 로컬 모드"}
        </p>
      </div>
    </main>
  );
}

function SectionHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="section-head">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      <p>{children}</p>
    </div>
  );
}

function MatchCard({
  match,
  state,
  session,
  roundOpen,
  roundLocked,
  participants,
  onPrediction,
}: {
  match: Match;
  state: WorldCupState;
  session: Session;
  roundOpen: boolean;
  roundLocked: boolean;
  participants: { name: string; index: number }[];
  onPrediction: (match: Match, value: string) => Promise<void>;
}) {
  const result = state.results[match.id];
  const finished = Boolean(result);
  const status = finished
    ? "종료"
    : !roundOpen
      ? "대기"
      : roundLocked
        ? "잠김"
        : "입력 가능";
  const ownIndex =
    session.role === "participant" ? session.participantIndex : null;
  const ownPick =
    ownIndex === null ? undefined : state.predictions[ownIndex]?.[match.id];
  const submitted = participants.filter(
    ({ index }) => state.predictions[index]?.[match.id],
  ).length;
  return (
    <article
      className={["match-card", finished && "is-finished"]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="match-card__top">
        <div>
          <strong>{match.label}</strong>
          <small>{formatKickoff(match.kickoff)}</small>
        </div>
        <span
          className={`match-status ${status === "입력 가능" ? "is-open" : finished ? "is-done" : "is-locked"}`}
        >
          {status}
        </span>
      </div>
      <div className="vs-block">
        <Team
          name={match.teamA}
          crest={match.crestA}
          winner={result?.team === "A"}
        />
        {result ? (
          <span className="vs-center">
            <em
              className={`vs-status ${result.duration === "REGULAR" || !result.duration ? "" : "is-et"}`}
            >
              {result.duration === "PENALTY_SHOOTOUT"
                ? "PSO"
                : result.duration === "EXTRA_TIME"
                  ? "AET"
                  : "FT"}
            </em>
            <span className="vs-score">
              {result.home ?? (result.team === "A" ? 1 : 0)} :{" "}
              {result.away ?? (result.team === "B" ? 1 : 0)}
            </span>
            {result.penHome != null && result.penAway != null && (
              <span className="vs-pens">
                ({result.penHome} : {result.penAway})
              </span>
            )}
          </span>
        ) : (
          <span className="vs-mark">VS</span>
        )}
        <Team
          name={match.teamB}
          crest={match.crestB}
          winner={result?.team === "B"}
        />
      </div>
      <div className="prediction-area">
        <div className="prediction-self">
          <span className="area-label">내 예측</span>
          {ownIndex === null ? (
            <span className="pick-status">로그인 후 입력</span>
          ) : roundOpen && !roundLocked ? (
            <PickSelect
              ariaLabel={match.label}
              match={match}
              value={pickValue(ownPick)}
              onChange={(value) => void onPrediction(match, value)}
            />
          ) : (
            <strong className="pick-text">{formatPick(ownPick, match)}</strong>
          )}
        </div>
        {!finished && participants.length > 0 && (
          <div className="submission">
            <span className="area-label">제출</span>
            <span className="dots">
              {participants.map(({ index, name }) => (
                <i
                  key={index}
                  title={name}
                  className={state.predictions[index]?.[match.id] ? "on" : ""}
                />
              ))}
            </span>
            <span>
              {submitted}/{participants.length}
            </span>
          </div>
        )}
        {finished &&
          participants.filter(({ index }) => index !== ownIndex).length > 0 && (
            <div className="other-picks">
              <span className="area-label">다른 사람</span>
              <ul>
                {participants
                  .filter(({ index }) => index !== ownIndex)
                  .map(({ name, index }) => (
                    <li key={index}>
                      <span>{name}</span>
                      <span className="pick-text">
                        {formatPick(
                          state.predictions[index]?.[match.id],
                          match,
                        )}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          )}
      </div>
    </article>
  );
}

function Team({
  name,
  crest,
  winner,
}: {
  name: string;
  crest: string;
  winner: boolean;
}) {
  return (
    <div
      className={["team-side", winner && "is-winner"].filter(Boolean).join(" ")}
    >
      <span className="team-badge">
        {crest ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={crest} alt={name} loading="lazy" />
        ) : (
          name.replace(/\s/g, "").slice(0, 2)
        )}
      </span>
      <strong>{name}</strong>
    </div>
  );
}

function PickSelect({
  match,
  value,
  onChange,
  ariaLabel,
}: {
  match: Match;
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">선택</option>
      <option value="A:win">{match.teamA}(승)</option>
      <option value="A:draw">{match.teamA}(무)</option>
      <option value="B:draw">{match.teamB}(무)</option>
      <option value="B:win">{match.teamB}(승)</option>
    </select>
  );
}

function AdminPanels({
  state,
  onSetup,
  onResult,
  onSync,
  remoteEnabled,
  syncEnabled,
  syncing,
}: {
  state: WorldCupState;
  onSetup: (state: WorldCupState) => Promise<void>;
  onResult: (match: Match, value: string) => Promise<void>;
  onSync: () => Promise<void>;
  remoteEnabled: boolean;
  syncEnabled: boolean;
  syncing: boolean;
}) {
  return (
    <div className="admin-panels">
      <section className="panel">
        <div className="block-heading">
          <h2>참가자 관리</h2>
          <span>관리자</span>
        </div>
        <div className="participant-list">
          {state.participants.map((name, index) => (
            <div key={index}>
              <span>{index + 1}</span>
              <strong>{state.registered[index] ? name : "빈 자리"}</strong>
              {state.registered[index] ? (
                <button
                  type="button"
                  className="button danger"
                  onClick={() => {
                    const next = structuredClone(state);
                    next.registered[index] = false;
                    next.participants[index] = `빈 자리 ${index + 1}`;
                    next.pins[index] = "";
                    delete next.predictions[index];
                    void onSetup(next);
                  }}
                >
                  삭제
                </button>
              ) : (
                <em>대기</em>
              )}
            </div>
          ))}
        </div>
      </section>
      <section className="panel admin-wide">
        <div className="block-heading">
          <h2>경기 설정</h2>
          <span>팀명과 시작 시각</span>
        </div>
        <div className="match-settings">
          {state.matches.map((match, index) => (
            <div className="match-setting" key={match.id}>
              <strong>{match.label}</strong>
              <input
                aria-label={`${match.label} A팀`}
                value={match.teamA}
                onChange={(event) => {
                  const next = structuredClone(state);
                  const target = next.matches[index];
                  if (!target) return;
                  target.teamA = event.target.value;
                  void onSetup(next);
                }}
              />
              <input
                aria-label={`${match.label} B팀`}
                value={match.teamB}
                onChange={(event) => {
                  const next = structuredClone(state);
                  const target = next.matches[index];
                  if (!target) return;
                  target.teamB = event.target.value;
                  void onSetup(next);
                }}
              />
              <input
                aria-label={`${match.label} 시작 시각`}
                type="datetime-local"
                value={match.kickoff}
                onChange={(event) => {
                  const next = structuredClone(state);
                  const target = next.matches[index];
                  if (!target) return;
                  target.kickoff = event.target.value;
                  void onSetup(next);
                }}
              />
            </div>
          ))}
        </div>
      </section>
      <section className="panel admin-wide">
        <div className="block-heading">
          <h2>결과 입력</h2>
          <span>관리자</span>
        </div>
        <div className="result-list">
          {state.matches.map((match) => (
            <label key={match.id}>
              <span>
                <strong>{match.label}</strong>
                <small>
                  {match.teamA} vs {match.teamB}
                </small>
              </span>
              <PickSelect
                ariaLabel={`${match.label} 결과`}
                match={match}
                value={pickValue(state.results[match.id])}
                onChange={(value) => void onResult(match, value)}
              />
            </label>
          ))}
        </div>
      </section>
      <section className="panel">
        <div className="block-heading">
          <h2>경기 API</h2>
          <span>football-data.org</span>
        </div>
        <button
          className="button primary"
          type="button"
          disabled={!remoteEnabled || !syncEnabled || syncing}
          onClick={() => void onSync()}
        >
          {syncing ? "동기화 중…" : "경기 정보 동기화"}
        </button>
        <p className="save-note">
          {!syncEnabled
            ? "자동 동기화가 비활성화되어 있습니다. API 토큰 설정 후 활성화할 수 있습니다."
            : state.api.lastSync
              ? `마지막 동기화: ${state.api.lastSync}`
              : "아직 동기화 기록이 없습니다."}
          {syncEnabled && state.api.lastMessage
            ? ` · ${state.api.lastMessage}`
            : ""}
        </p>
      </section>
    </div>
  );
}
