import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { action, internalQuery } from "./_generated/server";
import { v } from "convex/values";

type GoogleGeocodeResponse = {
  status?: string;
  error_message?: string;
  results?: Array<{
    geometry?: {
      location?: {
        lat?: number;
        lng?: number;
      };
    };
  }>;
};

type GooglePlace = {
  id?: string;
  displayName?: {
    text?: string;
  };
  formattedAddress?: string;
  location?: {
    latitude?: number;
    longitude?: number;
  };
  primaryTypeDisplayName?: {
    text?: string;
  };
  types?: string[];
};

type GooglePlacesResponse = {
  places?: GooglePlace[];
  error?: {
    message?: string;
  };
};

type LocalDiscoveryCandidate = {
  id: Id<"restaurants">;
  googlePlaceId?: string;
  name: string;
  address?: string;
  formattedAddress?: string;
  zipCode?: string;
  cuisineType?: string;
  latitude?: number;
  longitude?: number;
  menuAvailability: "public" | "private" | "none";
  menuId?: Id<"menus">;
  menuTitle?: string;
};

type NearbyRestaurantResult = {
  id?: Id<"restaurants">;
  googlePlaceId?: string;
  name: string;
  address?: string;
  formattedAddress?: string;
  zipCode?: string;
  cuisineType?: string;
  latitude?: number;
  longitude?: number;
  source: "google" | "local" | "merged";
  menuAvailability: "public" | "private" | "none";
  menuId?: Id<"menus">;
  menuTitle?: string;
  actionTarget:
    | {
        type: "menu";
        menuId: Id<"menus">;
      }
    | {
        type: "upload";
        restaurantName: string;
        googlePlaceId?: string;
        formattedAddress?: string;
        latitude?: number;
        longitude?: number;
        zipCode?: string;
        cuisineType?: string;
      };
};

type NearbySearchResponse = {
  status: "ready" | "setup_required";
  zipCode: string;
  message: string;
  results: NearbyRestaurantResult[];
};

const ZIP_CODE_PATTERN = /^\d{5}$/;

function normalizeLookup(value: string | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeAddress(value: string | undefined) {
  return normalizeLookup(value)
    .replace(/\bstreet\b/g, "st")
    .replace(/\bavenue\b/g, "ave")
    .replace(/\broad\b/g, "rd")
    .replace(/\bdrive\b/g, "dr")
    .replace(/\bnorth\b/g, "n")
    .replace(/\bsouth\b/g, "s")
    .replace(/\beast\b/g, "e")
    .replace(/\bwest\b/g, "w");
}

function localKey(candidate: { name: string; formattedAddress?: string; address?: string }) {
  return `${normalizeLookup(candidate.name)}|${normalizeAddress(
    candidate.formattedAddress ?? candidate.address
  )}`;
}

function googleKey(place: GooglePlace) {
  return `${normalizeLookup(place.displayName?.text)}|${normalizeAddress(
    place.formattedAddress
  )}`;
}

function getCuisineType(place: GooglePlace) {
  const displayName = place.primaryTypeDisplayName?.text;

  if (displayName) {
    return displayName;
  }

  return place.types
    ?.find((type) => type.endsWith("_restaurant") && type !== "restaurant")
    ?.replace(/_/g, " ");
}

function toUploadTarget(place: {
  name: string;
  googlePlaceId?: string;
  formattedAddress?: string;
  latitude?: number;
  longitude?: number;
  zipCode?: string;
  cuisineType?: string;
}) {
  return {
    type: "upload" as const,
    restaurantName: place.name,
    googlePlaceId: place.googlePlaceId,
    formattedAddress: place.formattedAddress,
    latitude: place.latitude,
    longitude: place.longitude,
    zipCode: place.zipCode,
    cuisineType: place.cuisineType,
  };
}

function toMenuTarget(menuId: Id<"menus">) {
  return {
    type: "menu" as const,
    menuId,
  };
}

function toSummary(candidate: LocalDiscoveryCandidate, source: "local" | "merged") {
  return {
    id: candidate.id,
    googlePlaceId: candidate.googlePlaceId,
    name: candidate.name,
    address: candidate.address,
    formattedAddress: candidate.formattedAddress,
    zipCode: candidate.zipCode,
    cuisineType: candidate.cuisineType,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    source,
    menuAvailability: candidate.menuAvailability,
    menuId: candidate.menuId,
    menuTitle: candidate.menuTitle,
    actionTarget: candidate.menuId
      ? toMenuTarget(candidate.menuId)
      : toUploadTarget({
          name: candidate.name,
          googlePlaceId: candidate.googlePlaceId,
          formattedAddress: candidate.formattedAddress,
          latitude: candidate.latitude,
          longitude: candidate.longitude,
          zipCode: candidate.zipCode,
          cuisineType: candidate.cuisineType,
        }),
  };
}

function toGoogleSummary(place: GooglePlace, zipCode: string) {
  const name = place.displayName?.text?.trim() || "Unnamed restaurant";
  const latitude = place.location?.latitude;
  const longitude = place.location?.longitude;
  const cuisineType = getCuisineType(place);

  return {
    googlePlaceId: place.id,
    name,
    formattedAddress: place.formattedAddress,
    address: place.formattedAddress,
    zipCode,
    cuisineType,
    latitude,
    longitude,
    source: "google" as const,
    menuAvailability: "none" as const,
    actionTarget: toUploadTarget({
      name,
      googlePlaceId: place.id,
      formattedAddress: place.formattedAddress,
      latitude,
      longitude,
      zipCode,
      cuisineType,
    }),
  };
}

async function geocodeZip(zipCode: string, apiKey: string) {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", zipCode);
  url.searchParams.set("components", "country:US|postal_code");
  url.searchParams.set("key", apiKey);

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error("Google Geocoding request failed.");
  }

  const json = (await response.json()) as GoogleGeocodeResponse;
  const location = json.results?.[0]?.geometry?.location;

  if (json.status && json.status !== "OK") {
    throw new Error(json.error_message ?? `Google Geocoding returned ${json.status}.`);
  }

  if (typeof location?.lat !== "number" || typeof location.lng !== "number") {
    throw new Error("Google Geocoding did not return coordinates for that ZIP code.");
  }

  return {
    latitude: location.lat,
    longitude: location.lng,
  };
}

async function searchGooglePlaces(args: {
  latitude: number;
  longitude: number;
  apiKey: string;
}) {
  const response = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": args.apiKey,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location,places.primaryTypeDisplayName,places.types",
    },
    body: JSON.stringify({
      includedTypes: ["restaurant"],
      maxResultCount: 10,
      locationRestriction: {
        circle: {
          center: {
            latitude: args.latitude,
            longitude: args.longitude,
          },
          radius: 8000,
        },
      },
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Google Places request failed: ${details}`);
  }

  const json = (await response.json()) as GooglePlacesResponse;

  if (json.error?.message) {
    throw new Error(json.error.message);
  }

  return json.places ?? [];
}

export const getLocalDiscoveryCandidates = internalQuery({
  args: {
    zipCode: v.string(),
    userId: v.optional(v.string()),
    googlePlaceIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<LocalDiscoveryCandidate[]> => {
    const byId = new Map<Id<"restaurants">, LocalDiscoveryCandidate>();
    const restaurantsByZip = await ctx.db
      .query("restaurants")
      .withIndex("by_zip", (q) => q.eq("zipCode", args.zipCode))
      .collect();

    for (const restaurant of restaurantsByZip) {
      byId.set(restaurant._id, {
        id: restaurant._id,
        googlePlaceId: restaurant.googlePlaceId,
        name: restaurant.name,
        address: restaurant.address,
        formattedAddress: restaurant.formattedAddress,
        zipCode: restaurant.zipCode,
        cuisineType: restaurant.cuisineType,
        latitude: restaurant.latitude,
        longitude: restaurant.longitude,
        menuAvailability: "none",
      });
    }

    for (const googlePlaceId of args.googlePlaceIds ?? []) {
      const restaurant = await ctx.db
        .query("restaurants")
        .withIndex("by_google_place", (q) => q.eq("googlePlaceId", googlePlaceId))
        .first();

      if (restaurant) {
        byId.set(restaurant._id, {
          id: restaurant._id,
          googlePlaceId: restaurant.googlePlaceId,
          name: restaurant.name,
          address: restaurant.address,
          formattedAddress: restaurant.formattedAddress,
          zipCode: restaurant.zipCode,
          cuisineType: restaurant.cuisineType,
          latitude: restaurant.latitude,
          longitude: restaurant.longitude,
          menuAvailability: "none",
        });
      }
    }

    const candidates = Array.from(byId.values());

    for (const candidate of candidates) {
      const menus = await ctx.db
        .query("menus")
        .withIndex("by_restaurant", (q) => q.eq("restaurantId", candidate.id))
        .collect();
      const visibleMenus = menus
        .filter((menu) => {
          const visibility = menu.visibility ?? "public";
          const isPublic =
            visibility === "public" ||
            (visibility !== "unlisted" && menu.status === "published");
          const isPrivateForUser =
            args.userId &&
            menu.uploadedByUserId === args.userId &&
            (menu.status === "ready" || menu.status === "published");

          return isPrivateForUser || (isPublic && menu.status !== "archived");
        })
        .sort((a, b) => b.createdAt - a.createdAt);
      const preferredMenu =
        visibleMenus.find((menu) => {
          const visibility = menu.visibility ?? "public";
          return (
            visibility === "public" ||
            (visibility !== "unlisted" && menu.status === "published")
          );
        }) ?? visibleMenus[0];

      if (preferredMenu) {
        const isPrivate =
          preferredMenu.visibility === "private" &&
          preferredMenu.uploadedByUserId === args.userId;

        candidate.menuAvailability = isPrivate ? "private" : "public";
        candidate.menuId = preferredMenu._id;
        candidate.menuTitle = preferredMenu.title;
      }
    }

    return candidates;
  },
});

export const searchNearby = action({
  args: { zipCode: v.string() },
  handler: async (ctx, args): Promise<NearbySearchResponse> => {
    const zipCode = args.zipCode.trim();

    if (!ZIP_CODE_PATTERN.test(zipCode)) {
      throw new Error("Enter a 5-digit U.S. ZIP code.");
    }

    const identity = await ctx.auth.getUserIdentity();
    const googleGeocodingKey = process.env.GOOGLE_GEOCODING_API_KEY;
    const googlePlacesKey = process.env.GOOGLE_PLACES_API_KEY;

    if (!googleGeocodingKey || !googlePlacesKey) {
      const localCandidates: LocalDiscoveryCandidate[] = await ctx.runQuery(
        internal.restaurants.getLocalDiscoveryCandidates,
        {
          zipCode,
          userId: identity?.subject,
        }
      );

      return {
        status: "setup_required" as const,
        zipCode,
        message: "Nearby search is limited right now. You can still add a menu.",
        results: (localCandidates as LocalDiscoveryCandidate[]).map((candidate) =>
          toSummary(candidate, "local")
        ),
      };
    }

    const location = await geocodeZip(zipCode, googleGeocodingKey);
    const googlePlaces = await searchGooglePlaces({
      ...location,
      apiKey: googlePlacesKey,
    });
    const localCandidates = (await ctx.runQuery(
      internal.restaurants.getLocalDiscoveryCandidates,
      {
        zipCode,
        userId: identity?.subject,
        googlePlaceIds: googlePlaces
          .map((place) => place.id)
          .filter((placeId): placeId is string => Boolean(placeId)),
      }
    )) as LocalDiscoveryCandidate[];
    const localsByGoogleId = new Map(
      localCandidates
        .filter((candidate) => candidate.googlePlaceId)
        .map((candidate) => [candidate.googlePlaceId, candidate])
    );
    const localsByLookupKey = new Map(
      localCandidates.map((candidate) => [localKey(candidate), candidate])
    );
    const usedLocalIds = new Set<Id<"restaurants">>();
    const results: NearbyRestaurantResult[] = googlePlaces.map((place) => {
      const localCandidate =
        (place.id ? localsByGoogleId.get(place.id) : undefined) ??
        localsByLookupKey.get(googleKey(place));

      if (localCandidate) {
        usedLocalIds.add(localCandidate.id);
        return {
          ...toGoogleSummary(place, zipCode),
          ...toSummary(localCandidate, "merged"),
          googlePlaceId: localCandidate.googlePlaceId ?? place.id,
          formattedAddress: localCandidate.formattedAddress ?? place.formattedAddress,
          address: localCandidate.address ?? place.formattedAddress,
          latitude: localCandidate.latitude ?? place.location?.latitude,
          longitude: localCandidate.longitude ?? place.location?.longitude,
          cuisineType: localCandidate.cuisineType ?? getCuisineType(place),
        };
      }

      return toGoogleSummary(place, zipCode);
    });

    for (const localCandidate of localCandidates) {
      if (!usedLocalIds.has(localCandidate.id)) {
        results.push(toSummary(localCandidate, "local"));
      }
    }

    return {
      status: "ready" as const,
      zipCode,
      message: `${results.length} nearby restaurant${
        results.length === 1 ? "" : "s"
      } found.`,
      results,
    };
  },
});
