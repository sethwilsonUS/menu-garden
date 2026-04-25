import type { NearbySearchSummary } from "../types";
import { useAction } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../convex/_generated/api";

type UseNearbyResult = {
  data: NearbySearchSummary | null;
  results: NearbySearchSummary["results"];
  search: (zipCode: string) => Promise<NearbySearchSummary | null>;
  hasSearched: boolean;
  isLoading: boolean;
  error: string | null;
};

const zipPattern = /^\d{5}$/;

export function useNearby(initialZipCode?: string): UseNearbyResult {
  const searchNearby = useAction(api.restaurants.searchNearby);
  const [data, setData] = useState<NearbySearchSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(
    async (zipCode: string) => {
      const trimmedZipCode = zipCode.trim();

      setHasSearched(true);

      if (!zipPattern.test(trimmedZipCode)) {
        setError("Enter a 5-digit U.S. ZIP code.");
        setData(null);
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        const result = (await searchNearby({
          zipCode: trimmedZipCode,
        })) as NearbySearchSummary;
        setData(result);
        return result;
      } catch (searchError) {
        setData(null);
        setError(
          searchError instanceof Error
            ? searchError.message
            : "Nearby restaurants could not be loaded."
        );
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [searchNearby]
  );

  useEffect(() => {
    if (initialZipCode) {
      void search(initialZipCode);
    }
  }, [initialZipCode, search]);

  return {
    data,
    results: data?.results ?? [],
    search,
    hasSearched,
    isLoading,
    error,
  };
}
