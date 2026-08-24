import Link from "next/link";

const apps = [
  {
    name: "오늘 뭐 먹지?",
    description: "함께 고르는 오늘의 한 끼와 장소 추천",
    href: "/what-should-eat",
    status: "사용 가능",
    accent: "meal",
  },
  {
    name: "월드컵 예측 내기",
    description: "5명이 함께 쓰는 월드컵 결과 예측 보드",
    href: "/worldcup-prediction",
    status: "사용 가능",
    accent: "worldcup",
  },
] as const;

export default function Home() {
  return (
    <main className="workbench-home">
      <section className="workbench-hero">
        <p className="workbench-eyebrow">TYPEMIN · PERSONAL LAB</p>
        <h1>Workbench</h1>
        <p className="workbench-intro">
          아이디어를 빠르게 만들고, 실제로 써 보며, 가치가 생긴 앱만 독립시키는
          개인 개발 공간입니다.
        </p>
      </section>

      <section aria-labelledby="apps-heading" className="workbench-apps">
        <div className="workbench-section-heading">
          <h2 id="apps-heading">Apps</h2>
          <span>{apps.length}개 운영 중</span>
        </div>
        <div className="workbench-grid">
          {apps.map((app) => (
            <Link
              aria-label={`${app.name} 열기`}
              className={`workbench-card workbench-card--${app.accent}`}
              href={app.href}
              key={app.href}
            >
              <div className="workbench-card-topline">
                <span className="workbench-status">{app.status}</span>
                <span aria-hidden="true" className="workbench-arrow">
                  ↗
                </span>
              </div>
              <div>
                <h3>{app.name}</h3>
                <p>{app.description}</p>
              </div>
              <code>{app.href}</code>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
