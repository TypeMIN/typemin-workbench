import { WorkbenchAccountControl } from "@/components/workbench-account-control";
import { WorkbenchProjectCatalog } from "@/components/workbench-project-catalog";

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
          <WorkbenchProjectCatalog />
        </section>
      </div>
    </main>
  );
}
