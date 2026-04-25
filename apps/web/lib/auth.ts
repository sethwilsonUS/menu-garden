import {
  getUserRole,
  type MenuGardenPublicMetadata,
} from "@menu-garden/shared/types/auth";

export function resolveRole(
  metadata: MenuGardenPublicMetadata | undefined | null
) {
  return getUserRole(metadata ?? undefined);
}
