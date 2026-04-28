"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@menu-garden/shared/convex/_generated/api";
import type {
  MenuItemSummary,
  MenuSummary,
  MenuVisualAssessment,
} from "@menu-garden/shared/types";
import { MenuParseProgress } from "./menu-parse-progress";

function dietaryLabel(item: MenuItemSummary) {
  const details = [
    item.price ? `Price: ${item.price}` : null,
    item.dietaryTags?.length ? `Dietary tags: ${item.dietaryTags.join(", ")}` : null,
    item.allergens?.length ? `Allergens: ${item.allergens.join(", ")}` : null,
    item.spiceLevel ? `Spice level: ${item.spiceLevel}` : null,
  ].filter(Boolean);

  return details.join(". ");
}

function PhotoVisibilityNote({
  assessment,
}: {
  assessment: MenuVisualAssessment;
}) {
  if (assessment.status !== "partial") {
    return null;
  }

  return (
    <section
      aria-labelledby="photo-visibility-note-heading"
      className="rounded-2xl border border-accent-border bg-accent-bg px-4 py-4"
    >
      <h3
        className="font-display text-xl font-semibold"
        id="photo-visibility-note-heading"
      >
        Photo visibility note
      </h3>
      {assessment.note ? (
        <p className="mt-2 text-sm leading-6 text-foreground-2">
          {assessment.note}
        </p>
      ) : null}
      {assessment.actionSteps.length ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-foreground-2">
          {assessment.actionSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function ParseGuidance({ assessment }: { assessment?: MenuVisualAssessment }) {
  if (!assessment?.actionSteps.length) {
    return null;
  }

  return (
    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-foreground-2">
      {assessment.actionSteps.map((step) => (
        <li key={step}>{step}</li>
      ))}
    </ul>
  );
}

function MenuContent({
  menu,
  showActions,
}: {
  menu: MenuSummary;
  showActions: boolean;
}) {
  const itemsByCategory = useMemo(() => {
    const grouped = new Map<string, MenuItemSummary[]>();

    for (const item of menu.items) {
      grouped.set(item.categoryId, [...(grouped.get(item.categoryId) ?? []), item]);
    }

    return grouped;
  }, [menu.items]);

  return (
    <article className="garden-bed menu-paper space-y-7 px-5 py-6 sm:px-6" id="menu-content">
      <header className="flex flex-wrap items-start justify-between gap-5">
        <div className="space-y-2">
          <p className="accent-pill w-fit">Restaurant menu</p>
          <h2 className="font-display text-3xl font-semibold">{menu.title}</h2>
          <p className="text-base leading-7 text-foreground-2">
            {menu.restaurant.name}
          </p>
        </div>
        {showActions ? (
          <div className="flex flex-wrap gap-3">
            <Link className="button-primary" href={`/chat/${menu.id}`}>
              Chat with this menu
            </Link>
            <Link className="button-secondary" href="/">
              Add another menu
            </Link>
          </div>
        ) : null}
      </header>

      {menu.parseJob?.visualAssessment ? (
        <PhotoVisibilityNote assessment={menu.parseJob.visualAssessment} />
      ) : null}

      {menu.categories.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface px-4 py-4 text-base leading-7 text-foreground-2">
          This menu is still being read. Accessible categories and items will appear
          here automatically.
        </p>
      ) : (
        menu.categories.map((category) => (
          <section className="space-y-4 rounded-2xl border border-border bg-surface px-4 py-4" key={category.id}>
            <header className="space-y-1">
              <h3 className="font-display text-2xl font-semibold">{category.name}</h3>
              {category.description ? (
                <p className="text-sm leading-6 text-foreground-2">
                  {category.description}
                </p>
              ) : null}
            </header>
            <ul className="space-y-3">
              {(itemsByCategory.get(category.id) ?? []).map((item) => (
                <li
                  aria-label={`${item.name}. ${dietaryLabel(item)}`}
                  className="rounded-xl border border-border bg-surface-2 px-4 py-4"
                  key={item.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <h4 className="text-lg font-semibold">{item.name}</h4>
                      {item.description ? (
                        <p className="text-sm leading-6 text-foreground-2">
                          {item.description}
                        </p>
                      ) : null}
                    </div>
                    {item.price ? (
                      <span
                        aria-label={`Price: ${item.price}`}
                        className="font-mono text-sm font-semibold text-accent"
                      >
                        {item.price}
                      </span>
                    ) : null}
                  </div>
                  {item.dietaryTags?.length || item.allergens?.length || item.spiceLevel ? (
                    <ul
                      aria-label="Dietary information"
                      className="mt-3 flex flex-wrap gap-2"
                      role="list"
                    >
                      {item.dietaryTags?.map((tag) => (
                        <li className="tag" key={`diet-${tag}`}>
                          {tag}
                        </li>
                      ))}
                      {item.allergens?.map((allergen) => (
                        <li className="tag" key={`allergen-${allergen}`}>
                          Contains {allergen}
                        </li>
                      ))}
                      {item.spiceLevel ? (
                        <li className="tag">Spice: {item.spiceLevel}</li>
                      ) : null}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </article>
  );
}

export function PublicMenuView({
  identifier,
  showActions = true,
}: {
  identifier: string;
  showActions?: boolean;
}) {
  const menu = useQuery(api.menus.getMenuByIdentifier, { identifier }) as
    | MenuSummary
    | null
    | undefined;

  if (menu === undefined) {
    return (
      <section aria-live="polite" className="garden-bed space-y-3 px-6 py-6" role="status">
        <div className="skeleton h-5 w-40" />
        <div className="skeleton h-4 w-full max-w-2xl" />
      </section>
    );
  }

  if (menu === null) {
    return (
      <section className="garden-bed menu-paper space-y-4 px-6 py-6">
        <h2 className="font-display text-3xl font-semibold">Menu not found</h2>
        <p className="text-base leading-7 text-foreground-2">
          This menu may still be getting ready, or the link may be out of date.
        </p>
        <Link className="button-secondary" href="/">
          Return home
        </Link>
      </section>
    );
  }

  return (
    <>
      {menu.parseJob && menu.parseJob.status !== "ready" ? (
        <section aria-live="polite" className="garden-bed px-6 py-4" role="status">
          <p className="font-semibold">{menu.parseJob.message}</p>
          <MenuParseProgress parseJob={menu.parseJob} />
          {menu.parseJob.errorMessage ? (
            <p className="mt-2 text-sm text-foreground-2">
              {menu.parseJob.errorMessage}
            </p>
          ) : null}
          <ParseGuidance assessment={menu.parseJob.visualAssessment} />
          {menu.parseJob.warnings?.length ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-foreground-2">
              {menu.parseJob.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
      <MenuContent menu={menu} showActions={showActions} />
    </>
  );
}
