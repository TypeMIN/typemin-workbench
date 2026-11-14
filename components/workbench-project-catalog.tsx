"use client";

import Link from "next/link";
import { useState, type KeyboardEvent } from "react";

import { WORKBENCH_APPS } from "@/lib/workbench/apps";

const PROJECT_TABS = [
  { id: "available", label: "사용 가능" },
  { id: "archived", label: "아카이브" },
] as const;

type ProjectStatus = (typeof PROJECT_TABS)[number]["id"];

export function WorkbenchProjectCatalog() {
  const [activeTab, setActiveTab] = useState<ProjectStatus>("available");
  const projects = WORKBENCH_APPS.filter((app) => app.status === activeTab);

  function selectTabFromKeyboard(
    event: KeyboardEvent<HTMLButtonElement>,
    tabIndex: number,
  ) {
    let nextIndex = tabIndex;

    if (event.key === "ArrowRight")
      nextIndex = (tabIndex + 1) % PROJECT_TABS.length;
    if (event.key === "ArrowLeft") {
      nextIndex = (tabIndex - 1 + PROJECT_TABS.length) % PROJECT_TABS.length;
    }
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = PROJECT_TABS.length - 1;
    if (nextIndex === tabIndex) return;

    event.preventDefault();
    const nextTab = PROJECT_TABS[nextIndex];
    setActiveTab(nextTab.id);
    document.getElementById(`workbench-tab-${nextTab.id}`)?.focus();
  }

  return (
    <>
      <div aria-label="프로젝트 상태" className="workbench-tabs" role="tablist">
        {PROJECT_TABS.map((tab, tabIndex) => {
          const count = WORKBENCH_APPS.filter(
            (app) => app.status === tab.id,
          ).length;
          const isActive = activeTab === tab.id;

          return (
            <button
              aria-controls="workbench-project-panel"
              aria-selected={isActive}
              className="workbench-tab"
              id={`workbench-tab-${tab.id}`}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => selectTabFromKeyboard(event, tabIndex)}
              role="tab"
              tabIndex={isActive ? 0 : -1}
              type="button"
            >
              <span>{tab.label}</span>
              <span aria-label={`${count}개`} className="workbench-tab-count">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div
        aria-labelledby={`workbench-tab-${activeTab}`}
        className="workbench-grid"
        id="workbench-project-panel"
        role="tabpanel"
      >
        {projects.map((app) => (
          <Link
            aria-label={`${app.name} 열기`}
            className={`workbench-card workbench-card--${app.accent}`}
            href={app.href}
            key={app.href}
          >
            <span aria-hidden="true" className="workbench-card-emoji">
              {app.emoji}
            </span>

            <div className="workbench-card-copy">
              <h3>{app.name}</h3>
              <ul
                aria-label={`${app.name} 주요 기능`}
                className="workbench-card-keywords"
              >
                {app.keywords.map((keyword) => (
                  <li key={keyword}>{keyword}</li>
                ))}
              </ul>
            </div>

            <span aria-hidden="true" className="workbench-card-action">
              열기 <span>→</span>
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
