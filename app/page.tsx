import Link from "next/link";

import { WorkbenchAccountControl } from "@/components/workbench-account-control";
import { WORKBENCH_APPS } from "@/lib/workbench/apps";

export default function Home() {
  const activeCount = WORKBENCH_APPS.filter(
    (app) => app.statusTone === "active",
  ).length;
  const completedCount = WORKBENCH_APPS.filter(
    (app) => app.statusTone === "complete",
  ).length;

  return (
    <main className="workbench-home">
      <section className="workbench-hero">
        <div className="workbench-hero-account">
          <WorkbenchAccountControl />
        </div>
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
          <span>
            {activeCount}개 운영 · {completedCount}개 완료
          </span>
        </div>
        <div className="workbench-grid">
          {WORKBENCH_APPS.map((app) => (
            <Link
              aria-label={`${app.name} 열기`}
              className={`workbench-card workbench-card--${app.accent}`}
              href={app.href}
              key={app.href}
            >
              <div className="workbench-card-topline">
                <span
                  className={`workbench-status workbench-status--${app.statusTone}`}
                >
                  {app.status}
                </span>
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
