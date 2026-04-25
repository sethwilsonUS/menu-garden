"use client";

import type { NearbyRestaurantSummary } from "@menu-garden/shared/types";
import { useNearby } from "@menu-garden/shared/hooks";
import Link from "next/link";
import type { FormEvent } from "react";
import { useMemo, useRef, useState } from "react";

const zipPattern = /^\d{5}$/;

function getUploadHref(result: NearbyRestaurantSummary) {
  const target = result.actionTarget;
  const params = new URLSearchParams();

  if (target.type !== "upload") {
    return "/restaurant/upload";
  }

  params.set("restaurantName", target.restaurantName);

  if (target.googlePlaceId) {
    params.set("googlePlaceId", target.googlePlaceId);
  }

  if (target.formattedAddress) {
    params.set("formattedAddress", target.formattedAddress);
  }

  if (typeof target.latitude === "number") {
    params.set("latitude", String(target.latitude));
  }

  if (typeof target.longitude === "number") {
    params.set("longitude", String(target.longitude));
  }

  if (target.zipCode) {
    params.set("zipCode", target.zipCode);
  }

  if (target.cuisineType) {
    params.set("cuisineType", target.cuisineType);
  }

  return `/restaurant/upload?${params.toString()}`;
}

function getPrimaryAction(result: NearbyRestaurantSummary) {
  if (result.actionTarget.type === "menu") {
    return {
      href: `/menu/${result.actionTarget.menuId}`,
      label:
        result.menuAvailability === "private"
          ? "Open my uploaded menu"
          : "Open accessible menu",
    };
  }

  return {
    href: getUploadHref(result),
    label: "Upload menu",
  };
}

function availabilityLabel(result: NearbyRestaurantSummary) {
  if (result.menuAvailability === "private") {
    return "Your uploaded menu is available";
  }

  if (result.menuAvailability === "public") {
    return "Accessible menu available";
  }

  return "No accessible menu yet";
}

function sourceLabel(result: NearbyRestaurantSummary) {
  if (result.source === "merged") {
    return "Matched listing";
  }

  if (result.source === "local") {
    return "Menu Garden listing";
  }

  return "Restaurant listing";
}

function ResultCard({ result }: { result: NearbyRestaurantSummary }) {
  const action = getPrimaryAction(result);

  return (
    <li className="garden-bed bg-surface px-5 py-5">
      <article className="space-y-4">
        <header className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <span className="tag">{availabilityLabel(result)}</span>
            <span className="tag">{sourceLabel(result)}</span>
          </div>
          <h3 className="font-display text-2xl font-semibold">{result.name}</h3>
          {result.formattedAddress ?? result.address ? (
            <p className="text-sm leading-6 text-foreground-2">
              {result.formattedAddress ?? result.address}
            </p>
          ) : null}
          {result.cuisineType ? (
            <p className="text-sm leading-6 text-foreground-2">
              {result.cuisineType}
            </p>
          ) : null}
        </header>

        {result.menuTitle ? (
          <p className="text-sm leading-6 text-foreground-2">
            Menu: {result.menuTitle}
          </p>
        ) : null}

        <Link
          className={result.actionTarget.type === "menu" ? "button-primary" : "button-secondary"}
          href={action.href}
        >
          {action.label}
        </Link>
      </article>
    </li>
  );
}

export function NearbySearch() {
  const zipInputRef = useRef<HTMLInputElement>(null);
  const [zipCode, setZipCode] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const { data, results, search, hasSearched, isLoading, error } = useNearby();
  const statusMessage = useMemo(() => {
    if (isLoading) {
      return "Searching nearby restaurants.";
    }

    if (validationError || error) {
      return validationError ?? error;
    }

    if (data) {
      return data.message;
    }

    return "Enter a ZIP code to find nearby restaurants.";
  }, [data, error, isLoading, validationError]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedZipCode = zipCode.trim();

    if (!zipPattern.test(trimmedZipCode)) {
      setValidationError("Enter a 5-digit U.S. ZIP code.");
      zipInputRef.current?.focus();
      return;
    }

    setValidationError(null);
    await search(trimmedZipCode);
  }

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.65fr)]">
      <article className="garden-bed menu-paper space-y-5 px-6 py-6">
        <header className="space-y-2">
          <h2 className="font-display text-3xl font-semibold">
            Find accessible menus nearby
          </h2>
          <p className="text-base leading-7 text-foreground-2">
            Search by ZIP code. If a restaurant does not have an accessible menu yet,
            upload one and Menu Garden will read it for you.
          </p>
        </header>

        <form className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className="block text-sm font-semibold" htmlFor="nearby-zip">
              ZIP code
            </label>
            <input
              aria-describedby="nearby-status"
              aria-invalid={Boolean(validationError || error)}
              autoComplete="postal-code"
              className="input-field"
              id="nearby-zip"
              inputMode="numeric"
              maxLength={5}
              onChange={(event) => {
                setZipCode(event.target.value);
                if (validationError) {
                  setValidationError(null);
                }
              }}
              pattern="[0-9]{5}"
              placeholder="75701"
              ref={zipInputRef}
              value={zipCode}
            />
          </div>
          <button
            className="button-primary self-end disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isLoading}
            type="submit"
          >
            {isLoading ? "Searching" : "Search"}
          </button>
        </form>

        <div
          aria-live="polite"
          className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm font-semibold text-foreground-2"
          id="nearby-status"
          role="status"
        >
          {statusMessage}
        </div>

        {data?.status === "setup_required" ? (
          <section className="rounded-2xl border border-accent-border bg-accent-bg px-4 py-4">
            <h3 className="text-base font-semibold">Nearby search is limited right now</h3>
            <p className="mt-2 text-sm leading-6 text-foreground-2">
              You can still add a menu yourself and get an accessible version.
            </p>
          </section>
        ) : null}

        {hasSearched && !isLoading && !results.length ? (
          <p className="rounded-2xl border border-border bg-surface px-4 py-4 text-sm leading-6 text-foreground-2">
            No restaurants found for this ZIP code yet.
          </p>
        ) : null}

        {results.length ? (
          <ol aria-label="Nearby restaurants" className="space-y-4">
            {results.map((result) => (
              <ResultCard
                key={result.id ?? result.googlePlaceId ?? `${result.name}-${result.address}`}
                result={result}
              />
            ))}
          </ol>
        ) : null}
      </article>

      <aside className="garden-bed menu-paper space-y-4 px-6 py-6">
        <h2 className="font-display text-2xl font-semibold">How this works</h2>
        <p className="text-sm leading-6 text-foreground-2">
          Search by ZIP code, open an accessible menu when one is available, or
          add a menu yourself.
        </p>
        <div className="flex flex-wrap gap-2" aria-label="Discovery states">
          <span className="tag">Open menu</span>
          <span className="tag">Upload menu</span>
          <span className="tag">Private uploads</span>
        </div>
      </aside>
    </section>
  );
}
