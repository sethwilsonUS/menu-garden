"use client";

import Link from "next/link";
import { Component, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "@menu-garden/shared/convex/_generated/api";
import type { PublicMenuSummary } from "@menu-garden/shared/types";

type PublicMenuListBoundaryState = {
  hasError: boolean;
};

class PublicMenuListBoundary extends Component<
  { children: ReactNode },
  PublicMenuListBoundaryState
> {
  state: PublicMenuListBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): PublicMenuListBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Public menu list could not load.", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className="garden-bed menu-paper space-y-4 px-6 py-6" role="status">
          <h2 className="font-display text-2xl font-semibold">
            Browse menus is still getting ready
          </h2>
          <p className="max-w-2xl text-base leading-7 text-foreground-2">
            Public menus could not load just now. Try refreshing this page in a
            moment.
          </p>
          <button
            className="button-secondary"
            onClick={() => this.setState({ hasError: false })}
            type="button"
          >
            Try again
          </button>
        </section>
      );
    }

    return this.props.children;
  }
}

function formatMenuDate(timestamp?: number) {
  if (!timestamp) {
    return "Recently added";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(new Date(timestamp));
}

function PublicMenuListContent() {
  const menus = useQuery(api.menus.listPublicMenus, {}) as
    | PublicMenuSummary[]
    | undefined;

  if (menus === undefined) {
    return (
      <section aria-live="polite" className="garden-bed space-y-3 px-6 py-6" role="status">
        <div className="skeleton h-5 w-48" />
        <div className="skeleton h-4 w-full max-w-xl" />
      </section>
    );
  }

  if (menus.length === 0) {
    return (
      <section className="garden-bed menu-paper space-y-4 px-6 py-6">
        <p className="accent-pill w-fit">Fresh bed</p>
        <h2 className="font-display text-3xl font-semibold">No public menus yet</h2>
        <p className="max-w-2xl text-base leading-7 text-foreground-2">
          Named menus will appear here after someone saves them publicly.
        </p>
        <Link className="button-primary" href="/">
          Add a menu
        </Link>
      </section>
    );
  }

  return (
    <section aria-labelledby="public-menus-heading" className="space-y-4">
      <h2 className="sr-only" id="public-menus-heading">
        Public menus
      </h2>
      <ul className="grid gap-4 md:grid-cols-2" role="list">
        {menus.map((menu) => (
          <li key={menu.id}>
            <article className="result-link garden-bed menu-paper flex h-full flex-col gap-4 px-5 py-5">
              <div className="space-y-2">
                <p className="eyebrow">{menu.restaurantName}</p>
                <h3 className="font-display text-2xl font-semibold">
                  <Link href={`/menu/${menu.id}`}>{menu.title}</Link>
                </h3>
                <p className="text-sm leading-6 text-foreground-2">
                  {menu.itemCount} item{menu.itemCount === 1 ? "" : "s"} across{" "}
                  {menu.categoryCount} section{menu.categoryCount === 1 ? "" : "s"}.
                </p>
              </div>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
                <p className="font-mono text-sm text-muted">
                  {formatMenuDate(menu.processedAt ?? menu.createdAt)}
                </p>
                <Link className="button-secondary text-sm" href={`/menu/${menu.id}`}>
                  Open menu
                </Link>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PublicMenuList() {
  return (
    <PublicMenuListBoundary>
      <PublicMenuListContent />
    </PublicMenuListBoundary>
  );
}
