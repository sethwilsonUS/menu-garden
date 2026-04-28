"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type SiteNavLinksProps = {
  variant: "desktop" | "mobile" | "footer";
};

const primaryLinks = [
  { href: "/", label: "Add menu" },
];

const linkClassByVariant: Record<SiteNavLinksProps["variant"], string> = {
  desktop:
    "nav-link text-sm font-medium text-foreground-2 no-underline transition-colors",
  mobile:
    "nav-link flex min-h-11 items-center rounded-lg px-3 py-3 text-sm font-semibold text-foreground no-underline",
  footer: "text-sm text-foreground-2 no-underline transition-colors hover:text-accent",
};

export function SiteNavLinks({ variant }: SiteNavLinksProps) {
  const pathname = usePathname();

  return (
    <>
      {primaryLinks.map((link) => {
        const isCurrent =
          link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);

        return (
          <Link
            aria-current={isCurrent ? "page" : undefined}
            className={linkClassByVariant[variant]}
            href={link.href}
            key={link.href}
          >
            {link.label}
          </Link>
        );
      })}
    </>
  );
}
