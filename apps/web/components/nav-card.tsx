import Link from "next/link";

export function NavCard({
  href,
  title,
  description,
  kicker,
}: {
  href: string;
  title: string;
  description: string;
  kicker: string;
}) {
  return (
    <Link
      className="result-link garden-bed menu-paper group flex min-h-52 flex-col justify-between gap-4 px-5 py-5 no-underline hover:-translate-y-0.5"
      href={href}
    >
      <div className="space-y-3">
        <p className="eyebrow">{kicker}</p>
        <h2 className="font-display text-2xl font-semibold">{title}</h2>
        <p className="text-sm leading-6 text-foreground-2">{description}</p>
      </div>
      <span className="text-sm font-semibold text-accent">Open route</span>
    </Link>
  );
}
