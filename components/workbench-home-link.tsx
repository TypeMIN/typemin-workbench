import Link from "next/link";

export function WorkbenchHomeLink({ className = "" }: { className?: string }) {
  return (
    <Link
      aria-label="Workbench 홈으로 돌아가기"
      className={`workbench-home-link ${className}`.trim()}
      href="/"
    >
      <span aria-hidden="true">←</span>
      <span>Workbench</span>
    </Link>
  );
}
