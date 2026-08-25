"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
  LogIn,
  LogOut,
  MapPin,
  Pencil,
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

type AppView = "decide" | "history";
type DecisionStep = "participants" | "location" | "duel" | "result";
type AuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "needsProfile" }
  | { status: "guest" }
  | { status: "member"; user: AppUser };

const GUEST_SESSION_KEY = "what_should_eat_guest";

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

function AuthScreen({ onGuest }: { onGuest: () => void }) {
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
          <div className="auth-shared-actions">
            <Link
              className="primary-button"
              href="/account/sign-in?next=%2Fwhat-should-eat"
            >
              로그인
            </Link>
            <Link
              className="secondary-button"
              href="/account/sign-up?next=%2Fwhat-should-eat"
            >
              가입
            </Link>
          </div>
          <div className="guest-entry">
            <button
              type="button"
              className="secondary-button"
              onClick={onGuest}
            >
              로그인 없이 시작하기 <ChevronRight size={17} />
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

function MealProfileScreen({
  onComplete,
}: {
  onComplete: (user: AppUser) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const currentYear = new Date().getFullYear();
  const years = Array.from(
    { length: currentYear - 1899 },
    (_, index) => currentYear - index,
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const { user } = await requestApi<{ user: AppUser }>(
        "/what-should-eat/api/profile",
        {
          method: "POST",
          body: JSON.stringify({
            birthYear: Number(form.get("birthYear")),
            gender: form.get("gender") as Gender,
          }),
        },
      );
      onComplete(user);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "프로필을 저장하지 못했습니다.",
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
          <h1>식사 프로필</h1>
        </div>
      </section>
      <form className="form-stack" onSubmit={submit}>
        <p className="auth-shared-copy">
          맞춤 추천에 사용할 정보입니다. 다른 Workbench 앱에는 적용되지
          않습니다.
        </p>
        <label>
          <span>출생연도</span>
          <select defaultValue="" name="birthYear" required>
            <option disabled value="">
              연도 선택
            </option>
            {years.map((year) => (
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
              <input name="gender" required type="radio" value="male" />
              <span>남성</span>
            </label>
            <label>
              <input name="gender" required type="radio" value="female" />
              <span>여성</span>
            </label>
            <label>
              <input
                name="gender"
                required
                type="radio"
                value="prefer_not_to_say"
              />
              <span>응답 안 함</span>
            </label>
          </div>
        </fieldset>
        {error && (
          <p className="message error" role="alert">
            {error}
          </p>
        )}
        <button className="primary-button" disabled={busy}>
          {busy ? "저장 중…" : "프로필 저장"}
        </button>
      </form>
    </main>
  );
}

function AppHeader({
  user,
  view,
  onView,
  onLogout,
  onAuthenticate,
  onUserUpdated,
}: {
  user: AppUser | null;
  view: AppView;
  onView: (view: AppView) => void;
  onLogout: () => void;
  onAuthenticate: () => void;
  onUserUpdated: (user: AppUser) => void;
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState("");

  useEffect(() => {
    if (!profileOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setProfileOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [profileOpen]);

  function openProfile() {
    if (!user) return;
    setDisplayName(user.displayName);
    setProfileError("");
    setProfileOpen(true);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileBusy(true);
    setProfileError("");
    try {
      const { user: updatedUser } = await requestApi<{ user: AppUser }>(
        "/what-should-eat/api/auth/me",
        {
          method: "PATCH",
          body: JSON.stringify({ displayName }),
        },
      );
      onUserUpdated(updatedUser);
      setProfileOpen(false);
    } catch (caught) {
      setProfileError(
        caught instanceof Error
          ? caught.message
          : "표시 이름을 변경하지 못했습니다.",
      );
    } finally {
      setProfileBusy(false);
    }
  }

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
          {user && (
            <button
              className={view === "history" ? "active" : ""}
              onClick={() => onView("history")}
            >
              <History size={17} /> 지난 선택
            </button>
          )}
        </nav>
        <div className="user-menu">
          {user ? (
            <>
              <button
                type="button"
                className="profile-trigger"
                onClick={openProfile}
                aria-label={`프로필 편집: ${user.displayName}`}
                aria-haspopup="dialog"
                aria-expanded={profileOpen}
                aria-controls="profile-editor"
              >
                <span className="avatar">{user.displayName.slice(0, 1)}</span>
                <span className="user-name">
                  <strong>{user.displayName}</strong>
                  <small>@{user.loginId}</small>
                </span>
                <Pencil size={13} aria-hidden />
              </button>
              <button
                className="icon-button"
                onClick={onLogout}
                aria-label="로그아웃"
                title="로그아웃"
              >
                <LogOut size={19} />
              </button>
              {profileOpen && (
                <div
                  id="profile-editor"
                  className="profile-popover"
                  role="dialog"
                  aria-modal="false"
                  aria-labelledby="profile-editor-title"
                >
                  <div className="profile-popover-heading">
                    <div>
                      <strong id="profile-editor-title">프로필 편집</strong>
                      <span>@{user.loginId}</span>
                    </div>
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => setProfileOpen(false)}
                      aria-label="프로필 편집 닫기"
                    >
                      <X size={17} />
                    </button>
                  </div>
                  <form className="profile-form" onSubmit={saveProfile}>
                    <label htmlFor="profile-display-name">표시 이름</label>
                    <input
                      id="profile-display-name"
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      maxLength={30}
                      autoComplete="name"
                      autoFocus
                      required
                    />
                    {profileError && (
                      <p className="field-message error" role="alert">
                        {profileError}
                      </p>
                    )}
                    <div className="profile-actions">
                      <Link href="/account">계정 관리</Link>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => setProfileOpen(false)}
                        disabled={profileBusy}
                      >
                        취소
                      </button>
                      <button className="primary-button" disabled={profileBusy}>
                        {profileBusy && (
                          <LoaderCircle className="spin" size={16} />
                        )}
                        저장
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </>
          ) : (
            <>
              <span className="guest-label">
                <span className="avatar">비</span>
                <strong>비회원</strong>
              </span>
              <button
                type="button"
                className="header-auth-button"
                onClick={onAuthenticate}
              >
                <LogIn size={15} /> 로그인/가입
              </button>
            </>
          )}
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
  includeGuest = false,
}: {
  participants: ParticipantSummary[];
  includeGuest?: boolean;
}) {
  return (
    <span className="participant-names">
      {includeGuest && (
        <span>
          비회원
          <small>나</small>
        </span>
      )}
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
  includeGuest = false,
}: {
  participants: ParticipantSummary[];
  includeGuest?: boolean;
}) {
  return (
    <div className="participant-bar">
      <Users size={15} aria-hidden />
      <span className="sr-only">오늘 함께 먹는 사람</span>
      <div>
        {includeGuest && <span>비회원</span>}
        {participants.map((participant) => (
          <span key={participant.id}>{participant.displayName}</span>
        ))}
      </div>
    </div>
  );
}

function ParticipantsStep({
  currentUser,
  guest,
  participants,
  setParticipants,
  onNext,
}: {
  currentUser: AppUser | null;
  guest: boolean;
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
        {guest && (
          <div className="member-chip">
            <span className="avatar small">비</span>
            <span>
              <strong>비회원</strong>
              <small>이 선택은 저장되지 않아요</small>
            </span>
            <em>나</em>
          </div>
        )}
        {participants.map((participant) => (
          <div className="member-chip" key={participant.id}>
            <span className="avatar small">
              {participant.displayName.slice(0, 1)}
            </span>
            <span>
              <strong>{participant.displayName}</strong>
              <small>@{participant.loginId}</small>
            </span>
            {participant.id === currentUser?.id ? (
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
          <strong>{participants.length + (guest ? 1 : 0)}명</strong>이 함께
          골라요
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
  guest,
  onAuthenticate,
}: {
  place: PlaceCandidate;
  participants: ParticipantSummary[];
  locationLabel: string;
  decisionId: number | null;
  onRestart: () => void;
  guest: boolean;
  onAuthenticate: () => void;
}) {
  const { detail: shortCategory } = getCategoryParts(place.category);
  const [feedback, setFeedback] = useState<PreferenceResponse | null>(null);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");

  async function saveFeedback(response: PreferenceResponse) {
    if (decisionId === null) return;
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
          <Users size={17} />{" "}
          <ParticipantNames participants={participants} includeGuest={guest} />
        </span>
      </div>
      {decisionId !== null ? (
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
      ) : (
        <div className="guest-result-note">
          <strong>비회원 선택은 저장되지 않아요.</strong>
          <p>로그인하면 다음 선택부터 이력과 평가를 남길 수 있어요.</p>
        </div>
      )}
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
      {guest ? (
        <button className="guest-login-link" onClick={onAuthenticate}>
          <LogIn size={15} /> 로그인하고 다음 선택 저장하기
        </button>
      ) : (
        <p className="saved-note">
          <Check size={14} /> 선택 결과가 지난 선택에 저장됐어요.
        </p>
      )}
    </section>
  );
}

function HistoryView({ currentUser }: { currentUser: AppUser }) {
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
                <ParticipantNames
                  participants={decision.participants.map((participant) =>
                    participant.id === currentUser.id
                      ? {
                          id: currentUser.id,
                          loginId: currentUser.loginId,
                          displayName: currentUser.displayName,
                        }
                      : participant,
                  )}
                />
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

function DecisionFlow({
  user,
  guest,
  onAuthenticate,
}: {
  user: AppUser | null;
  guest: boolean;
  onAuthenticate: () => void;
}) {
  const [step, setStep] = useState<DecisionStep>("participants");
  const [participants, setParticipants] = useState<ParticipantSummary[]>(
    user ? [user] : [],
  );
  const [duel, setDuel] = useState<DuelState | null>(null);
  const [result, setResult] = useState<PlaceCandidate | null>(null);
  const [decisionId, setDecisionId] = useState<number | null>(null);
  const [comparisons, setComparisons] = useState<DuelComparison[]>([]);
  const [locationLabel, setLocationLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const displayedParticipants = participants.map((participant) =>
    user && participant.id === user.id
      ? {
          id: user.id,
          loginId: user.loginId,
          displayName: user.displayName,
        }
      : participant,
  );

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
    if (guest) {
      setComparisons(nextComparisons);
      setDecisionId(null);
      setResult(next.result);
      setStep("result");
      return;
    }
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
    setParticipants(user ? [user] : []);
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
          guest={guest}
          participants={displayedParticipants}
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
        <ParticipantBar
          participants={displayedParticipants}
          includeGuest={guest}
        />
      )}
      {step === "result" && result && (
        <ResultStep
          place={result}
          participants={displayedParticipants}
          locationLabel={locationLabel}
          decisionId={decisionId}
          onRestart={restart}
          guest={guest}
          onAuthenticate={onAuthenticate}
        />
      )}
    </main>
  );
}

export default function MealApp() {
  const router = useRouter();
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });
  const [view, setView] = useState<AppView>("decide");

  useEffect(() => {
    fetch("/what-should-eat/api/auth/me")
      .then(async (response) => {
        if (response.status === 403) {
          const body = (await response.json().catch(() => ({}))) as {
            requiresPinChange?: boolean;
          };
          if (body.requiresPinChange) {
            router.replace("/account");
            return null;
          }
        }
        if (response.status === 428) {
          setAuth({ status: "needsProfile" });
          return null;
        }
        if (!response.ok) throw new Error("signed out");
        return (await response.json()) as { user: AppUser };
      })
      .then((data) => {
        if (!data) return;
        sessionStorage.removeItem(GUEST_SESSION_KEY);
        setAuth({ status: "member", user: data.user });
      })
      .catch(() =>
        setAuth(
          sessionStorage.getItem(GUEST_SESSION_KEY) === "true"
            ? { status: "guest" }
            : { status: "signedOut" },
        ),
      );
  }, [router]);

  function authenticated(user: AppUser) {
    sessionStorage.removeItem(GUEST_SESSION_KEY);
    setView("decide");
    setAuth({ status: "member", user });
  }

  function startGuest() {
    sessionStorage.setItem(GUEST_SESSION_KEY, "true");
    setView("decide");
    setAuth({ status: "guest" });
  }

  function showAuthentication() {
    sessionStorage.removeItem(GUEST_SESSION_KEY);
    setView("decide");
    setAuth({ status: "signedOut" });
  }

  async function logout() {
    await requestApi("/what-should-eat/api/auth/logout", {
      method: "POST",
    }).catch(() => undefined);
    sessionStorage.removeItem(GUEST_SESSION_KEY);
    setAuth({ status: "signedOut" });
    setView("decide");
  }

  if (auth.status === "loading") return <LoadingScreen />;
  if (auth.status === "needsProfile")
    return <MealProfileScreen onComplete={authenticated} />;
  if (auth.status === "signedOut") {
    return <AuthScreen onGuest={startGuest} />;
  }

  const user = auth.status === "member" ? auth.user : null;
  const guest = auth.status === "guest";
  return (
    <div className="app-shell">
      <AppHeader
        user={user}
        view={view}
        onView={setView}
        onLogout={logout}
        onAuthenticate={showAuthentication}
        onUserUpdated={(updatedUser) =>
          setAuth({ status: "member", user: updatedUser })
        }
      />
      {view === "decide" || guest ? (
        <DecisionFlow
          user={user}
          guest={guest}
          onAuthenticate={showAuthentication}
        />
      ) : (
        user && <HistoryView currentUser={user} />
      )}
      <footer>오늘 뭐 먹지? · 함께 결정하는 가장 가벼운 방법</footer>
    </div>
  );
}
