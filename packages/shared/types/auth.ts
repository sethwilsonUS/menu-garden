export const USER_ROLES = ["consumer", "restaurant_owner"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export type MenuGardenPublicMetadata = {
  role?: UserRole;
};

export function getUserRole(publicMetadata: unknown): UserRole {
  const metadata = publicMetadata as MenuGardenPublicMetadata | null | undefined;

  if (
    metadata &&
    typeof metadata === "object" &&
    metadata.role === "restaurant_owner"
  ) {
    return "restaurant_owner";
  }

  return "consumer";
}

export function isRestaurantOwner(publicMetadata: unknown): boolean {
  return getUserRole(publicMetadata) === "restaurant_owner";
}
