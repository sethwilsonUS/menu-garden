import type { MenuSummary } from "@menu-garden/shared/types";

type MenuParseJob = MenuSummary["parseJob"];

export function MenuParseProgress({
  parseJob,
}: {
  parseJob: MenuParseJob | undefined;
}) {
  if (!parseJob?.totalPages || parseJob.totalPages < 1) {
    return null;
  }

  const totalPages = Math.max(1, Math.floor(parseJob.totalPages));
  const completedPages = Math.min(
    totalPages,
    Math.max(0, Math.floor(parseJob.completedPages ?? 0))
  );
  const currentPage = parseJob.currentPage
    ? Math.min(totalPages, Math.max(1, Math.floor(parseJob.currentPage)))
    : null;
  const percent =
    parseJob.status === "ready"
      ? 100
      : Math.round((completedPages / totalPages) * 100);
  const progressText =
    currentPage && completedPages < totalPages
      ? `${completedPages} of ${totalPages} pages read. Currently reading page ${currentPage}.`
      : `${completedPages} of ${totalPages} pages read.`;

  return (
    <div className="mt-3 space-y-2">
      <div
        aria-label="Menu reading progress"
        aria-valuemax={totalPages}
        aria-valuemin={0}
        aria-valuenow={completedPages}
        aria-valuetext={progressText}
        className="h-3 overflow-hidden rounded-full border border-accent-border bg-surface-2"
        role="progressbar"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-sm leading-6 text-foreground-2">{progressText}</p>
    </div>
  );
}
