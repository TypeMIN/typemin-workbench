import Link from "next/link";

import { WorkbenchAccountControl } from "@/components/workbench-account-control";
import { WORKBENCH_APPS } from "@/lib/workbench/apps";

export default function Home() {
  return (
    <main className="workbench-home">
      <div className="workbench-home-shell">
        <header className="workbench-home-topbar">
          <h1 className="workbench-home-brand" aria-label="Workbench">
            <span aria-hidden="true">W</span>
            <strong>Workbench</strong>
          </h1>
          <div className="workbench-home-account">
            <WorkbenchAccountControl />
          </div>
        </header>

        <section aria-labelledby="apps-heading" className="workbench-apps">
          <h2 id="apps-heading">프로젝트</h2>

          <div className="workbench-grid">
            {WORKBENCH_APPS.map((app) => (
              <Link
                aria-label={`${app.name} 열기`}
                className={`workbench-card workbench-card--${app.accent}`}
                href={app.href}
                key={app.href}
              >
                <div className="workbench-card-topline">
                  <span aria-hidden="true" className="workbench-card-accent" />
                  <span className="workbench-status">{app.status}</span>
                </div>

                <div className="workbench-card-copy">
                  <h3>{app.name}</h3>
                  <p>{app.description}</p>
                </div>

                <span className="workbench-card-action">
                  열기 <span aria-hidden="true">→</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
