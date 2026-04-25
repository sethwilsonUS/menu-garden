import type { ReactNode } from "react";

export function SiteShell({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      <section className="grid gap-6 py-4 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)] lg:items-end">
        <div className="space-y-4">
          <p className="accent-pill w-fit">{eyebrow}</p>
          <h1 className="max-w-3xl font-display text-[clamp(2.25rem,6vw,4rem)] font-semibold leading-[1.05] text-foreground">
            {title}
          </h1>
          <p className="max-w-2xl text-base leading-7 text-foreground-2 sm:text-lg">
            {description}
          </p>
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-3 lg:justify-end">{actions}</div>
        ) : null}
      </section>
      {children}
    </div>
  );
}
