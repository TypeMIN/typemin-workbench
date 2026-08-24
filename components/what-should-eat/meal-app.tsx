"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Clock3,
  Fish,
  Flame,
  Footprints,
  History,
  LoaderCircle,
  LocateFixed,
  LogOut,
  MapPin,
  Pizza,
  Salad,
  Sandwich,
  Search,
  Soup,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  UserMinus,
  UserPlus,
  Users,
  Utensils,
  X,
  type LucideIcon,
} from "lucide-react";

import { shuffle } from "@/lib/what-should-eat/candidates";
import { getCategoryParts } from "@/lib/what-should-eat/category";
import {
  chooseDuel,
  startDuel,
  type DuelState,
} from "@/lib/what-should-eat/duel";
import type {
  AppUser,
  DecisionHistory,
  DuelComparison,
  Gender,
  ParticipantSummary,
  PlaceCandidate,
  PlaceFeedback,
  PreferenceResponse,
  RegionResult,
} from "@/lib/what-should-eat/types";

type AuthMode = "login" | "signup";
type IdCheckStatus = "idle" | "checking" | "available" | "taken";
type AppView = "decide" | "history";
type DecisionStep = "participants" | "location" | "duel" | "result";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  한식: Soup,
  일식: Fish,
  중식: Flame,
  양식: Pizza,
  분식: Sandwich,
  아시아음식: Salad,
};

function CategoryBadge({ category }: { category: string }) {
  const { major } = getCategoryParts(category);
  const Icon = CATEGORY_ICONS[major] ?? Utensils;
  return (
    <span className="category-badge">
      <Icon size={21} aria-hidden />
    </span>
  );
}

function walkingMinutes(distanceMeters: number) {
  return Math.max(1, Math.round(distanceMeters / 70));
}

async function requestApi<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: options?.body
      ? { "Content-Type": "application/json", ...options.headers }
      : options?.headers,
  });
  const data = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok)
    throw new Error(data.error || "요청을 처리하지 못했습니다.");
  return data;
}

function LoadingScreen() {
  return (
    <main className="center-screen">
      <span className="brand-mark">
        <Utensils size={28} />
      </span>
      <LoaderCircle className="spin" aria-label="로그인 상태 확인 중" />
    </main>
  );
}

function AuthScreen({
  onAuthenticated,
}: {
  onAuthenticated: (user: AppUser) => void;
}) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [loginId, setLoginId] = useState("");
  const [checkedLoginId, setCheckedLoginId] = useState("");
  const [idCheckStatus, setIdCheckStatus] = useState<IdCheckStatus>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const currentYear = new Date().getFullYear();
  const birthYears = Array.from(
    { length: currentYear - 1899 },
    (_, index) => currentYear - index,
  );

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError("");
    setCheckedLoginId("");
    setIdCheckStatus("idle");
  }

  async function checkLoginId() {
    const normalizedId = loginId.trim().toLowerCase();
    setError("");
    setCheckedLoginId("");

    if (!/^[a-z0-9]{3,20}$/.test(normalizedId)) {
      setIdCheckStatus("idle");
      setError("ID는 영문 소문자와 숫자로 3~20자여야 합니다.");
      return;
    }

    setIdCheckStatus("checking");
    try {
      const { available } = await requestApi<{ available: boolean }>(
        `/what-should-eat/api/auth/check-id?loginId=${encodeURIComponent(normalizedId)}`,
      );
      setCheckedLoginId(normalizedId);
      setIdCheckStatus(available ? "available" : "taken");
    } catch (caught) {
      setIdCheckStatus("idle");
      setError(
        caught instanceof Error
          ? caught.message
          : "ID 중복 여부를 확인하지 못했습니다.",
      );
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const normalizedId = String(form.get("loginId") ?? "")
      .trim()
      .toLowerCase();

    if (
      mode === "signup" &&
      (idCheckStatus !== "available" || checkedLoginId !== normalizedId)
    ) {
      setError("ID 중복확인을 먼저 완료해 주세요.");
      return;
    }

    setBusy(true);
    const body =
      mode === "login"
        ? { loginId: form.get("loginId"), pin: form.get("pin") }
        : {
            loginId: form.get("loginId"),
            pin: form.get("pin"),
            displayName: form.get("displayName"),
            birthYear: Number(form.get("birthYear")),
            gender: form.get("gender") as Gender,
          };

    try {
      const { user } = await requestApi<{ user: AppUser }>(
        `/what-should-eat/api/auth/${mode}`,
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      );
      onAuthenticated(user);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "인증에 실패했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-intro">
        <div className="brand-lockup">
          <span className="brand-mark">
            <Utensils size={24} />
          </span>
          <h1>오늘 뭐 먹지?</h1>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div
            className="auth-tabs"
            role="tablist"
            aria-label="로그인 또는 가입"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              onClick={() => changeMode("login")}
            >
              로그인
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "signup"}
              onClick={() => changeMode("signup")}
            >
              처음이에요
            </button>
          </div>
          <form onSubmit={submit} className="form-stack">
            <div className="field-group">
              <label htmlFor="auth-login-id">ID</label>
              <div className={mode === "signup" ? "input-action" : undefined}>
                <input
                  id="auth-login-id"
                  name="loginId"
                  value={loginId}
                  onChange={(event) => {
                    setLoginId(event.target.value.toLowerCase());
                    setCheckedLoginId("");
                    setIdCheckStatus("idle");
                  }}
                  autoComplete="username"
                  placeholder="영문 소문자와 숫자"
                  pattern="[a-z0-9]{3,20}"
                  minLength={3}
                  maxLength={20}
                  required
                />
                {mode === "signup" && (
                  <button
                    type="button"
                    onClick={checkLoginId}
                    disabled={idCheckStatus === "checking"}
                  >
                    {idCheckStatus === "checking" ? (
                      <LoaderCircle className="spin" size={17} />
                    ) : (
                      "중복확인"
                    )}
                  </button>
                )}
              </div>
              {mode === "signup" &&
                checkedLoginId === loginId.trim().toLowerCase() &&
                idCheckStatus === "available" && (
                  <p className="field-message success" role="status">
                    사용할 수 있는 ID입니다.
                  </p>
                )}
              {mode === "signup" &&
                checkedLoginId === loginId.trim().toLowerCase() &&
                idCheckStatus === "taken" && (
                  <p className="field-message error" role="alert">
                    이미 사용 중인 ID입니다.
                  </p>
                )}
            </div>
            <label>
              <span>PIN</span>
              <input
                name="pin"
                type="password"
                inputMode="numeric"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                placeholder="숫자 4~6자리"
                pattern="[0-9]{4,6}"
                minLength={4}
                maxLength={6}
                required
              />
            </label>
            {mode === "signup" && (
              <>
                <label>
                  <span>표시 이름</span>
                  <input
                    name="displayName"
                    autoComplete="name"
                    placeholder="친구들에게 보일 이름"
                    maxLength={30}
                    required
                  />
                </label>
                <div className="form-row">
                  <label>
                    <span>출생연도</span>
                    <select name="birthYear" defaultValue="" required>
                      <option value="" disabled>
                        연도 선택
                      </option>
                      {birthYears.map((year) => (
                        <option key={year} value={year}>
                          {year}년
                        </option>
                      ))}
                    </select>
                  </label>
                  <fieldset className="gender-field">
                    <legend>성별</legend>
                    <div className="gender-toggle">
                      <label>
                        <input
                          type="radio"
                          name="gender"
                          value="male"
                          required
                        />
                        <span>남성</span>
                      </label>
                      <label>
                        <input
                          type="radio"
                          name="gender"
                          value="female"
                          required
                        />
                        <span>여성</span>
                      </label>
                    </div>
                  </fieldset>
                </div>
              </>
            )}
            {error && (
              <p className="message error" role="alert">
                {error}
              </p>
            )}
            <button className="primary-button" disabled={busy}>
              {busy && <LoaderCircle className="spin" size={18} />}
              {mode === "login" ? "로그인" : "가입하고 시작하기"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

function AppHeader({
  user,
  view,
  onView,
  onLogout,
}: {
  user: AppUser;
  view: AppView;
  onView: (view: AppView) => void;
  onLogout: () => void;
}) {
  return (
    <header className="app-header">
      <div className="header-inner">
        <button
          className="brand-lockup brand-button"
          onClick={() => onView("decide")}
        >
          <span className="brand-mark">
            <Utensils size={21} />
          </span>
          <span>오늘 뭐 먹지?</span>
        </button>
        <nav aria-label="주 메뉴">
          <button
            className={view === "decide" ? "active" : ""}
            onClick={() => onView("decide")}
          >
            <Sparkles size={17} /> 오늘 정하기
          </button>
          <button
            className={view === "history" ? "active" : ""}
            onClick={() => onView("history")}
          >
            <History size={17} /> 지난 선택
          </button>
        </nav>
        <div className="user-menu">
          <span className="avatar">{user.displayName.slice(0, 1)}</span>
          <span className="user-name">
            <strong>{user.displayName}</strong>
            <small>@{user.loginId}</small>
          </span>
          <button
            className="icon-button"
            onClick={onLogout}
            aria-label="로그아웃"
            title="로그아웃"
          >
            <LogOut size={19} />
          </button>
        </div>
      </div>
    </header>
  );
}

function Progress({ step }: { step: DecisionStep }) {
  const activeIndex = { participants: 0, location: 1, duel: 2, result: 3 }[
    step
  ];
  return (
    <ol className="progress" aria-label="결정 진행 단계">
      {["멤버", "위치", "선택"].map((label, index) => (
        <li key={label} className={index <= activeIndex ? "active" : ""}>
          <span>{index < activeIndex ? <Check size={15} /> : index + 1}</span>
          {label}
        </li>
      ))}
    </ol>
  );
}

function ParticipantNames({
  participants,
}: {
  participants: ParticipantSummary[];
}) {
  return (
    <span className="participant-names">
      {participants.map((participant) => (
        <span key={participant.id}>
          {participant.displayName}
          <small>@{participant.loginId}</small>
        </span>
      ))}
    </span>
  );
}

function ParticipantBar({
  participants,
}: {
  participants: ParticipantSummary[];
}) {
  return (
    <div className="participant-bar">
      <Users size={15} aria-hidden />
      <span className="sr-only">오늘 함께 먹는 사람</span>
      <div>
        {participants.map((participant) => (
          <span key={participant.id}>{participant.displayName}</span>
        ))}
      </div>
    </div>
  );
}

function ParticipantsStep({
  currentUser,
  participants,
  setParticipants,
  onNext,
}: {
  currentUser: AppUser;
  participants: ParticipantSummary[];
  setParticipants: (users: ParticipantSummary[]) => void;
  onNext: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ParticipantSummary[]>([]);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function searchUsers(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    setError("");
    try {
      const data = await requestApi<{ users: ParticipantSummary[] }>(
        `/what-should-eat/api/users/search?q=${encodeURIComponent(query)}`,
      );
      setResults(data.users);
      setSearched(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "사용자를 검색하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  function addUser(user: ParticipantSummary) {
    if (!participants.some((participant) => participant.id === user.id))
      setParticipants([...participants, user]);
  }

  return (
    <section className="workflow-card">
      <div className="section-heading">
        <span className="section-icon">
          <Users size={23} />
        </span>
        <div>
          <p className="eyebrow">STEP 1</p>
          <h1>오늘 누구와 함께하나요?</h1>
          <p>가입한 친구의 ID 또는 표시 이름을 찾아 멤버로 추가해 주세요.</p>
        </div>
      </div>
      <div className="member-list" aria-label="오늘의 참가자">
        {participants.map((participant) => (
          <div className="member-chip" key={participant.id}>
            <span className="avatar small">
              {participant.displayName.slice(0, 1)}
            </span>
            <span>
              <strong>{participant.displayName}</strong>
              <small>@{participant.loginId}</small>
            </span>
            {participant.id === currentUser.id ? (
              <em>나</em>
            ) : (
              <button
                aria-label={`${participant.displayName} 제외`}
                onClick={() =>
                  setParticipants(
                    participants.filter((item) => item.id !== participant.id),
                  )
                }
              >
                <X size={16} />
              </button>
            )}
          </div>
        ))}
      </div>
      <form className="search-box" onSubmit={searchUsers}>
        <Search size={19} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="친구 ID 또는 표시 이름"
          aria-label="친구 ID 또는 표시 이름"
        />
        <button disabled={busy}>
          {busy ? <LoaderCircle className="spin" size={18} /> : "검색"}
        </button>
      </form>
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
      {searched && (
        <div className="search-results" aria-live="polite">
          {results.length === 0 ? (
            <p className="empty-inline">일치하는 가입자가 없어요.</p>
          ) : (
            results.map((result) => {
              const added = participants.some(
                (participant) => participant.id === result.id,
              );
              return (
                <div className="search-result" key={result.id}>
                  <span className="avatar small">
                    {result.displayName.slice(0, 1)}
                  </span>
                  <span>
                    <strong>{result.displayName}</strong>
                    <small>@{result.loginId}</small>
                  </span>
                  <button
                    type="button"
                    disabled={added}
                    onClick={() => addUser(result)}
                  >
                    {added ? (
                      <>
                        <Check size={16} /> 추가됨
                      </>
                    ) : (
                      <>
                        <UserPlus size={16} /> 추가
                      </>
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
      <div className="card-footer">
        <p>
          <strong>{participants.length}명</strong>이 함께 골라요
        </p>
        <button className="primary-button fit" onClick={onNext}>
          위치 정하기 <ChevronRight size={18} />
        </button>
      </div>
    </section>
  );
}

function LocationStep({
  onBack,
  onSelect,
  busy,
  error,
}: {
  onBack: () => void;
  onSelect: (latitude: number, longitude: number, label: string) => void;
  busy: boolean;
  error: string;
}) {
  const [query, setQuery] = useState("");
  const [regions, setRegions] = useState<RegionResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [searched, setSearched] = useState(false);

  function useCurrentLocation() {
    setLocationError("");
    if (!navigator.geolocation)
      return setLocationError(
        "이 브라우저에서는 현재 위치를 사용할 수 없어요. 지역을 검색해 주세요.",
      );
    navigator.geolocation.getCurrentPosition(
      (position) =>
        onSelect(
          position.coords.latitude,
          position.coords.longitude,
          "현재 위치",
        ),
      () =>
        setLocationError(
          "위치를 가져오지 못했어요. 아래에서 지역이나 장소를 검색해 주세요.",
        ),
      { enableHighAccuracy: true, timeout: 8_000 },
    );
  }

  async function searchRegion(event: FormEvent) {
    event.preventDefault();
    if (query.trim().length < 2) return;
    setSearching(true);
    setLocationError("");
    try {
      const data = await requestApi<{ regions: RegionResult[] }>(
        `/what-should-eat/api/places/regions?q=${encodeURIComponent(query)}`,
      );
      setRegions(data.regions);
      setSearched(true);
    } catch (caught) {
      setLocationError(
        caught instanceof Error
          ? caught.message
          : "지역을 검색하지 못했습니다.",
      );
    } finally {
      setSearching(false);
    }
  }

  return (
    <section className="workflow-card">
      <button className="back-button" onClick={onBack}>
        <ArrowLeft size={17} /> 멤버 다시 고르기
      </button>
      <div className="section-heading">
        <span className="section-icon coral">
          <MapPin size={23} />
        </span>
        <div>
          <p className="eyebrow">STEP 2</p>
          <h1>어디에서 먹을까요?</h1>
          <p>기준 위치에서 1km 안의 실제 음식점을 찾아요.</p>
        </div>
      </div>
      <button
        className="location-button"
        onClick={useCurrentLocation}
        disabled={busy}
      >
        <span>
          <LocateFixed size={23} />
        </span>
        <span>
          <strong>내 현재 위치 사용하기</strong>
          <small>브라우저 위치 권한이 필요해요</small>
        </span>
        {busy ? (
          <LoaderCircle className="spin" size={21} />
        ) : (
          <ChevronRight size={21} />
        )}
      </button>
      <div className="divider">
        <span>또는 지역·장소 검색</span>
      </div>
      <form className="search-box large" onSubmit={searchRegion}>
        <Search size={20} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="예: 강남역, 성수동"
          aria-label="지역 또는 장소"
        />
        <button disabled={searching || busy}>
          {searching ? <LoaderCircle className="spin" size={18} /> : "찾기"}
        </button>
      </form>
      {(locationError || error) && (
        <p className="message error" role="alert">
          {locationError || error}
        </p>
      )}
      {searched && (
        <div className="region-results" aria-live="polite">
          {regions.length === 0 ? (
            <p className="empty-inline">
              검색 결과가 없어요. 다른 이름으로 찾아보세요.
            </p>
          ) : (
            regions.map((region) => (
              <button
                key={region.id}
                onClick={() =>
                  onSelect(region.latitude, region.longitude, region.name)
                }
                disabled={busy}
              >
                <MapPin size={18} />
                <span>
                  <strong>{region.name}</strong>
                  <small>{region.address}</small>
                </span>
                <ChevronRight size={18} />
              </button>
            ))
          )}
        </div>
      )}
      <p className="privacy-note">
        위치 정보는 주변 후보를 찾을 때만 사용하며 저장하지 않아요.
      </p>
    </section>
  );
}

function PlaceCard({
  place,
  onChoose,
  disabled,
}: {
  place: PlaceCandidate;
  onChoose: () => void;
  disabled: boolean;
}) {
  const { major, detail } = getCategoryParts(place.category);
  return (
    <button
      className="place-card"
      data-slot="candidate"
      onClick={onChoose}
      disabled={disabled}
    >
      <span className="place-card-heading">
        <CategoryBadge category={place.category} />
        <span className="place-copy">
          <small className="category">
            {major} · {detail}
          </small>
          <strong>{place.name}</strong>
        </span>
      </span>
      <span className="restaurant-meta">
        <span>
          <MapPin size={14} /> {place.distanceMeters.toLocaleString()}m
        </span>
        <span>
          <Footprints size={14} /> 도보 {walkingMinutes(place.distanceMeters)}분
        </span>
      </span>
      <span className="place-address">
        {place.roadAddress || place.address}
      </span>
      <span className="choose-label">이곳으로 선택</span>
    </button>
  );
}

function DuelStep({
  state,
  onChoose,
  busy,
  error,
}: {
  state: DuelState;
  onChoose: (place: PlaceCandidate) => void;
  busy: boolean;
  error: string;
}) {
  return (
    <section className="duel-section">
      <div className="duel-heading">
        <p className="eyebrow">
          ROUND {state.round} / {state.totalRounds}
        </p>
        <h1>오늘은 어디가 더 끌리나요?</h1>
        <p>고른 식당이 다음 후보와 계속 대결해요.</p>
      </div>
      <div className="round-bar" aria-hidden>
        {Array.from({ length: state.totalRounds }, (_, index) => (
          <span key={index} className={index < state.round ? "active" : ""} />
        ))}
      </div>
      <div className="duel-grid">
        <PlaceCard
          place={state.winner}
          onChoose={() => onChoose(state.winner)}
          disabled={busy}
        />
        <span className="versus">VS</span>
        <PlaceCard
          place={state.challenger}
          onChoose={() => onChoose(state.challenger)}
          disabled={busy}
        />
      </div>
      {busy && (
        <p className="message neutral">
          <LoaderCircle className="spin" size={17} /> 결과를 저장하고 있어요…
        </p>
      )}
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function FeedbackControls({
  value,
  onChange,
  busy,
  includeNotVisited = true,
}: {
  value: PreferenceResponse | null;
  onChange: (response: PreferenceResponse) => void;
  busy: boolean;
  includeNotVisited?: boolean;
}) {
  const options: Array<{
    value: PreferenceResponse;
    label: string;
    icon: typeof ThumbsUp;
  }> = [
    { value: "liked", label: "좋다", icon: ThumbsUp },
    { value: "disliked", label: "싫다", icon: ThumbsDown },
    ...(includeNotVisited
      ? [
          {
            value: "not_visited" as const,
            label: "실제로는 방문하지 않음",
            icon: UserMinus,
          },
        ]
      : []),
  ];
  return (
    <div className="feedback-controls" aria-label="개인 평가">
      {options.map((option) => {
        const Icon = option.icon;
        return (
          <button
            type="button"
            key={option.value}
            className={value === option.value ? "active" : ""}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            disabled={busy}
          >
            <Icon size={15} /> {option.label}
          </button>
        );
      })}
    </div>
  );
}

function ResultStep({
  place,
  participants,
  locationLabel,
  decisionId,
  onRestart,
}: {
  place: PlaceCandidate;
  participants: ParticipantSummary[];
  locationLabel: string;
  decisionId: number;
  onRestart: () => void;
}) {
  const { detail: shortCategory } = getCategoryParts(place.category);
  const [feedback, setFeedback] = useState<PreferenceResponse | null>(null);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");

  async function saveFeedback(response: PreferenceResponse) {
    setFeedbackBusy(true);
    setFeedbackError("");
    try {
      await requestApi("/what-should-eat/api/feedback", {
        method: "POST",
        body: JSON.stringify({ decisionId, response }),
      });
      setFeedback(response);
    } catch (caught) {
      setFeedbackError(
        caught instanceof Error
          ? caught.message
          : "평가를 저장하지 못했습니다.",
      );
    } finally {
      setFeedbackBusy(false);
    }
  }

  return (
    <section className="result-card">
      <div className="confetti" aria-hidden="true">
        ✦
      </div>
      <p className="eyebrow">오늘의 선택</p>
      <div className="result-title">
        <CategoryBadge category={place.category} />
        <div className="result-title-copy">
          <h1>{place.name}</h1>
          <p className="result-category">{shortCategory}</p>
        </div>
      </div>
      <div className="result-meta">
        <span>
          <MapPin size={17} /> {locationLabel}에서{" "}
          {place.distanceMeters.toLocaleString()}m
        </span>
        <span>
          <Users size={17} /> <ParticipantNames participants={participants} />
        </span>
      </div>
      <div className="result-feedback">
        <strong>직접 다녀온 뒤 어땠나요?</strong>
        <p>내 평가는 내 추천에만 반영돼요.</p>
        <FeedbackControls
          value={feedback}
          onChange={saveFeedback}
          busy={feedbackBusy}
        />
        {feedbackError && (
          <p className="feedback-error" role="alert">
            {feedbackError}
          </p>
        )}
      </div>
      {place.placeUrl && (
        <a
          className="secondary-button"
          href={place.placeUrl}
          target="_blank"
          rel="noreferrer"
        >
          카카오맵에서 보기 <ChevronRight size={17} />
        </a>
      )}
      <button className="primary-button fit" onClick={onRestart}>
        새로운 한 끼 정하기 <Sparkles size={17} />
      </button>
      <p className="saved-note">
        <Check size={14} /> 선택 결과가 지난 선택에 저장됐어요.
      </p>
    </section>
  );
}

function HistoryView() {
  const [decisions, setDecisions] = useState<DecisionHistory[]>([]);
  const [manualFeedback, setManualFeedback] = useState<PlaceFeedback[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<PlaceCandidate[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [savingKey, setSavingKey] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    Promise.all([
      requestApi<{ decisions: DecisionHistory[] }>(
        "/what-should-eat/api/decisions",
      ),
      requestApi<{ feedback: PlaceFeedback[] }>(
        "/what-should-eat/api/feedback",
      ),
    ])
      .then(([decisionData, feedbackData]) => {
        setDecisions(decisionData.decisions);
        setManualFeedback(
          feedbackData.feedback.filter((item) => item.source === "manual"),
        );
      })
      .catch((caught) =>
        setError(
          caught instanceof Error
            ? caught.message
            : "이력을 불러오지 못했습니다.",
        ),
      )
      .finally(() => setBusy(false));
  }, []);

  async function searchPlaces(event: FormEvent) {
    event.preventDefault();
    if (query.trim().length < 2) return;
    setSearching(true);
    setNotice("");
    try {
      const data = await requestApi<{ places: PlaceCandidate[] }>(
        `/what-should-eat/api/places/search?q=${encodeURIComponent(query)}`,
      );
      setPlaces(data.places);
      setSearched(true);
    } catch (caught) {
      setNotice(
        caught instanceof Error
          ? caught.message
          : "식당을 검색하지 못했습니다.",
      );
    } finally {
      setSearching(false);
    }
  }

  async function saveDecisionFeedback(
    decisionId: number,
    response: PreferenceResponse,
  ) {
    const key = `decision-${decisionId}`;
    setSavingKey(key);
    setNotice("");
    try {
      await requestApi("/what-should-eat/api/feedback", {
        method: "POST",
        body: JSON.stringify({ decisionId, response }),
      });
      setDecisions((current) =>
        current.map((decision) =>
          decision.id === decisionId
            ? { ...decision, myFeedback: response }
            : decision,
        ),
      );
      setNotice("개인 평가를 저장했습니다.");
    } catch (caught) {
      setNotice(
        caught instanceof Error
          ? caught.message
          : "평가를 저장하지 못했습니다.",
      );
    } finally {
      setSavingKey("");
    }
  }

  async function saveManualFeedback(
    place: PlaceCandidate,
    response: PreferenceResponse,
  ) {
    const key = `place-${place.id}`;
    setSavingKey(key);
    setNotice("");
    try {
      const data = await requestApi<{ feedback: PlaceFeedback }>(
        "/what-should-eat/api/feedback",
        { method: "POST", body: JSON.stringify({ place, response }) },
      );
      setManualFeedback((current) => [
        data.feedback,
        ...current.filter((item) => item.place.id !== place.id),
      ]);
      setNotice(`${place.name} 평가를 저장했습니다.`);
    } catch (caught) {
      setNotice(
        caught instanceof Error
          ? caught.message
          : "평가를 저장하지 못했습니다.",
      );
    } finally {
      setSavingKey("");
    }
  }

  const manualByPlace = new Map(
    manualFeedback.map((item) => [item.place.id, item]),
  );

  return (
    <main className="app-main history-page">
      <div className="page-heading">
        <p className="eyebrow">MY HISTORY</p>
        <h1>지난 선택과 내 평가</h1>
        <p>직접 먹어본 경험이 다음 추천을 더 나답게 만들어요.</p>
      </div>
      <section className="manual-rating-card">
        <div>
          <p className="eyebrow">ADD EXPERIENCE</p>
          <h2>다른 곳에서 먹은 식당도 알려주세요</h2>
          <p>추천으로 고르지 않은 식당도 이름을 찾아 평가할 수 있어요.</p>
        </div>
        <form className="search-box large" onSubmit={searchPlaces}>
          <Search size={20} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="평가할 식당 이름"
            aria-label="평가할 식당 이름"
          />
          <button disabled={searching}>
            {searching ? <LoaderCircle className="spin" size={18} /> : "찾기"}
          </button>
        </form>
        {searched && (
          <div className="rating-search-results">
            {places.length === 0 ? (
              <p className="empty-inline">일치하는 음식점을 찾지 못했어요.</p>
            ) : (
              places.map((place) => {
                const existing = manualByPlace.get(place.id);
                return (
                  <div className="rating-place" key={place.id}>
                    <span>
                      <strong>{place.name}</strong>
                      <small>
                        {getCategoryParts(place.category).label} ·{" "}
                        {place.roadAddress || place.address}
                      </small>
                    </span>
                    <FeedbackControls
                      value={existing?.response ?? null}
                      onChange={(response) =>
                        saveManualFeedback(place, response)
                      }
                      busy={savingKey === `place-${place.id}`}
                      includeNotVisited={false}
                    />
                  </div>
                );
              })
            )}
          </div>
        )}
        {notice && (
          <p className="message neutral" role="status">
            {notice}
          </p>
        )}
      </section>
      <div className="history-section-heading">
        <h2>함께 고른 식당</h2>
        <p>참여한 선택마다 내 경험을 따로 남길 수 있어요.</p>
      </div>
      {busy ? (
        <div className="empty-state">
          <LoaderCircle className="spin" />
          <p>지난 선택을 불러오는 중이에요.</p>
        </div>
      ) : error ? (
        <p className="message error" role="alert">
          {error}
        </p>
      ) : decisions.length === 0 ? (
        <div className="empty-state">
          <span>
            <History size={30} />
          </span>
          <h2>아직 지난 선택이 없어요</h2>
          <p>오늘의 첫 식당을 골라보세요.</p>
        </div>
      ) : (
        <div className="history-list">
          {decisions.map((decision) => (
            <article className="history-item" key={decision.id}>
              <span className="history-icon">
                <CategoryBadge category={decision.place.category} />
              </span>
              <div className="history-copy">
                <p>
                  <Clock3 size={15} />{" "}
                  {new Intl.DateTimeFormat("ko-KR", {
                    dateStyle: "long",
                    timeStyle: "short",
                  }).format(new Date(decision.decidedAt))}
                </p>
                <h2>{decision.place.name}</h2>
                <span>{getCategoryParts(decision.place.category).label}</span>
              </div>
              <div className="history-members">
                <Users size={17} />
                <ParticipantNames participants={decision.participants} />
              </div>
              <div className="history-feedback">
                <FeedbackControls
                  value={decision.myFeedback ?? null}
                  onChange={(response) =>
                    saveDecisionFeedback(decision.id, response)
                  }
                  busy={savingKey === `decision-${decision.id}`}
                />
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}

function DecisionFlow({ user }: { user: AppUser }) {
  const [step, setStep] = useState<DecisionStep>("participants");
  const [participants, setParticipants] = useState<ParticipantSummary[]>([
    user,
  ]);
  const [duel, setDuel] = useState<DuelState | null>(null);
  const [result, setResult] = useState<PlaceCandidate | null>(null);
  const [decisionId, setDecisionId] = useState<number | null>(null);
  const [comparisons, setComparisons] = useState<DuelComparison[]>([]);
  const [locationLabel, setLocationLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function loadCandidates(
    latitude: number,
    longitude: number,
    label: string,
  ) {
    setBusy(true);
    setError("");
    try {
      const data = await requestApi<{ candidates: PlaceCandidate[] }>(
        "/what-should-eat/api/places/candidates",
        {
          method: "POST",
          body: JSON.stringify({
            latitude,
            longitude,
            participantIds: participants.map((participant) => participant.id),
          }),
        },
      );
      if (data.candidates.length < 2)
        return setError(
          "주변에 조건에 맞는 곳이 부족합니다. 다른 위치를 선택해 주세요.",
        );
      const nextDuel = startDuel(shuffle(data.candidates));
      if (!nextDuel) return;
      setLocationLabel(label);
      setDuel(nextDuel);
      setComparisons([]);
      setStep("duel");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "후보를 만들지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function choose(place: PlaceCandidate) {
    if (!duel) return;
    const loser = place.id === duel.winner.id ? duel.challenger : duel.winner;
    const nextComparisons: DuelComparison[] = [
      ...comparisons,
      {
        round: duel.round,
        winner: { id: place.id, category: place.category },
        loser: { id: loser.id, category: loser.category },
      },
    ];
    const next = chooseDuel(duel, place);
    if (next.state) {
      setComparisons(nextComparisons);
      return setDuel(next.state);
    }
    if (!next.result) return;
    setBusy(true);
    setError("");
    try {
      const data = await requestApi<{ decision: { id: number } }>(
        "/what-should-eat/api/decisions",
        {
          method: "POST",
          body: JSON.stringify({
            participantIds: participants.map((participant) => participant.id),
            place: next.result,
            comparisons: nextComparisons,
          }),
        },
      );
      setDecisionId(data.decision.id);
      setResult(next.result);
      setStep("result");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "결과를 저장하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  function restart() {
    setParticipants([user]);
    setDuel(null);
    setResult(null);
    setDecisionId(null);
    setComparisons([]);
    setLocationLabel("");
    setError("");
    setStep("participants");
  }

  return (
    <main className="app-main">
      {step !== "result" && <Progress step={step} />}
      {step === "participants" && (
        <ParticipantsStep
          currentUser={user}
          participants={participants}
          setParticipants={setParticipants}
          onNext={() => {
            setError("");
            setStep("location");
          }}
        />
      )}
      {step === "location" && (
        <LocationStep
          onBack={() => setStep("participants")}
          onSelect={loadCandidates}
          busy={busy}
          error={error}
        />
      )}
      {step === "duel" && duel && (
        <DuelStep state={duel} onChoose={choose} busy={busy} error={error} />
      )}
      {(step === "location" || step === "duel") && (
        <ParticipantBar participants={participants} />
      )}
      {step === "result" && result && decisionId !== null && (
        <ResultStep
          place={result}
          participants={participants}
          locationLabel={locationLabel}
          decisionId={decisionId}
          onRestart={restart}
        />
      )}
    </main>
  );
}

export default function MealApp() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AppUser | null>(null);
  const [view, setView] = useState<AppView>("decide");

  useEffect(() => {
    requestApi<{ user: AppUser }>("/what-should-eat/api/auth/me")
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  async function logout() {
    await requestApi("/what-should-eat/api/auth/logout", {
      method: "POST",
    }).catch(() => undefined);
    setUser(null);
    setView("decide");
  }

  if (loading) return <LoadingScreen />;
  if (!user) return <AuthScreen onAuthenticated={setUser} />;
  return (
    <div className="app-shell">
      <AppHeader user={user} view={view} onView={setView} onLogout={logout} />
      {view === "decide" ? <DecisionFlow user={user} /> : <HistoryView />}
      <footer>오늘 뭐 먹지? · 함께 결정하는 가장 가벼운 방법</footer>
    </div>
  );
}
