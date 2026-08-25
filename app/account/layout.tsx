import { WorkbenchHomeLink } from "@/components/workbench-home-link";

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="workbench-account-shell">
      <WorkbenchHomeLink />
      {children}
    </main>
  );
}
