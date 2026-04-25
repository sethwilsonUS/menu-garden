"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { PlateSeedlingMark } from "./brand-mark";
import { SiteNavLinks } from "./SiteNavLinks";
import { ThemeToggle } from "./ThemeToggle";

const mobileMenuId = "mobile-navigation";

function HamburgerIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="20"
      viewBox="0 0 24 24"
      width="20"
    >
      <path
        d="M4 6h16M4 12h16M4 18h16"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="20"
      viewBox="0 0 24 24"
      width="20"
    >
      <path
        d="M6 6l12 12M18 6 6 18"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export function AccessibleLayout({ children }: { children: ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const previousPathnameRef = useRef(pathname);

  const closeMobileMenu = useCallback((restoreFocus = true) => {
    setMobileMenuOpen(false);
    if (restoreFocus) {
      menuButtonRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    if (pathname === previousPathnameRef.current) {
      return;
    }

    previousPathnameRef.current = pathname;
    closeMobileMenu(false);
  }, [closeMobileMenu, pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMobileMenu();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closeMobileMenu, mobileMenuOpen]);

  useEffect(() => {
    if (!mobileMenuOpen || !mobileMenuRef.current) {
      return;
    }

    const firstFocusable = mobileMenuRef.current.querySelector<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    firstFocusable?.focus();
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!mobileMenuOpen || !mobileMenuRef.current) {
      return;
    }

    const menu = mobileMenuRef.current;
    const handleTab = (event: KeyboardEvent) => {
      if (event.key !== "Tab") {
        return;
      }

      const focusable = menu.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );

      if (!focusable.length) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleTab);
    return () => document.removeEventListener("keydown", handleTab);
  }, [mobileMenuOpen]);

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <header className="navbar" role="banner">
        <nav
          aria-label="Main navigation"
          className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8"
        >
          <Link
            className="flex items-center gap-2 font-display text-base font-semibold text-foreground no-underline"
            href="/"
          >
            <PlateSeedlingMark className="text-accent" size={25} />
            <span className="whitespace-nowrap">Menu Garden</span>
          </Link>

          <div className="hidden items-center gap-2 sm:flex">
            <SiteNavLinks variant="desktop" />
            <ThemeToggle />
          </div>

          <div className="flex items-center gap-1 sm:hidden">
            <ThemeToggle />
            <button
              aria-controls={mobileMenuId}
              aria-expanded={mobileMenuOpen}
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              className="icon-button"
              onClick={() => setMobileMenuOpen((open) => !open)}
              ref={menuButtonRef}
              type="button"
            >
              {mobileMenuOpen ? <CloseIcon /> : <HamburgerIcon />}
            </button>
          </div>
        </nav>

        {mobileMenuOpen ? (
          <div
            aria-label="Mobile navigation"
            className="absolute left-0 right-0 top-full border-b border-border bg-surface-nav shadow-[0_14px_28px_rgba(0,0,0,0.12)] backdrop-blur-2xl sm:hidden"
            id={mobileMenuId}
            ref={mobileMenuRef}
            role="navigation"
          >
            <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-4">
              <SiteNavLinks variant="mobile" />
            </div>
          </div>
        ) : null}
      </header>

      <main
        className="min-h-[calc(100vh-48px)] pt-12"
        id="main-content"
        role="main"
        tabIndex={-1}
      >
        {children}
      </main>

      <footer className="border-t border-border py-8" role="contentinfo">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <PlateSeedlingMark className="text-accent" size={22} />
              <span className="font-display text-lg font-semibold text-foreground">
                Menu Garden
              </span>
            </div>
            <nav
              aria-label="Footer navigation"
              className="flex flex-wrap items-center gap-x-4 gap-y-2"
            >
              <SiteNavLinks variant="footer" />
            </nav>
          </div>

          <hr className="garden-divider" />

          <div className="max-w-3xl text-sm leading-6 text-muted">
            <p>
              Menu Garden turns restaurant menu photos and PDFs into readable,
              searchable, askable menus.
            </p>
            <p className="mt-2 font-display italic">Plated with care.</p>
          </div>
        </div>
      </footer>
    </>
  );
}
