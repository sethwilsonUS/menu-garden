import type { MenuParseJobSummary } from "@menu-garden/shared/types";

type MenuParseJob = MenuParseJobSummary | null | undefined;

const WAIT_REASSURANCE =
  "This can take a couple minutes for dense or multi-page menus. Keep this page open while Menu Garden works.";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getUploadCounts(parseJob: MenuParseJobSummary) {
  const totalUploads = parseJob.totalPages
    ? Math.max(1, Math.floor(parseJob.totalPages))
    : null;
  const completedUploads = totalUploads
    ? clamp(Math.floor(parseJob.completedPages ?? 0), 0, totalUploads)
    : 0;
  const currentUpload =
    totalUploads && parseJob.currentPage
      ? clamp(Math.floor(parseJob.currentPage), 1, totalUploads)
      : null;

  return { completedUploads, currentUpload, totalUploads };
}

function getPhase(parseJob: MenuParseJobSummary) {
  const { completedUploads, currentUpload, totalUploads } =
    getUploadCounts(parseJob);

  if (parseJob.status === "ready") {
    return {
      detail: "The accessible menu is ready.",
      label: "Ready",
      percent: 100,
      reassurance: null,
    };
  }

  if (parseJob.status === "failed") {
    return {
      detail: "Menu reading could not finish.",
      label: "Reading stopped",
      percent: 100,
      reassurance: null,
    };
  }

  if (parseJob.status === "saving") {
    return {
      detail: "Building the accessible menu from the readable menu text.",
      label: "Building",
      percent: 92,
      reassurance: WAIT_REASSURANCE,
    };
  }

  if (
    parseJob.status === "extracting" &&
    totalUploads &&
    completedUploads >= totalUploads
  ) {
    return {
      detail: "Organizing the readable text into categories and menu items.",
      label: "Structuring",
      percent: 84,
      reassurance: WAIT_REASSURANCE,
    };
  }

  if (parseJob.status === "extracting") {
    const readPercent = totalUploads
      ? 34 +
        Math.round(
          ((completedUploads + (currentUpload ? 0.35 : 0)) / totalUploads) * 42
        )
      : 46;

    return {
      detail:
        totalUploads && currentUpload
          ? `Reading upload ${currentUpload} of ${totalUploads}.`
          : "Reading the menu with AI.",
      label: "Reading",
      percent: clamp(readPercent, 34, 78),
      reassurance: WAIT_REASSURANCE,
    };
  }

  if (parseJob.status === "converting") {
    return {
      detail: totalUploads
        ? `Preparing ${totalUploads} menu upload${totalUploads === 1 ? "" : "s"} for AI reading.`
        : "Preparing the menu for AI reading.",
      label: "Preparing",
      percent: 22,
      reassurance: WAIT_REASSURANCE,
    };
  }

  return {
    detail: "Starting the menu upload.",
    label: "Uploading",
    percent: 10,
    reassurance: WAIT_REASSURANCE,
  };
}

export function MenuParseProgress({
  parseJob,
}: {
  parseJob: MenuParseJob;
}) {
  if (!parseJob) {
    return null;
  }

  const phase = getPhase(parseJob);
  const { completedUploads, totalUploads } = getUploadCounts(parseJob);
  const uploadDetail =
    totalUploads && parseJob.status !== "ready" && parseJob.status !== "failed"
      ? `${completedUploads} of ${totalUploads} menu upload${
          totalUploads === 1 ? "" : "s"
        } read.`
      : null;
  const ariaValueText = [
    `${phase.label}. ${phase.detail}`,
    uploadDetail,
    phase.reassurance,
  ]
    .filter(Boolean)
    .join(" ");
  const isActive = parseJob.status !== "ready" && parseJob.status !== "failed";

  return (
    <div className="mt-3 space-y-3">
      <div className="flex items-start gap-3">
        <div
          aria-hidden="true"
          className={`parse-activity-mark${isActive ? "" : " parse-activity-mark-quiet"}`}
        />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-foreground">
            {phase.label}
          </p>
          <p className="text-sm leading-6 text-foreground-2">{phase.detail}</p>
          {uploadDetail ? (
            <p className="text-sm leading-6 text-foreground-2">
              {uploadDetail}
            </p>
          ) : null}
        </div>
      </div>
      <div
        aria-label="Approximate menu reading progress"
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={phase.percent}
        aria-valuetext={ariaValueText}
        className="h-3 overflow-hidden rounded-full border border-accent-border bg-surface-2"
        role="progressbar"
      >
        <div
          className={`h-full rounded-full bg-accent transition-[width] duration-500${
            isActive ? " parse-progress-fill" : ""
          }`}
          style={{ width: `${phase.percent}%` }}
        />
      </div>
      {phase.reassurance ? (
        <p className="text-sm leading-6 text-foreground-2">
          {phase.reassurance}
        </p>
      ) : null}
    </div>
  );
}
