import type { MenuSummary } from "../types";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

type UseMenuResult = {
  data: MenuSummary | null;
  isLoading: boolean;
  error: string | null;
};

export function useMenu(menuId: string | null | undefined): UseMenuResult {
  const data = useQuery(
    api.menus.getMenu,
    menuId ? { menuId: menuId as Id<"menus"> } : "skip"
  ) as MenuSummary | null | undefined;

  return {
    data: data ?? null,
    isLoading: data === undefined,
    error: data === null ? "Menu not found." : null,
  };
}
